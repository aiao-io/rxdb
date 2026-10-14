/**
 * @fileoverview 替代组回归测试（US-512 非 ECN：AC#5/#7/#10/#11/#12/#13/#15 存储与发布面）
 *
 * 双后端同断言：单行 CHECK（proportional × allow_mix=false）、成员跨头保存拒绝、
 * 已发布头的组/成员写入拒绝、概率 9 位小数域、发布转移的切片聚合校验
 * （恰好一个 primary / priority 不并列 / proportional 合计恒 1，定点整数比较）。
 */

import { RxDBCheckViolationError } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { explodeBom } from '../quantity/explosion.js';
import { BomHeader, BomItem, BomLine, BomLineOccurrence, BomSubstituteGroup } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomDecimalFormatError, BomPublishValidationError, BomWriteProtocolError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const CONTEXT = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: day('2026-01-01') };

const makeItem = async (prefix: string): Promise<BomItem> => {
  const item = new BomItem();
  item.itemNo = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  await item.save();
  return item;
};

/** 建 draft 头（挂在指定物料已发布修订下）。 */
const setup = async (adapter: BomTestAdapter, parent: BomItem): Promise<BomHeader> => {
  await loadHistory(adapter, {
    batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
    revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
    headers: []
  });
  const table = adapter.name === 'wa-sqlite' ? `"bom$item_revision"` : `"bom"."item_revision"`;
  const rows = (await adapter.rawQuery(`SELECT "id" FROM ${table} WHERE "itemId" = '${parent.id}'`)) as unknown as
    | { results: { rows: unknown[][] }[] }
    | { rows: unknown[][] };
  const shape = 'results' in rows ? rows.results[0] : rows;
  const header = new BomHeader();
  header.parentRevisionId = String(shape.rows[0][0]);
  header.bomType = 'ebom';
  header.orgId = 'org-x';
  await header.save();
  return header;
};

/** 建组。 */
const makeGroup = async (
  header: BomHeader,
  overrides: Partial<BomSubstituteGroup> = {}
): Promise<BomSubstituteGroup> => {
  const group = new BomSubstituteGroup();
  group.headerId = header.id;
  group.code = `G-${Math.random().toString(36).slice(2, 6)}`;
  group.strategy = 'proportional';
  group.allowMix = true;
  Object.assign(group, overrides);
  await group.save();
  return group;
};

/** 建组成员（挂在行的发生项上）。 */
const makeMember = async (
  header: BomHeader,
  group: BomSubstituteGroup,
  child: BomItem,
  overrides: Partial<BomLineOccurrence> = {}
): Promise<BomLineOccurrence> => {
  const line = new BomLine();
  line.headerId = header.id;
  line.lineNo = 10 + Math.floor(Math.random() * 1000);
  await line.save();
  const occurrence = new BomLineOccurrence();
  occurrence.lineId = line.id;
  occurrence.childItemId = child.id;
  occurrence.qty = '1';
  occurrence.uom = 'pcs';
  occurrence.effectiveFrom = day('2026-01-01');
  occurrence.substituteGroupId = group.id;
  occurrence.substituteRole = 'substitute';
  occurrence.usageProbability = '0.5';
  occurrence.equivQty = '1';
  Object.assign(occurrence, overrides);
  await occurrence.save();
  return occurrence;
};

