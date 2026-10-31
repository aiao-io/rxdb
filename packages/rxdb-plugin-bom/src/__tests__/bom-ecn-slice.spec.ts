/**
 * @fileoverview ECN 转换后运行投影的切片校验回归测试
 * （US-515 AC#9/#23/#24/#25 + US-512 AC#6/#9/#14）
 *
 * 双后端（wa-sqlite / pglite）同断言：发布 / 改期 / 取消三种转换在「转换后运行投影」上
 * 按生效域切片整批校验——替代组检查点切片聚合（primary / priority / proportional）、
 * 位号计数与分摊合计对目标 ECN 引入的行逐行校验；一处冲突整批回滚，错误点名切片。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomEcn, BomHeader, BomItem, BomLine, BomLineOccurrence, BomSubstituteGroup } from '../entities.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { loadHistory } from '../resolve/history-loader.js';
import { resolveBom } from '../resolve/resolver.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

for (const backend of BACKENDS) {
  describe(`ECN 投影切片校验 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    const makeItem = async (prefix: string): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
      await item.save();
      await loadHistory(adapter, {
        batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
        revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
        headers: []
      });
      return item;
    };

    const makeEcn = async (prefix: string, effectiveDate: string): Promise<BomEcn> => {
      const ecn = new BomEcn();
      ecn.ecnNo = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
      ecn.effectiveDate = day(effectiveDate);
      await ecn.save();
      return ecn;
    };

    const releaseEcn = async (ecn: BomEcn): Promise<void> => {
      ecn.state = 'released';
      await ecn.save();
    };

    /** 已发布头（draft 期经 `beforeRelease` 追加构造）。 */
    const setupReleasedHeader = async (
      parent: BomItem,
      child: BomItem,
      beforeRelease?: (header: BomHeader) => Promise<void>
    ): Promise<BomHeader> => {
      const rows = (await adapter.rawQuery(
        `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${parent.id}'`
      )) as unknown as { rows: unknown[][] };
      const header = new BomHeader();
      header.parentRevisionId = String(rows.rows[0][0]);
      header.bomType = 'ebom';
      header.orgId = 'org-x';
      await header.save();
      if (beforeRelease) await beforeRelease(header);
      header.state = 'released';
      await header.save();
      return header;
    };

    /** 在头下建一行发生项（挂组、角色与概率；区间默认 [2026-01-01, +∞)）。 */
    const addMember = async (
      header: BomHeader,
      child: BomItem,
      groupId: string | null,
      role: 'primary' | 'substitute' | null,
      probability: string | null,
      priority: number | null,
      lineNo?: number,
      ecn?: BomEcn
    ): Promise<BomLineOccurrence> => {
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = lineNo ?? 10 + Math.floor(Math.random() * 10000);
      if (ecn) line.ecnInId = ecn.id;
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = child.id;
      occurrence.qty = '1';
      occurrence.uom = 'pcs';
      occurrence.effectiveFrom = ecn ? ecn.effectiveDate : day('2026-01-01');
      occurrence.substituteGroupId = groupId;
      occurrence.substituteRole = role;
      occurrence.usageProbability = probability;
      occurrence.substitutePriority = priority;
      occurrence.equivQty = '1';
      if (ecn) occurrence.ecnInId = ecn.id;
      await occurrence.save();
      return occurrence;
    };

    /** 截止旧成员并引入新成员（同逻辑行 / 新行，挂 ECN）。 */
    const replaceMember = async (
      header: BomHeader,
      child: BomItem,
      oldOccurrence: BomLineOccurrence,
      ecn: BomEcn,
      groupId: string | null,
      role: 'primary' | 'substitute',
      probability: string | null,
      priority: number | null
    ): Promise<BomLineOccurrence> => {
      oldOccurrence.ecnOutId = ecn.id;
      oldOccurrence.effectiveTo = ecn.effectiveDate;
      await oldOccurrence.save();
      return addMember(header, child, groupId, role, probability, priority, undefined, ecn);
    };

    it('AC#23 两张草稿同日各换一个成员：单独发布都拒（不借另一张草稿凑合法），合一张通过', async () => {
      const parent = await makeItem('s23-p');
      const child = await makeItem('s23-c');
      // 已发布 proportional 组 A/B = 0.5/0.5
      let groupId = '';
      let memberA!: BomLineOccurrence;
      let memberB!: BomLineOccurrence;
      const header = await setupReleasedHeader(parent, child, async draftHeader => {
        const group = new BomSubstituteGroup();
        group.headerId = draftHeader.id;
        group.code = `G-${Math.random().toString(36).slice(2, 6)}`;
        group.strategy = 'proportional';
        group.allowMix = true;
        await group.save();
        groupId = group.id;
        memberA = await addMember(draftHeader, child, group.id, 'primary', '0.5', null);
        memberB = await addMember(draftHeader, child, group.id, 'substitute', '0.5', null);
      });
      const e1 = await makeEcn('s23a', '2026-11-01');
      const e2 = await makeEcn('s23b', '2026-11-01');
      // E1 把 A 换成 0.6；E2 把 B 换成 0.4（都挂同一组）
      await replaceMember(header, child, memberA, e1, groupId, 'primary', '0.6', null);
      await replaceMember(header, child, memberB, e2, groupId, 'substitute', '0.4', null);
      // ① 单独发布 E1：投影 [2026-11-01, +∞) 合计 0.6 + 0.5 = 1.1 → 拒
      await expect(releaseEcn(e1)).rejects.toThrow(/合计|1\.1|≠ 1/);
      // ② 单独发布 E2：0.5 + 0.4 = 0.9 → 拒
      await expect(releaseEcn(e2)).rejects.toThrow(/合计|0\.9|≠ 1/);
      // ③ 改由一张 ECN 同时换 A、B：先撤回两张草稿（级联删除其引入、恢复截止标记），E3 截止 A、B 并引入
      // 0.6 / 0.4；另留一张同日草稿 E4 往同组再加 0.3 的成员——E4 未发布，不进 E3 的运行投影
      for (const draft of [e1, e2]) {
        draft.state = 'cancelled';
        await draft.save();
      }
      const e3 = await makeEcn('s23c', '2026-11-01');
      const dialect = bomSqlDialectFor(backend);
      for (const member of [memberA, memberB]) {
        // 直连 SQL 打截止标记：内存实体仍是撤回前的旧值，经实体保存会算错补丁
        await adapter.rawQuery(
          `UPDATE ${dialect.table('bom_line_occurrence')} SET "ecnOutId" = ${dialect.placeholder(0)}, "effectiveTo" = ${dialect.placeholder(1)} WHERE "id" = ${dialect.placeholder(2)}`,
          [e3.id, '2026-11-01T00:00:00.000Z', member.id]
        );
      }
      const nextA = await addMember(header, child, groupId, 'primary', '0.6', null, undefined, e3);
      const nextB = await addMember(header, child, groupId, 'substitute', '0.4', null, undefined, e3);
      const e4 = await makeEcn('s23d', '2026-11-01');
      const extra = await addMember(header, child, groupId, 'substitute', '0.3', null, undefined, e4);
      await expect(releaseEcn(e3)).resolves.toBeUndefined();
      const ecnRows = (await adapter.rawQuery(
        `SELECT "state" FROM ${dialect.table('ecn')} WHERE "id" = ${dialect.placeholder(0)}`,
        [e3.id]
      )) as unknown as { rows: unknown[][] };
      expect(ecnRows.rows.map(row => String(row[0]))).toEqual(['released']);
      // 发布后的运行投影：生效日起是 A' / B'（0.6 + 0.4），旧成员截止、E4 的成员不可见
      const after = await resolveBom(
        adapter,
        { bomType: 'ebom', orgId: 'org-x', asOfDate: day('2026-12-01') },
        { parentItemId: parent.id }
      );
      expect(after.occurrences.map(occurrence => occurrence.occurrenceId).sort()).toEqual([nextA.id, nextB.id].sort());
      expect(after.occurrences.map(occurrence => occurrence.occurrenceId)).not.toContain(extra.id);
      // E4 自己发布时才计入：0.6 + 0.4 + 0.3 = 1.3 → 拒
      await expect(releaseEcn(e4)).rejects.toThrow(/合计|1\.3|≠ 1/);
    });

    it('AC#24 另一张草稿让组合计非法：本次发布不受拖累；那张草稿自己发布时被拒', async () => {
      const parent = await makeItem('s24-p');
      const child = await makeItem('s24-c');
      let groupId = '';
      let memberA!: BomLineOccurrence;
      const header = await setupReleasedHeader(parent, child, async draftHeader => {
        const group = new BomSubstituteGroup();
        group.headerId = draftHeader.id;
        group.code = `G-${Math.random().toString(36).slice(2, 6)}`;
        group.strategy = 'proportional';
        group.allowMix = true;
        await group.save();
        groupId = group.id;
        memberA = await addMember(draftHeader, child, group.id, 'primary', '0.5', null);
        await addMember(draftHeader, child, group.id, 'substitute', '0.5', null);
      });
      // E3 单独把 A 换成 0.7（组合计非法）；E4 只改同头另一条普通行的 qty
      const e3 = await makeEcn('s24a', '2026-11-01');
      await replaceMember(header, child, memberA, e3, groupId, 'primary', '0.7', null);
      const e4 = await makeEcn('s24b', '2026-12-01');
      const plainLine = new BomLine();
      plainLine.headerId = header.id;
      plainLine.lineNo = 90 + Math.floor(Math.random() * 10000);
      plainLine.ecnInId = e4.id;
      await plainLine.save();
      const plainOccurrence = new BomLineOccurrence();
      plainOccurrence.lineId = plainLine.id;
      plainOccurrence.childItemId = child.id;
      plainOccurrence.qty = '2';
      plainOccurrence.uom = 'pcs';
      plainOccurrence.ecnInId = e4.id;
      plainOccurrence.effectiveFrom = day('2026-12-01');
      await plainOccurrence.save();
      // 发布 E4 通过（E3 未发布，不进投影；E4 的行不进组）
      await expect(releaseEcn(e4)).resolves.toBeUndefined();
      // E3 发布被拒：0.7 + 0.5 = 1.2
      await expect(releaseEcn(e3)).rejects.toThrow(/合计|1\.2|≠ 1/);
    });

    it('AC#25 priority 组：① 取消 E1 拒 ② 改期 12-15 拒 ③ 改期 11-15 接受 ④ 取消 E2 接受', async () => {
      const parent = await makeItem('s25-p');
      const child = await makeItem('s25-c');
      let groupId = '';
      let memberB!: BomLineOccurrence;
      let memberC!: BomLineOccurrence;
      const header = await setupReleasedHeader(parent, child, async draftHeader => {
        const group = new BomSubstituteGroup();
        group.headerId = draftHeader.id;
        group.code = `G-${Math.random().toString(36).slice(2, 6)}`;
        group.strategy = 'priority';
        group.allowMix = true;
        await group.save();
        groupId = group.id;
        await addMember(draftHeader, child, group.id, 'primary', null, 1);
        memberB = await addMember(draftHeader, child, group.id, 'substitute', null, 2);
        memberC = await addMember(draftHeader, child, group.id, 'substitute', null, 3);
      });
      // E1（2026-11-01，B→4）、E2（2026-12-01，C→2）
      const e1 = await makeEcn('s25a', '2026-11-01');
      await replaceMember(header, child, memberB, e1, groupId, 'substitute', null, 4);
      await releaseEcn(e1);
      const e2 = await makeEcn('s25b', '2026-12-01');
      await replaceMember(header, child, memberC, e2, groupId, 'substitute', null, 2);
      await releaseEcn(e2);
      // ① 取消 E1：切片 [2026-12-01, +∞) B(2) 与 C'(2) 并列 → 拒
      e1.state = 'cancelled';
      await expect(e1.save()).rejects.toThrow(/并列|priority/);
      // ② E1 改期到 2026-12-15：切片 [2026-12-01, 2026-12-15) 并列 → 拒
      e1.state = 'released';
      e1.effectiveDate = day('2026-12-15');
      await expect(e1.save()).rejects.toThrow(/并列|priority/);
      // ③ E1 改期到 2026-11-15：无并列 → 接受
      e1.effectiveDate = day('2026-11-15');
      await e1.save();
      // ④ 取消 E2 → 接受（C 恢复 priority 3，无并列）
      e2.state = 'cancelled';
      await e2.save();
    });

    it('US-512 AC#6 ECN 只截止 0.2 成员：发布拒（切片合计 0.8）；同 ECN 换 A、B 则通过', async () => {
      const parent = await makeItem('s6-p');
      const child = await makeItem('s6-c');
      let groupId = '';
      let memberA!: BomLineOccurrence;
      let memberB!: BomLineOccurrence;
      let memberC!: BomLineOccurrence;
      const header = await setupReleasedHeader(parent, child, async draftHeader => {
        const group = new BomSubstituteGroup();
        group.headerId = draftHeader.id;
        group.code = `G-${Math.random().toString(36).slice(2, 6)}`;
        group.strategy = 'proportional';
        group.allowMix = true;
        await group.save();
        groupId = group.id;
        memberA = await addMember(draftHeader, child, group.id, 'primary', '0.5', null);
        memberB = await addMember(draftHeader, child, group.id, 'substitute', '0.3', null);
        memberC = await addMember(draftHeader, child, group.id, 'substitute', '0.2', null);
      });
      // ① 只截止 C 并发布 → 拒（0.5 + 0.3 = 0.8）
      const e1 = await makeEcn('s6a', '2026-11-01');
      memberC.ecnOutId = e1.id;
      memberC.effectiveTo = day('2026-11-01');
      await memberC.save();
      await expect(releaseEcn(e1)).rejects.toThrow(/合计|0\.8|≠ 1/);
      // ② 同一 ECN 另以新发生项替换 A、B（0.625/0.375）→ 接受（C 已截止，合计 = 1）
      await replaceMember(header, child, memberA, e1, groupId, 'primary', '0.625', null);
      await replaceMember(header, child, memberB, e1, groupId, 'substitute', '0.375', null);
      await expect(releaseEcn(e1)).resolves.toBeUndefined();
    });

    it('US-512 AC#9 ECN 截止 primary 的发生项：发布拒，替代成员不得顶替 primary', async () => {
      const parent = await makeItem('s9-p');
      const child = await makeItem('s9-c');
      let groupId = '';
      void groupId;
      let memberA!: BomLineOccurrence;
      await setupReleasedHeader(parent, child, async draftHeader => {
        const group = new BomSubstituteGroup();
        group.headerId = draftHeader.id;
        group.code = `G-${Math.random().toString(36).slice(2, 6)}`;
        group.strategy = 'proportional';
        group.allowMix = true;
        await group.save();
        groupId = group.id;
        memberA = await addMember(draftHeader, child, group.id, 'primary', '0.5', null);
        await addMember(draftHeader, child, group.id, 'substitute', '0.5', null);
      });
      const e1 = await makeEcn('s9', '2026-11-01');
      memberA.ecnOutId = e1.id;
      memberA.effectiveTo = day('2026-11-01');
      await memberA.save();
      // [2026-11-01, +∞) 只剩替代成员 → 拒（缺 primary）
      await expect(releaseEcn(e1)).rejects.toThrow(/primary/);
    });

    it('US-512 AC#14 ECN 截止 G1 全部成员并引入新 proportional 组 G2：通过（空切片不校验）', async () => {
      const parent = await makeItem('s14-p');
      const child = await makeItem('s14-c');
      let memberA!: BomLineOccurrence;
      let memberB!: BomLineOccurrence;
      void memberB;
      const header = await setupReleasedHeader(parent, child, async draftHeader => {
        const group = new BomSubstituteGroup();
        group.headerId = draftHeader.id;
        group.code = `G-${Math.random().toString(36).slice(2, 6)}`;
        group.strategy = 'priority';
        group.allowMix = true;
        await group.save();
        memberA = await addMember(draftHeader, child, group.id, 'primary', null, 1);
        memberB = await addMember(draftHeader, child, group.id, 'substitute', null, 2);
      });
      const ecn = await makeEcn('s14', '2026-11-01');
      // 截止 G1 全部成员
      memberA.ecnOutId = ecn.id;
      memberA.effectiveTo = day('2026-11-01');
      await memberA.save();
      memberB.ecnOutId = ecn.id;
      memberB.effectiveTo = day('2026-11-01');
      await memberB.save();
      // 引入新 proportional 组 G2（成员概率 0.6/0.4，挂 ECN）
      const group2 = new BomSubstituteGroup();
      group2.headerId = header.id;
      group2.code = `G2-${Math.random().toString(36).slice(2, 6)}`;
      group2.strategy = 'proportional';
      group2.allowMix = true;
      group2.ecnInId = ecn.id;
      await group2.save();
      await addMember(header, child, group2.id, 'primary', '0.6', null, undefined, ecn);
      await addMember(header, child, group2.id, 'substitute', '0.4', null, undefined, ecn);
      // G1 在 11-01 后、G2 在 11-01 前都没有生效成员：空切片不校验 → 通过
      await expect(releaseEcn(ecn)).resolves.toBeUndefined();
    });

    it('AC#9 ECN 引入的 managed 行位号数与 qty 不符：发布整批回滚，点名发生项', async () => {
      const parent = await makeItem('s9b-p');
      const child = await makeItem('s9b-c');
      const header = await setupReleasedHeader(parent, child);
      const ecn = await makeEcn('s9b', '2026-11-01');
      // managed 行 qty=3 只挂 2 个位号（draft ECN 草稿允许暂时不合法）
      const line = new BomLine();
      line.headerId = header.id;
      line.lineNo = 30;
      line.ecnInId = ecn.id;
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = child.id;
      occurrence.qty = '3';
      occurrence.uom = 'pcs';
      occurrence.designatorManaged = true;
      occurrence.ecnInId = ecn.id;
      occurrence.effectiveFrom = day('2026-11-01');
      await occurrence.save();
      const designatorTable = backend === 'wa-sqlite' ? '"bom$bom_line_designator"' : '"bom"."bom_line_designator"';
      for (const name of ['D1', 'D2']) {
        await adapter.rawQuery(
          `INSERT INTO ${designatorTable} ("id", "occurrenceId", "designator", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${occurrence.id}', '${name}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
      }
      // 发布：位号数 2 ≠ qty 3 → 拒并点名发生项；ECN 行整体回滚（发布失败）
      await expect(releaseEcn(ecn)).rejects.toThrow(/位号/);
      const rows = (await adapter.rawQuery(
        `SELECT "state" FROM ${backend === 'wa-sqlite' ? '"bom$ecn"' : '"bom"."ecn"'} WHERE "id" = '${ecn.id}'`
      )) as unknown as { rows: unknown[][] };
      expect(String(rows.rows[0][0])).toBe('draft');
    });
  });
}
