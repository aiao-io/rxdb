/**
 * @fileoverview 替代组切片口径回归测试（US-512 技术笔记「切片」）
 *
 * 头发布与 ECN 投影两道门对替代组聚合约束用同一口径：检查点 = 成员区间端点，每个非空原子切片
 * 恰好一个 primary、priority 不并列、proportional 定点合计恒 1（NULL 概率按 0 计、`1` 按 10⁹ 计）；
 * 历史装载（目标 ECN 属开启态批次）的发布与取消在转换期间暂缓投影校验，批次关闭时校验本批受影响头。
 * 无关既有头的不完整投影不阻止合法批次关闭。双后端同断言。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomEcn, BomHeader, BomItem, BomLine, BomLineOccurrence, BomSubstituteGroup } from '../entities.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomPublishValidationError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

type Role = 'primary' | 'substitute';

interface MemberSpec {
  role: Role;
  probability?: string | null;
  priority?: number | null;
  from?: string;
  to?: string | null;
  ecn?: BomEcn;
}

const settled = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => null,
    (error: unknown) => error
  );

for (const backend of BACKENDS) {
  describe(`替代组切片口径 [${backend}]`, () => {
    // 每组场景独占一个库：ECN 投影校验覆盖全部已发布头，跨场景残留会互相污染
    let adapter: BomTestAdapter;
    const isolatedDatabase = (): void => {
      beforeAll(async () => {
        adapter = await createBomTestAdapter(backend);
      });
      afterAll(async () => {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      });
    };

    const makeItem = async (prefix: string): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
      await item.save();
      return item;
    };

    /** 草稿头（父件经历史装载发布修订）。 */
    const draftHeader = async (prefix: string): Promise<BomHeader> => {
      const parent = await makeItem(`${prefix}-p`);
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: []
      });
      const table = backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"';
      const revisionId = await adapter.transaction(
        async executor =>
          String((await executor.query(`SELECT "id" FROM ${table} WHERE "itemId" = '${parent.id}'`)).rows[0][0]),
        false
      );
      const header = new BomHeader();
      header.parentRevisionId = revisionId;
      header.bomType = 'ebom';
      header.orgId = 'org-x';
      await header.save();
      return header;
    };

    const makeGroup = async (header: BomHeader, strategy: 'priority' | 'proportional'): Promise<BomSubstituteGroup> => {
      const group = new BomSubstituteGroup();
      group.headerId = header.id;
      group.code = `G-${Math.random().toString(36).slice(2, 6)}`;
      group.strategy = strategy;
      group.allowMix = true;
      await group.save();
      return group;
    };

    /** 组成员：每个成员一条独立逻辑行（成员互不构成同行有效域重叠）。 */
    const addMember = async (
      header: BomHeader,
      group: BomSubstituteGroup,
      spec: MemberSpec
    ): Promise<BomLineOccurrence> => {
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 10 + Math.floor(Math.random() * 100000);
      if (spec.ecn) line.ecnInId = spec.ecn.id;
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = (await makeItem('m')).id;
      occurrence.qty = '1';
      occurrence.uom = 'pcs';
      occurrence.effectiveFrom = spec.ecn ? spec.ecn.effectiveDate : day(spec.from ?? '2026-01-01');
      occurrence.effectiveTo = spec.to ? day(spec.to) : null;
      occurrence.substituteGroupId = group.id;
      occurrence.substituteRole = spec.role;
      occurrence.usageProbability = spec.probability ?? null;
      occurrence.substitutePriority = spec.priority ?? null;
      occurrence.equivQty = '1';
      if (spec.ecn) occurrence.ecnInId = spec.ecn.id;
      await occurrence.save();
      return occurrence;
    };

    /** 建草稿头 + 一个组 + 成员并尝试发布，返回发布错误（通过为 null）。 */
    const publishGroup = async (
      strategy: 'priority' | 'proportional',
      members: MemberSpec[]
    ): Promise<{ error: unknown; header: BomHeader; group: BomSubstituteGroup; occurrences: BomLineOccurrence[] }> => {
      const header = await draftHeader('slice');
      const group = await makeGroup(header, strategy);
      const occurrences: BomLineOccurrence[] = [];
      for (const member of members) occurrences.push(await addMember(header, group, member));
      header.state = 'released';
      const error = await settled(header.save());
      return { error, header, group, occurrences };
    };

    const makeEcn = async (prefix: string, effectiveDate: string): Promise<BomEcn> => {
      const ecn = new BomEcn();
      ecn.ecnNo = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
      ecn.effectiveDate = day(effectiveDate);
      await ecn.save();
      return ecn;
    };

    /** 截止成员（打 ECN 截止标记，区间同语句收窄为 ECN 生效日）。 */
    const cutOff = async (occurrence: BomLineOccurrence, ecn: BomEcn): Promise<void> => {
      occurrence.ecnOutId = ecn.id;
      occurrence.effectiveTo = ecn.effectiveDate;
      await occurrence.save();
    };

    describe('头发布按原子切片校验', () => {
      isolatedDatabase();

      it('跨期重叠的两对 0.5/0.5（桶合计各为 1）：重叠切片合计 2 拒绝并给出实际合计', async () => {
        const { error } = await publishGroup('proportional', [
          { role: 'primary', probability: '0.5' },
          { role: 'substitute', probability: '0.5' },
          { role: 'substitute', probability: '0.5', from: '2026-06-01' },
          { role: 'substitute', probability: '0.5', from: '2026-06-01' }
        ]);
        expect(error).toBeInstanceOf(BomPublishValidationError);
        expect(String((error as Error).message)).toContain('2.000000000');
      });

      it('跨期接续替换（每个切片合计 1，同区间桶合计不为 1）：发布通过', async () => {
        const { error } = await publishGroup('proportional', [
          { role: 'primary', probability: '0.5' },
          { role: 'substitute', probability: '0.5', to: '2026-06-01' },
          { role: 'substitute', probability: '0.5', from: '2026-06-01' }
        ]);
        expect(error).toBeNull();
      });

      it('primary 截止后替代成员仍生效：缺 primary 的切片拒绝（AC#9 口径）', async () => {
        const { error } = await publishGroup('priority', [
          { role: 'primary', priority: 1, to: '2026-06-01' },
          { role: 'substitute', priority: 2 }
        ]);
        expect(error).toBeInstanceOf(BomPublishValidationError);
        expect(String((error as Error).message)).toContain('primary');
      });

      it('成员概率 1 按 10⁹ 计：1 / 0 合计恰为 1，发布通过', async () => {
        const { error } = await publishGroup('proportional', [
          { role: 'primary', probability: '1' },
          { role: 'substitute', probability: '0' }
        ]);
        expect(error).toBeNull();
      });

      it('组只在后段有成员：前段空切片不校验，发布通过（AC#14 口径）', async () => {
        const { error } = await publishGroup('proportional', [
          { role: 'primary', probability: '0.4', from: '2026-06-01' },
          { role: 'substitute', probability: '0.6', from: '2026-06-01' }
        ]);
        expect(error).toBeNull();
      });
    });

    describe('ECN 投影与头发布同口径', () => {
      isolatedDatabase();

      it('ECN 以概率 1 的新 primary 接替整组：投影切片合计按 10⁹ 计，发布通过', async () => {
        const { error, header, group, occurrences } = await publishGroup('proportional', [
          { role: 'primary', probability: '0.5' },
          { role: 'substitute', probability: '0.5' }
        ]);
        expect(error).toBeNull();
        const ecn = await makeEcn('s1', '2099-01-01');
        for (const occurrence of occurrences) await cutOff(occurrence, ecn);
        await addMember(header, group, { role: 'primary', probability: '1', ecn });
        ecn.state = 'released';
        await expect(ecn.save()).resolves.toBeDefined();
      });

      it('ECN 引入的 proportional 切片全员概率为空：按 0 计合计 ≠ 1，发布拒绝', async () => {
        const { error, header, group, occurrences } = await publishGroup('proportional', [
          { role: 'primary', probability: '0.5' },
          { role: 'substitute', probability: '0.5' }
        ]);
        expect(error).toBeNull();
        const ecn = await makeEcn('s-null', '2099-01-01');
        for (const occurrence of occurrences) await cutOff(occurrence, ecn);
        await addMember(header, group, { role: 'primary', probability: null, ecn });
        await addMember(header, group, { role: 'substitute', probability: null, ecn });
        ecn.state = 'released';
        const rejected = await settled(ecn.save());
        expect(rejected).toBeInstanceOf(BomPublishValidationError);
        expect(String((rejected as Error).message)).toContain('0.000000000');
      });
    });

    describe('历史装载的投影豁免', () => {
      isolatedDatabase();

      it('无关既有非法投影不阻止历史发布和取消批次关闭，运行时转换仍校验', async () => {
        // 投影与头发布的可见集合不同：草稿 ECN 引入的成员计入头发布、不计入运行投影——
        // 头发布合计 1 通过，运行投影只剩 0.5，任何非豁免的 ECN 转换都会撞上这处投影违约
        const pending = await makeEcn('s-pending', '2026-01-01');
        const header = await draftHeader('hist');
        const group = await makeGroup(header, 'proportional');
        await addMember(header, group, { role: 'primary', probability: '0.5' });
        await addMember(header, group, { role: 'substitute', probability: '0.5', ecn: pending });
        header.state = 'released';
        await header.save();

        const runtime = await makeEcn('s-runtime', '2099-01-01');
        runtime.state = 'cancelled';
        const rejected = await settled(runtime.save());
        expect(rejected).toBeInstanceOf(BomPublishValidationError);

        const batchNo = `batch-${Math.random().toString(36).slice(2, 10)}`;
        const releasedId = crypto.randomUUID();
        const cancelledId = crypto.randomUUID();
        await expect(
          loadHistory(adapter, {
            batchNo,
            revisions: [],
            headers: [],
            ecns: [
              {
                id: releasedId,
                ecnNo: `h-rel-${Math.random().toString(36).slice(2, 8)}`,
                state: 'released',
                effectiveDate: day('2099-02-01')
              },
              {
                id: cancelledId,
                ecnNo: `h-can-${Math.random().toString(36).slice(2, 8)}`,
                state: 'cancelled',
                effectiveDate: day('2099-03-01')
              }
            ]
          })
        ).resolves.toBeUndefined();
        const dialect = bomSqlDialectFor(backend);
        const storedEcns = await adapter.rawQuery(
          `SELECT "id", "state", "historyBatchNo" FROM ${dialect.table('ecn')} WHERE "id" IN (${dialect.placeholder(0)}, ${dialect.placeholder(1)}) ORDER BY "state"`,
          [releasedId, cancelledId]
        );
        expect(storedEcns.rows).toEqual([
          [cancelledId, 'cancelled', batchNo],
          [releasedId, 'released', batchNo]
        ]);
        const batch = await adapter.rawQuery(
          `SELECT "state" FROM ${dialect.table('bom_history_batch')} WHERE "batchNo" = ${dialect.placeholder(0)}`,
          [batchNo]
        );
        expect(batch.rows).toEqual([['closed']]);
        const pendingState = await adapter.rawQuery(
          `SELECT "state", "historyBatchNo" FROM ${dialect.table('ecn')} WHERE "id" = ${dialect.placeholder(0)}`,
          [pending.id]
        );
        expect(pendingState.rows).toEqual([['draft', null]]);
      });
    });
  });
}