for (const backend of BACKENDS) {
  describe(`替代组 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('AC#10 proportional × allow_mix=false：保存组即拒（单行 CHECK）', async () => {
      const parent = await makeItem('sub-p');
      const header = await setup(adapter, parent);
      const rejected = await makeGroup(header, { strategy: 'proportional', allowMix: false }).then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).toBeInstanceOf(RxDBCheckViolationError);
      // 合法组合照常
      await expect(makeGroup(header, { strategy: 'priority', allowMix: false })).resolves.toBeDefined();
      await expect(makeGroup(header, { strategy: 'manual', allowMix: false })).resolves.toBeDefined();
    });

    it('AC#11 ② 成员引用另一张头的组：保存即拒（组合外键语义）', async () => {
      const parentA = await makeItem('sub-a');
      const parentB = await makeItem('sub-b');
      const headerA = await setup(adapter, parentA);
      const headerB = await setup(adapter, parentB);
      const group = await makeGroup(headerA);
      const child = await makeItem('sub-child');
      const rejected = await makeMember(headerB, group, child).then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).not.toBeNull();
    });

    it('AC#13 已发布头的组成员改/删拒绝', async () => {
      const parent = await makeItem('sub-r');
      const header = await setup(adapter, parent);
      const child = await makeItem('sub-r-child');
      const group = await makeGroup(header);
      const member = await makeMember(header, group, child, { substituteRole: 'primary', usageProbability: '0.5' });
      await makeMember(header, group, await makeItem('sub-r-child2'), { usageProbability: '0.5' });
      header.state = 'released';
      await header.save();
      // 改概率
      member.usageProbability = '0.9';
      const updated = await member.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(updated).toBeInstanceOf(BomWriteProtocolError);
      // 删成员
      const removed = await member.remove().then(
        () => null,
        (error: unknown) => error
      );
      expect(removed).toBeInstanceOf(BomWriteProtocolError);
      // 改组
      group.allowMix = false;
      const groupUpdated = await group.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(groupUpdated).toBeInstanceOf(BomWriteProtocolError);
    });

    it('AC#15 ① 概率 9 位小数域：越界两后端保存即拒', async () => {
      const parent = await makeItem('sub-15');
      const header = await setup(adapter, parent);
      const group = await makeGroup(header);
      const child = await makeItem('sub-15-child');
      const viaApi = await makeMember(header, group, child, { usageProbability: '0.5000000000000001' }).then(
        () => null,
        (error: unknown) => error
      );
      expect(viaApi).toBeInstanceOf(BomDecimalFormatError);
      // 直连 SQL 同样拒绝
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 500 + Math.floor(Math.random() * 100);
      await line.save();
      const table = backend === 'wa-sqlite' ? `"bom$bom_line_occurrence"` : `"bom"."bom_line_occurrence"`;
      const raw = await adapter.rawQuery(
        `INSERT INTO ${table} ("id", "lineId", "childItemId", "qty", "uom", "effectiveFrom", "substituteGroupId", "usageProbability") VALUES ('${crypto.randomUUID()}', '${line.id}', '${child.id}', '1', 'pcs', '2026-01-01T00:00:00.000Z', '${group.id}', '0.5000000000000001')`
      ).then(
        () => null,
        (error: unknown) => error
      );
      expect(raw).not.toBeNull();
      expect(String((raw as Error).message)).toContain('rxdb:bom_decimal_format:usageProbability');
    });

    it('AC#5 发布合计校验：合计 1 通过、1.01 拒绝并给实际合计', async () => {
      const parent = await makeItem('sub-5');
      const header = await setup(adapter, parent);
      const group = await makeGroup(header);
      const a = await makeItem('sub-5-a');
      const b = await makeItem('sub-5-b');
      const c = await makeItem('sub-5-c');
      await makeMember(header, group, a, { substituteRole: 'primary', usageProbability: null });
      await makeMember(header, group, b, { usageProbability: '0.5' });
      await makeMember(header, group, c, { usageProbability: '0.5' });
      header.state = 'released';
      await expect(header.save()).resolves.toBeDefined();
      // 再建一张头：合计 1.01 → 拒
      const parent2 = await makeItem('sub-5-p2');
      const header2 = await setup(adapter, parent2);
      const group2 = await makeGroup(header2);
      await makeMember(header2, group2, a, { substituteRole: 'primary', usageProbability: null });
      await makeMember(header2, group2, b, { usageProbability: '0.5' });
      await makeMember(header2, group2, c, { usageProbability: '0.51' });
      header2.state = 'released';
      const rejected = await header2.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).toBeInstanceOf(BomPublishValidationError);
      expect(String((rejected as Error).message)).toContain('1.01');
    });

    it('AC#7 priority 组两个成员 substitute_priority 并列：发布拒绝', async () => {
      const parent = await makeItem('sub-7');
      const header = await setup(adapter, parent);
      const group = await makeGroup(header, { strategy: 'priority', allowMix: true });
      const a = await makeItem('sub-7-a');
      const b = await makeItem('sub-7-b');
      await makeMember(header, group, a, { substituteRole: 'primary', usageProbability: null, substitutePriority: 1 });
      await makeMember(header, group, b, { usageProbability: null, substitutePriority: 1 });
      header.state = 'released';
      const rejected = await header.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).toBeInstanceOf(BomPublishValidationError);
    });

    it('AC#11 ① 两个 primary / 零成员组：发布拒绝', async () => {
      const parent = await makeItem('sub-11');
      const header = await setup(adapter, parent);
      const group = await makeGroup(header);
      const a = await makeItem('sub-11-a');
      const b = await makeItem('sub-11-b');
      await makeMember(header, group, a, { substituteRole: 'primary', usageProbability: null });
      await makeMember(header, group, b, { substituteRole: 'primary', usageProbability: null });
      header.state = 'released';
      const rejected = await header.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected).toBeInstanceOf(BomPublishValidationError);
      // 零成员组：另一张头
      const parent2 = await makeItem('sub-11-p2');
      const header2 = await setup(adapter, parent2);
      await makeGroup(header2);
      header2.state = 'released';
      const rejected2 = await header2.save().then(
        () => null,
        (error: unknown) => error
      );
      expect(rejected2).toBeInstanceOf(BomPublishValidationError);
    });

    it('AC#12 跨期 primary 切片：o1 截止、o2 同日接续，发布通过', async () => {
      const parent = await makeItem('sub-12');
      const header = await setup(adapter, parent);
      const group = await makeGroup(header, { strategy: 'priority', allowMix: true });
      const a = await makeItem('sub-12-a');
      await makeMember(header, group, a, {
        substituteRole: 'primary',
        usageProbability: null,
        effectiveFrom: day('2026-01-01'),
        effectiveTo: day('2026-11-01')
      });
      await makeMember(header, group, a, {
        substituteRole: 'primary',
        usageProbability: null,
        effectiveFrom: day('2026-11-01'),
        effectiveTo: null
      });
      header.state = 'released';
      await expect(header.save()).resolves.toBeDefined();
    });

    it('AC#15 ②③ 定点整数合计：0.999999999 拒绝、0.7/0.2/0.1 与 0.5/0.5 通过', async () => {
      const build = async (probabilities: string[]): Promise<unknown> => {
        const parent = await makeItem('sub-15b');
        const header = await setup(adapter, parent);
        const group = await makeGroup(header);
        const primary = await makeItem('sub-15b-p');
        await makeMember(header, group, primary, { substituteRole: 'primary', usageProbability: null });
        for (const probability of probabilities) {
          await makeMember(header, group, await makeItem('sub-15b-m'), { usageProbability: probability });
        }
        header.state = 'released';
        return header.save().then(
          () => null,
          (error: unknown) => error
        );
      };
      const short = await build(['0.5', '0.499999999']);
      expect(short).toBeInstanceOf(BomPublishValidationError);
      expect(String((short as Error).message)).toContain('0.999999999');
      expect(await build(['0.7', '0.2', '0.1'])).toBeNull();
      expect(await build(['0.5', '0.5'])).toBeNull();
    });

    it('成员查询：role / probability / equiv_qty 往返', async () => {
      const parent = await makeItem('sub-ro');
      const header = await setup(adapter, parent);
      const group = await makeGroup(header);
      const a = await makeItem('sub-ro-a');
      const member = await makeMember(header, group, a, { substituteRole: 'primary', usageProbability: null, equivQty: '2' });
      expect(member.substituteRole).toBe('primary');
      expect(member.equivQty).toBe('2');
    });

    it('AC#1 proportional 分摊 golden：primary 需求 100 → 50 / 60 / 10', async () => {
      const parent = await makeItem('sub-1');
      const header = await setup(adapter, parent);
      const group = await makeGroup(header);
      const a = await makeItem('sub-1-a');
      const b = await makeItem('sub-1-b');
      const c = await makeItem('sub-1-c');
      await makeMember(header, group, a, { substituteRole: 'primary', usageProbability: '0.5' });
      await makeMember(header, group, b, { usageProbability: '0.3', equivQty: '2' });
      await makeMember(header, group, c, { usageProbability: '0.2', equivQty: '0.5' });
      header.state = 'released';
      await header.save();
      const result = await explodeBom(adapter, CONTEXT, { parentRevisionId: header.parentRevisionId }, { plannedQty: { value: '100', uom: 'pcs' } });
      const qtyOf = (item: BomItem): string => result.requirementLines.find(line => line.itemId === item.id)?.qty ?? '';
      expect(qtyOf(a)).toBe('50');
      expect(qtyOf(b)).toBe('60');
      expect(qtyOf(c)).toBe('10');
    });

    it('AC#2 priority 组：只取有效成员中 substitute_priority 最高者', async () => {
      const parent = await makeItem('sub-2');
      const header = await setup(adapter, parent);
      const group = await makeGroup(header, { strategy: 'priority', allowMix: true });
      const a = await makeItem('sub-2-a');
      const b = await makeItem('sub-2-b');
      const c = await makeItem('sub-2-c');
      await makeMember(header, group, a, { substituteRole: 'primary', usageProbability: null, substitutePriority: 9 });
      await makeMember(header, group, b, { usageProbability: null, substitutePriority: 1, equivQty: '2' });
      await makeMember(header, group, c, { usageProbability: null, substitutePriority: 2 });
      header.state = 'released';
      await header.save();
      const result = await explodeBom(adapter, CONTEXT, { parentRevisionId: header.parentRevisionId }, { plannedQty: { value: '100', uom: 'pcs' } });
      expect(result.requirementLines.find(line => line.itemId === a.id)).toBeUndefined();
      expect(result.requirementLines.find(line => line.itemId === b.id)).toBeUndefined();
      expect(result.requirementLines.find(line => line.itemId === c.id)?.qty).toBe('100');
    });

    it('AC#4 priority allow_mix=false 且最高者可用量不足：拒绝并点名组', async () => {
      const parent = await makeItem('sub-4');
      const header = await setup(adapter, parent);
      const group = await makeGroup(header, { strategy: 'priority', allowMix: false });
      const a = await makeItem('sub-4-a');
      const b = await makeItem('sub-4-b');
      await makeMember(header, group, a, { substituteRole: 'primary', usageProbability: null, substitutePriority: 9 });
      await makeMember(header, group, b, { usageProbability: null, substitutePriority: 1, equivQty: '1' });
      header.state = 'released';
      await header.save();
      await expect(
        explodeBom(
          adapter,
          { ...CONTEXT, substituteAvailabilities: { [b.id]: { value: '60', uom: 'pcs' } } },
          { parentRevisionId: header.parentRevisionId },
          { plannedQty: { value: '100', uom: 'pcs' } }
        )
      ).rejects.toThrow(/最高者可用量不足/);
    });

    it('AC#8 manual 组未给选择：结果标 unresolved 列成员', async () => {
      const parent = await makeItem('sub-8');
      const header = await setup(adapter, parent);
      const group = await makeGroup(header, { strategy: 'manual', allowMix: false });
      const a = await makeItem('sub-8-a');
      const b = await makeItem('sub-8-b');
      await makeMember(header, group, a, { substituteRole: 'primary', usageProbability: null, substitutePriority: 9 });
      await makeMember(header, group, b, { usageProbability: null, substitutePriority: 1 });
      header.state = 'released';
      await header.save();
      const result = await explodeBom(adapter, CONTEXT, { parentRevisionId: header.parentRevisionId }, { plannedQty: { value: '100', uom: 'pcs' } });
      expect(result.unresolved.length).toBe(1);
      expect(result.unresolved[0].groupCode).toBe(group.code);
      expect(result.unresolved[0].candidates.map(candidate => candidate.itemId).sort()).toEqual([a.id, b.id].sort());
      // 给了唯一选择后放行
      const selected = await explodeBom(
        adapter,
        { ...CONTEXT, substituteSelections: { [group.code]: { memberKey: b.id } } },
        { parentRevisionId: header.parentRevisionId },
        { plannedQty: { value: '100', uom: 'pcs' } }
      );
      expect(selected.unresolved.length).toBe(0);
      expect(selected.requirementLines.find(line => line.itemId === b.id)?.qty).toBe('100');
    });
  });
}
