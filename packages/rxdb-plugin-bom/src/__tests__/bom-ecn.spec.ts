/**
 * @fileoverview ECN 变更管理回归测试（US-515：保存期写入协议 / 状态机 / 投影校验）
 *
 * 双后端同断言：ecn 实体 CRUD 与唯一键、发生项区间由 ECN 派生（手填冲突拒绝）、
 * 截止标记的排他与单截止方、已发布头的「表 × 操作」写入协议矩阵、发布 / 改期 / 取消
 * 三种状态转移（含级联与投影校验）。跨行聚合的切片用例在 bom-ecn-slice.spec.ts。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
/** 单调递增行号（随机行号会与既有 fixture 行相撞，UNIQUE (headerId, lineNo) 偶发拒绝）。 */
let lineNoCounter = 10_000;
const nextLineNo = (): number => {
  lineNoCounter += 1;
  return lineNoCounter;
};

import { BomEcn, BomHeader, BomItem, BomLine, BomLineOccurrence } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import { resolveBom } from '../resolve/resolver.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** 建一个物料（含已发布修订 A，评估日可见）。 */
const makeItem = async (adapter: BomTestAdapter, prefix: string): Promise<BomItem> => {
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

/** 已发布头 + 一条行发生项（区间 [2026-01-01, +∞)）；`beforeRelease` 在发布前追加草稿期构造。 */
const setupReleasedHeader = async (
  adapter: BomTestAdapter,
  parent: BomItem,
  child: BomItem,
  qty = '1',
  beforeRelease?: (header: BomHeader, line: BomLine) => Promise<void>
): Promise<{ header: BomHeader; line: BomLine; occurrence: BomLineOccurrence }> => {
  const table = adapter.name === 'wa-sqlite' ? `"bom$item_revision"` : `"bom"."item_revision"`;
  const rows = (await adapter.rawQuery(`SELECT "id" FROM ${table} WHERE "itemId" = '${parent.id}'`)) as unknown as
    { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
  const shape = 'results' in rows ? rows.results[0] : rows;
  const header = new BomHeader();
  header.parentRevisionId = String(shape.rows[0][0]);
  header.bomType = 'ebom';
  header.orgId = 'org-x';
  await header.save();
  const line = new BomLine();
  line.headerId = header.id;
  line.lineNo = nextLineNo();
  await line.save();
  const occurrence = new BomLineOccurrence();
  occurrence.lineId = line.id;
  occurrence.childItemId = child.id;
  occurrence.qty = qty;
  occurrence.uom = 'pcs';
  occurrence.effectiveFrom = day('2026-01-01');
  await occurrence.save();
  if (beforeRelease) await beforeRelease(header, line);
  header.state = 'released';
  await header.save();
  return { header, line, occurrence };
};

/** 建一张 draft ECN。 */
const makeEcn = async (prefix: string, effectiveDate = day('2026-11-01')): Promise<BomEcn> => {
  const ecn = new BomEcn();
  ecn.ecnNo = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  ecn.effectiveDate = effectiveDate;
  await ecn.save();
  return ecn;
};

describe('US-515 ECN 变更管理', () => {
  for (const backend of BACKENDS) {
    describe(`[${backend}]`, () => {
      let adapter: BomTestAdapter;

      beforeAll(async () => {
        adapter = await createBomTestAdapter(backend);
      });

      afterAll(async () => {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      });

      it('ecn 实体：创建即 draft，effectiveDate 必填', async () => {
        const ecn = await makeEcn('ecn', day('2026-11-01'));
        expect(ecn.state).toBe('draft');
        expect(ecn.effectiveDate).toEqual(day('2026-11-01'));
        expect(ecn.reason).toBeNull();
        // 缺 effectiveDate 的插入被非空列拒绝
        const bare = new BomEcn();
        bare.ecnNo = `bare-${Math.random().toString(36).slice(2, 8)}`;
        await expect(bare.save()).rejects.toThrow();
      });

      it('ecnNo 唯一：同号第二张拒绝', async () => {
        const ecnNo = `dup-${Math.random().toString(36).slice(2, 8)}`;
        const first = new BomEcn();
        first.ecnNo = ecnNo;
        first.effectiveDate = day('2026-11-01');
        await first.save();
        const second = new BomEcn();
        second.ecnNo = ecnNo;
        second.effectiveDate = day('2026-12-01');
        await expect(second.save()).rejects.toThrow();
      });

      it('draft ECN 可改生效日与原因；released 后除合法转移外不可改（T005 状态机兜底）', async () => {
        const ecn = await makeEcn('mutable', day('2026-11-01'));
        ecn.effectiveDate = day('2026-11-15');
        ecn.reason = '客户要求提前';
        await ecn.save();
        expect(ecn.effectiveDate).toEqual(day('2026-11-15'));
      });

      it('AC#5 手填与 ECN 冲突的 effective_from：保存即拒', async () => {
        const parent = await makeItem(adapter, 'e5-p');
        const child = await makeItem(adapter, 'e5-c');
        const { line } = await setupReleasedHeader(adapter, parent, child);
        const ecn = await makeEcn('e5', day('2026-11-01'));
        const occurrence = new BomLineOccurrence();
        occurrence.lineId = line.id;
        occurrence.childItemId = child.id;
        occurrence.qty = '1';
        occurrence.uom = 'pcs';
        occurrence.ecnInId = ecn.id;
        occurrence.effectiveFrom = day('2026-10-15'); // 手填 ≠ ECN 生效日
        await expect(occurrence.save()).rejects.toThrow(/ecn|派生/);
      });

      it('AC#13 已发布头直连 SQL 插挂 draft ECN 的发生项：接受且区间派生', async () => {
        const parent = await makeItem(adapter, 'e13-p');
        const child = await makeItem(adapter, 'e13-c');
        const { header } = await setupReleasedHeader(adapter, parent, child);
        const ecn = await makeEcn('e13', day('2026-11-01'));
        // 新逻辑行（挂同一 draft ECN，矩阵放行）再插发生项——旧行区间 [2026-01-01, +∞) 不重叠
        const lineTable = backend === 'wa-sqlite' ? '"bom$bom_line"' : '"bom"."bom_line"';
        const newLineId = crypto.randomUUID();
        await adapter.rawQuery(
          `INSERT INTO ${lineTable} ("id", "headerId", "lineNo", "ecnInId", "createdAt", "updatedAt") VALUES ('${newLineId}', '${header.id}', 20, '${ecn.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        const table = backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"';
        const occurrenceId = crypto.randomUUID();
        await adapter.rawQuery(
          `INSERT INTO ${table} ("id", "lineId", "childItemId", "qty", "uom", "effectiveFrom", "ecnInId", "createdAt", "updatedAt") VALUES ('${occurrenceId}', '${newLineId}', '${child.id}', '2', 'pcs', '2026-11-01T00:00:00.000Z', '${ecn.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        const read = (await adapter.rawQuery(
          `SELECT "effectiveFrom" FROM ${table} WHERE "id" = '${occurrenceId}'`
        )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
        const rows = 'results' in read ? read.results[0].rows : read.rows;
        // PGlite 返回 Date 对象、wa-sqlite 返回 ISO 文本：统一按日期值断言
        expect(new Date(String(rows[0][0])).toISOString().startsWith('2026-11-01')).toBe(true);
      });

      it('AC#14 已发布头：直连改 qty 拒；插 ecn_in 指向已发布 ECN 的行拒', async () => {
        const parent = await makeItem(adapter, 'e14-p');
        const child = await makeItem(adapter, 'e14-c');
        const { line, occurrence } = await setupReleasedHeader(adapter, parent, child);
        const table = backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"';
        await expect(
          adapter.rawQuery(`UPDATE ${table} SET "qty" = '9' WHERE "id" = '${occurrence.id}'`)
        ).rejects.toThrow(/bom_write_protocol/);
        // 已发布 ECN 挂行：INSERT 拒绝（矩阵只放行 draft）
        const ecn = await makeEcn('e14', day('2026-11-01'));
        const ecnTable = backend === 'wa-sqlite' ? '"bom$ecn"' : '"bom"."ecn"';
        await adapter.rawQuery(
          `UPDATE ${ecnTable} SET "state" = 'released', "effectiveDate" = '2026-12-01T00:00:00.000Z' WHERE "id" = '${ecn.id}'`
        );
        await expect(
          adapter.rawQuery(
            `INSERT INTO ${table} ("id", "lineId", "childItemId", "qty", "uom", "effectiveFrom", "ecnInId", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${line.id}', '${child.id}', '3', 'pcs', '2026-12-01T00:00:00.000Z', '${ecn.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
          )
        ).rejects.toThrow(/bom_write_protocol/);
      });

      it('AC#15 同一发生项只能有一个截止方：第二张 draft ECN 再截止拒', async () => {
        const parent = await makeItem(adapter, 'e15-p');
        const child = await makeItem(adapter, 'e15-c');
        const { occurrence } = await setupReleasedHeader(adapter, parent, child);
        const first = await makeEcn('e15a', day('2026-11-01'));
        occurrence.ecnOutId = first.id;
        occurrence.effectiveTo = day('2026-11-01');
        await occurrence.save();
        const second = await makeEcn('e15b', day('2026-12-01'));
        occurrence.ecnOutId = second.id;
        occurrence.effectiveTo = day('2026-12-01');
        await expect(occurrence.save()).rejects.toThrow(/截止方|bom_write_protocol/);
      });

      it('AC#16 只能截止 ecn_in 为空或已发布的发生项', async () => {
        const parent = await makeItem(adapter, 'e16-p');
        const child = await makeItem(adapter, 'e16-c');
        const { header } = await setupReleasedHeader(adapter, parent, child);
        const intro = await makeEcn('e16a', day('2026-11-01'));
        // intro 引入的发生项挂在新逻辑行（区间不与既有行重叠）
        const lineTable = backend === 'wa-sqlite' ? '"bom$bom_line"' : '"bom"."bom_line"';
        const newLineId = crypto.randomUUID();
        await adapter.rawQuery(
          `INSERT INTO ${lineTable} ("id", "headerId", "lineNo", "ecnInId", "createdAt", "updatedAt") VALUES ('${newLineId}', '${header.id}', 20, '${intro.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        const occurrence = new BomLineOccurrence();
        occurrence.lineId = newLineId;
        occurrence.childItemId = child.id;
        occurrence.qty = '2';
        occurrence.uom = 'pcs';
        occurrence.ecnInId = intro.id;
        occurrence.effectiveFrom = day('2026-11-01');
        await occurrence.save();
        const outro = await makeEcn('e16b', day('2026-12-01'));
        occurrence.ecnOutId = outro.id;
        occurrence.effectiveTo = day('2026-12-01');
        await expect(occurrence.save()).rejects.toThrow(/截止|已发布/);
      });

      it('AC#17 打截止标记收窄 + 新发生项引入：都接受，区间按 ECN 派生', async () => {
        const parent = await makeItem(adapter, 'e17-p');
        const child = await makeItem(adapter, 'e17-c');
        const { line, occurrence } = await setupReleasedHeader(adapter, parent, child);
        const ecn = await makeEcn('e17', day('2026-11-01'));
        // ① 打截止标记：o1 收窄为 [2026-01-01, 2026-11-01)
        occurrence.ecnOutId = ecn.id;
        occurrence.effectiveTo = day('2026-11-01');
        await occurrence.save();
        expect(occurrence.effectiveTo).toEqual(day('2026-11-01'));
        // ② 挂 E 的 o2 [2026-11-01, +∞)：矩阵 INSERT 放行
        const o2 = new BomLineOccurrence();
        o2.lineId = line.id;
        o2.childItemId = child.id;
        o2.qty = '3';
        o2.uom = 'pcs';
        o2.ecnInId = ecn.id;
        o2.effectiveFrom = day('2026-11-01');
        await o2.save();
        expect(o2.effectiveFrom).toEqual(day('2026-11-01'));
      });

      it('AC#18 先插 o2 再打截止标记：区间排他拒绝', async () => {
        const parent = await makeItem(adapter, 'e18-p');
        const child = await makeItem(adapter, 'e18-c');
        const { line } = await setupReleasedHeader(adapter, parent, child);
        const ecn = await makeEcn('e18', day('2026-11-01'));
        const o2 = new BomLineOccurrence();
        o2.lineId = line.id;
        o2.childItemId = child.id;
        o2.qty = '3';
        o2.uom = 'pcs';
        o2.ecnInId = ecn.id;
        o2.effectiveFrom = day('2026-11-01');
        // o1 仍是 [2026-01-01, +∞)：插入 o2 即被区间排他拒绝（AC#18 的预期）
        await expect(o2.save()).rejects.toThrow();
      });

      it('AC#19 撤回顺序：先删 o2 再清标记接受；先清标记被排他拒绝', async () => {
        const parent = await makeItem(adapter, 'e19-p');
        const child = await makeItem(adapter, 'e19-c');
        const { line, occurrence } = await setupReleasedHeader(adapter, parent, child);
        const ecn = await makeEcn('e19', day('2026-11-01'));
        occurrence.ecnOutId = ecn.id;
        occurrence.effectiveTo = day('2026-11-01');
        await occurrence.save();
        const o2 = new BomLineOccurrence();
        o2.lineId = line.id;
        o2.childItemId = child.id;
        o2.qty = '3';
        o2.uom = 'pcs';
        o2.ecnInId = ecn.id;
        o2.effectiveFrom = day('2026-11-01');
        await o2.save();
        // ② 先清截止标记：o2 仍在，恢复 +∞ 与 o2 重叠 → 拒
        occurrence.ecnOutId = null;
        occurrence.effectiveTo = null;
        await expect(occurrence.save()).rejects.toThrow();
        // ① 先删 o2 再清标记：接受，o1 恢复 [2026-01-01, +∞)
        await o2.remove();
        await occurrence.save();
        expect(occurrence.effectiveTo).toBeNull();
      });

      it('AC#26 ① 不跨草稿引用：E2 在 E1 的逻辑行下插发生项 / 成员加入 E1 的组均拒', async () => {
        const parent = await makeItem(adapter, 'e26-p');
        const child = await makeItem(adapter, 'e26-c');
        const { header, line } = await setupReleasedHeader(adapter, parent, child);
        // E1 新建逻辑行 L 与替代组 G（挂 E1 的 draft ECN）
        const e1 = await makeEcn('e26a', day('2026-12-01'));
        const table = backend === 'wa-sqlite' ? '"bom$bom_line"' : '"bom"."bom_line"';
        const lineId = crypto.randomUUID();
        await adapter.rawQuery(
          `INSERT INTO ${table} ("id", "headerId", "lineNo", "ecnInId", "createdAt", "updatedAt") VALUES ('${lineId}', '${header.id}', 40, '${e1.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        const groupTable = backend === 'wa-sqlite' ? '"bom$bom_substitute_group"' : '"bom"."bom_substitute_group"';
        const groupId = crypto.randomUUID();
        await adapter.rawQuery(
          `INSERT INTO ${groupTable} ("id", "headerId", "code", "strategy", "allowMix", "ecnInId", "createdAt", "updatedAt") VALUES ('${groupId}', '${header.id}', 'G-E26', 'proportional', ${backend === 'wa-sqlite' ? 1 : 'true'}, '${e1.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        // E2 在 L 下插发生项 → 拒（点名 E1）
        const e2 = await makeEcn('e26b', day('2027-01-01'));
        const occurrenceTable = backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"';
        await expect(
          adapter.rawQuery(
            `INSERT INTO ${occurrenceTable} ("id", "lineId", "childItemId", "qty", "uom", "effectiveFrom", "ecnInId", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${lineId}', '${child.id}', '1', 'pcs', '2027-01-01T00:00:00.000Z', '${e2.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
          )
        ).rejects.toThrow(/bom_write_protocol/);
        // E2 的发生项加入 G → 拒
        await expect(
          adapter.rawQuery(
            `INSERT INTO ${occurrenceTable} ("id", "lineId", "childItemId", "qty", "uom", "effectiveFrom", "ecnInId", "substituteGroupId", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${line.id}', '${child.id}', '1', 'pcs', '2027-01-01T00:00:00.000Z', '${e2.id}', '${groupId}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
          )
        ).rejects.toThrow(/bom_write_protocol/);
      });

      it('AC#22 协议外形态全拒：组策略、成员概率、非 ECN 行分摊、不挂 ECN 行、头字段', async () => {
        const parent = await makeItem(adapter, 'e22-p');
        const child = await makeItem(adapter, 'e22-c');
        // 替代组在草稿期建好（已发布头下插不挂 ECN 的组本身就是协议外形态）；配一个 primary 成员过发布校验
        let groupId = '';
        const { header, occurrence } = await setupReleasedHeader(adapter, parent, child, '1', async draftHeader => {
          const groupTable = backend === 'wa-sqlite' ? '"bom$bom_substitute_group"' : '"bom"."bom_substitute_group"';
          groupId = crypto.randomUUID();
          await adapter.rawQuery(
            `INSERT INTO ${groupTable} ("id", "headerId", "code", "strategy", "allowMix", "createdAt", "updatedAt") VALUES ('${groupId}', '${draftHeader.id}', 'G-E22', 'proportional', ${backend === 'wa-sqlite' ? 1 : 'true'}, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
          );
          const memberLine = new BomLine();
          memberLine.headerId = draftHeader.id;
          memberLine.lineNo = nextLineNo();
          await memberLine.save();
          const member = new BomLineOccurrence();
          member.lineId = memberLine.id;
          member.childItemId = child.id;
          member.qty = '1';
          member.uom = 'pcs';
          member.effectiveFrom = day('2026-01-01');
          member.substituteGroupId = groupId;
          member.substituteRole = 'primary';
          member.usageProbability = '0.5';
          member.equivQty = '1';
          await member.save();
          // 第二个成员补足合计 1（发布校验）
          const secondLine = new BomLine();
          secondLine.headerId = draftHeader.id;
          secondLine.lineNo = 30 + Math.floor(Math.random() * 1000);
          await secondLine.save();
          const second = new BomLineOccurrence();
          second.lineId = secondLine.id;
          second.childItemId = child.id;
          second.qty = '1';
          second.uom = 'pcs';
          second.effectiveFrom = day('2026-01-01');
          second.substituteGroupId = groupId;
          second.substituteRole = 'substitute';
          second.usageProbability = '0.5';
          second.equivQty = '1';
          await second.save();
        });
        const groupTable = backend === 'wa-sqlite' ? '"bom$bom_substitute_group"' : '"bom"."bom_substitute_group"';
        // 改替代组 strategy → 拒
        await expect(
          adapter.rawQuery(`UPDATE ${groupTable} SET "strategy" = 'manual' WHERE "id" = '${groupId}'`)
        ).rejects.toThrow(/bom_write_protocol/);
        // 改成员概率（发生项 UPDATE）→ 拒
        const occurrenceTable = backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"';
        await expect(
          adapter.rawQuery(`UPDATE ${occurrenceTable} SET "usageProbability" = '0.5' WHERE "id" = '${occurrence.id}'`)
        ).rejects.toThrow(/bom_write_protocol/);
        // 插入不挂 ECN 的逻辑行 → 拒
        const lineTable = backend === 'wa-sqlite' ? '"bom$bom_line"' : '"bom"."bom_line"';
        await expect(
          adapter.rawQuery(
            `INSERT INTO ${lineTable} ("id", "headerId", "lineNo", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${header.id}', 50, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
          )
        ).rejects.toThrow(/bom_write_protocol/);
        // 改头字段 → 拒（头字段要改须发布新修订）
        const headerTable = backend === 'wa-sqlite' ? '"bom$bom_header"' : '"bom"."bom_header"';
        await expect(
          adapter.rawQuery(`UPDATE ${headerTable} SET "baseQty" = '2' WHERE "id" = '${header.id}'`)
        ).rejects.toThrow(/bom_write_protocol/);
        // 给非 ECN 发生项加工序分摊 → 拒
        const splitTable =
          backend === 'wa-sqlite' ? '"bom$bom_line_operation_split"' : '"bom"."bom_line_operation_split"';
        await expect(
          adapter.rawQuery(
            `INSERT INTO ${splitTable} ("id", "occurrenceId", "operationSeq", "ratio", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${occurrence.id}', 10, '0.5', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
          )
        ).rejects.toThrow(/bom_write_protocol/);
      });

      it('US-507 AC#10 已发布头：删位号拒绝（矩阵外的形态）', async () => {
        const parent = await makeItem(adapter, 'e507-p');
        const child = await makeItem(adapter, 'e507-c');
        // managed 发生项与位号在草稿期建好再发布（新行，避免与基础行区间排他冲突）
        let designatorId = '';
        await setupReleasedHeader(adapter, parent, child, '1', async draftHeader => {
          const managedLine = new BomLine();
          managedLine.headerId = draftHeader.id;
          managedLine.lineNo = nextLineNo();
          await managedLine.save();
          const occurrence = new BomLineOccurrence();
          occurrence.lineId = managedLine.id;
          occurrence.childItemId = child.id;
          occurrence.qty = '1';
          occurrence.uom = 'pcs';
          occurrence.designatorManaged = true;
          occurrence.effectiveFrom = day('2026-01-01');
          await occurrence.save();
          const designatorTable = backend === 'wa-sqlite' ? '"bom$bom_line_designator"' : '"bom"."bom_line_designator"';
          designatorId = crypto.randomUUID();
          await adapter.rawQuery(
            `INSERT INTO ${designatorTable} ("id", "occurrenceId", "designator", "createdAt", "updatedAt") VALUES ('${designatorId}', '${occurrence.id}', 'R1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
          );
        });
        // 已发布头下删位号（发生项无 ECN）→ 拒
        const designatorTable = backend === 'wa-sqlite' ? '"bom$bom_line_designator"' : '"bom"."bom_line_designator"';
        await expect(adapter.rawQuery(`DELETE FROM ${designatorTable} WHERE "id" = '${designatorId}'`)).rejects.toThrow(
          /bom_write_protocol/
        );
      });

      /** 建「替换链」：已发布头的行 o1 [2026-01-01, +∞)，ECN 截止它并引入 o2。 */
      const makeReplacement = async (
        prefix: string,
        ecnDate: string,
        o2Qty = '2'
      ): Promise<{ header: BomHeader; line: BomLine; o1: BomLineOccurrence; o2: BomLineOccurrence; ecn: BomEcn }> => {
        const parent = await makeItem(adapter, `${prefix}-p`);
        const child = await makeItem(adapter, `${prefix}-c`);
        const { header, line, occurrence } = await setupReleasedHeader(adapter, parent, child);
        const ecn = await makeEcn(prefix, day(ecnDate));
        occurrence.ecnOutId = ecn.id;
        occurrence.effectiveTo = day(ecnDate);
        await occurrence.save();
        const o2 = new BomLineOccurrence();
        o2.lineId = line.id;
        o2.childItemId = child.id;
        o2.qty = o2Qty;
        o2.uom = 'pcs';
        o2.ecnInId = ecn.id;
        o2.effectiveFrom = day(ecnDate);
        await o2.save();
        return { header, line, o1: occurrence, o2, ecn };
      };

      const releaseEcn = async (ecn: BomEcn): Promise<void> => {
        ecn.state = 'released';
        await ecn.save();
      };

      it('AC#8 发布追溯生效拒绝（生效日早于当日）', async () => {
        const ecn = await makeEcn('e8', day('2026-09-15'));
        await expect(releaseEcn(ecn)).rejects.toThrow(/追溯|生效/);
      });

      it('AC#3 released 未生效的 ECN 改期：关联发生项区间级联更新', async () => {
        const { o1, o2, ecn } = await makeReplacement('e3', '2026-11-01');
        await releaseEcn(ecn);
        // 改期到 2026-11-15（未来，未生效）
        ecn.effectiveDate = day('2026-11-15');
        await ecn.save();
        const table = backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"';
        const read = async (id: string): Promise<{ from: string; to: string | null }> => {
          const rows = (await adapter.rawQuery(
            `SELECT "effectiveFrom", "effectiveTo" FROM ${table} WHERE "id" = '${id}'`
          )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
          const shape = 'results' in rows ? rows.results[0].rows : rows.rows;
          return {
            from: new Date(String(shape[0][0])).toISOString(),
            to: shape[0][1] === null ? null : new Date(String(shape[0][1])).toISOString()
          };
        };
        expect((await read(o1.id)).to).toBe('2026-11-15T00:00:00.000Z');
        expect((await read(o2.id)).from).toBe('2026-11-15T00:00:00.000Z');
      });

      it('AC#20 改期不得越过同一逻辑行后继 ECN：① 拒并点名 B ② 接受且先收窄后放宽', async () => {
        // 链：A（2026-11-01，o1→o2）、B（2026-12-01，o2→o3）
        const { o2, ecn: ecnA } = await makeReplacement('e20a', '2026-11-01');
        await releaseEcn(ecnA);
        const ecnB = await makeEcn('e20b', day('2026-12-01'));
        o2.ecnOutId = ecnB.id;
        o2.effectiveTo = day('2026-12-01');
        await o2.save();
        const o3 = new BomLineOccurrence();
        o3.lineId = o2.lineId;
        o3.childItemId = o2.childItemId;
        o3.qty = '3';
        o3.uom = 'pcs';
        o3.ecnInId = ecnB.id;
        o3.effectiveFrom = day('2026-12-01');
        await o3.save();
        await releaseEcn(ecnB);
        // ① A 改期到 2026-12-15：越过 B → 拒（点名后继 ECN 号）
        ecnA.effectiveDate = day('2026-12-15');
        await expect(ecnA.save()).rejects.toThrow(/后继|AC#20/);
        // ② A 改期到 2026-11-15：接受——级联先把 o2 收窄为 [11-15, 12-01)，再把 o1 放宽到 11-15
        ecnA.effectiveDate = day('2026-11-15');
        await ecnA.save();
        const table = backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"';
        const rows = (await adapter.rawQuery(
          `SELECT "effectiveFrom", "effectiveTo" FROM ${table} ORDER BY "effectiveFrom"`
        )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
        const shape = 'results' in rows ? rows.results[0].rows : rows.rows;
        const intervals = shape.map((row: unknown[]) => [
          new Date(String(row[0])).toISOString(),
          row[1] === null ? null : new Date(String(row[1])).toISOString()
        ]);
        expect(intervals).toContainEqual(['2026-01-01T00:00:00.000Z', '2026-11-15T00:00:00.000Z']);
        expect(intervals).toContainEqual(['2026-11-15T00:00:00.000Z', '2026-12-01T00:00:00.000Z']);
        expect(intervals).toContainEqual(['2026-12-01T00:00:00.000Z', null]);
      });

      it('AC#4 released 未生效的 ECN 取消：整体回退，不留半生效状态', async () => {
        const { o1, o2: _o2, ecn } = await makeReplacement('e4', '2026-11-01');
        void _o2;
        await releaseEcn(ecn);
        ecn.state = 'cancelled';
        await ecn.save();
        // o2 已删除；o1 截止标记清、区间恢复 +∞
        const table = backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"';
        const rows = (await adapter.rawQuery(
          `SELECT "id", "effectiveFrom", "effectiveTo", "ecnOutId" FROM ${table} WHERE "lineId" = '${o1.lineId}' ORDER BY "effectiveFrom"`
        )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
        const shape = 'results' in rows ? rows.results[0].rows : rows.rows;
        expect(shape).toHaveLength(1);
        expect(String(shape[0][0])).toBe(o1.id);
        expect(shape[0][1] === null).toBe(false);
        expect(shape[0][2]).toBeNull();
        expect(shape[0][3]).toBeNull();
      });

      it('AC#12 released 未生效的 A 引入行被 B 截止：取消 A 拒绝并点名 B', async () => {
        const { o2, ecn: ecnA } = await makeReplacement('e12a', '2026-11-01');
        await releaseEcn(ecnA);
        const ecnB = await makeEcn('e12b', day('2026-12-01'));
        o2.ecnOutId = ecnB.id;
        o2.effectiveTo = day('2026-12-01');
        await o2.save();
        await releaseEcn(ecnB);
        ecnA.state = 'cancelled';
        await expect(ecnA.save()).rejects.toThrow(/后续|AC#12/);
      });

      it('AC#7 已生效的 ECN 不可取消：拒绝并提示改走更正 ECN', async () => {
        // 生效日已过的 released ECN：经开启态历史批次绕过追溯检查（与 loadHistory 同通道）
        const ecn = await makeEcn('e7', day('2026-09-15'));
        const batchTable = backend === 'wa-sqlite' ? '"bom$bom_history_batch"' : '"bom"."bom_history_batch"';
        const batchNo = `open-${Math.random().toString(36).slice(2, 10)}`;
        await adapter.rawQuery(
          `INSERT INTO ${batchTable} ("id", "batchNo", "state", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${batchNo}', 'open', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        ecn.historyBatchNo = batchNo;
        await releaseEcn(ecn);
        ecn.state = 'cancelled';
        await expect(ecn.save()).rejects.toThrow(/更正|已生效|AC#7/);
        // 改期同样拒绝
        ecn.effectiveDate = day('2026-10-20');
        await expect(ecn.save()).rejects.toThrow(/更正|已生效|AC#7/);
      });

      it('AC#10 draft ECN 的成环发生项：保存即拒（环并集含草稿 ECN 行）', async () => {
        const parent = await makeItem(adapter, 'e10-p');
        const child = await makeItem(adapter, 'e10-c');
        const { header } = await setupReleasedHeader(adapter, parent, child);
        const ecn = await makeEcn('e10', day('2026-11-01'));
        // draft ECN 引入「child 指回 parent」的成环边（新行 + 发生项）
        const lineTable = backend === 'wa-sqlite' ? '"bom$bom_line"' : '"bom"."bom_line"';
        const newLineId = crypto.randomUUID();
        await adapter.rawQuery(
          `INSERT INTO ${lineTable} ("id", "headerId", "lineNo", "ecnInId", "createdAt", "updatedAt") VALUES ('${newLineId}', '${header.id}', 40, '${ecn.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        const table = backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"';
        await expect(
          adapter.rawQuery(
            `INSERT INTO ${table} ("id", "lineId", "childItemId", "qty", "uom", "effectiveFrom", "ecnInId", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${newLineId}', '${parent.id}', '1', 'pcs', '2026-11-01T00:00:00.000Z', '${ecn.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
          )
        ).rejects.toThrow(/bom_cycle/);
      });

      it('AC#21 发布 E 后再建 E′ 撤回：其行与子表全部删除；行号占用随删除释放', async () => {
        const parent = await makeItem(adapter, 'e21-p');
        const child = await makeItem(adapter, 'e21-c');
        const { header } = await setupReleasedHeader(adapter, parent, child);
        // E：新逻辑行 50（挂 E）
        const ecnE = await makeEcn('e21a', day('2026-11-01'));
        const lineTable = backend === 'wa-sqlite' ? '"bom$bom_line"' : '"bom"."bom_line"';
        await adapter.rawQuery(
          `INSERT INTO ${lineTable} ("id", "headerId", "lineNo", "ecnInId", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${header.id}', 50, '${ecnE.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        await releaseEcn(ecnE);
        // E′：同样新增行号 50（撞 (header, lineNo) 唯一键 → 拒）
        const ecnE2 = await makeEcn('e21b', day('2026-12-01'));
        await expect(
          adapter.rawQuery(
            `INSERT INTO ${lineTable} ("id", "headerId", "lineNo", "ecnInId", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${header.id}', 50, '${ecnE2.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
          )
        ).rejects.toThrow();
        // 取消 E′ 后（draft 撤回），行号 50 随 E 的行仍被占用（E 未取消）——先建 E′ 的行 60 再撤回它
        const line60Id = crypto.randomUUID();
        await adapter.rawQuery(
          `INSERT INTO ${lineTable} ("id", "headerId", "lineNo", "ecnInId", "createdAt", "updatedAt") VALUES ('${line60Id}', '${header.id}', 60, '${ecnE2.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        const occurrenceTable = backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"';
        const occId = crypto.randomUUID();
        await adapter.rawQuery(
          `INSERT INTO ${occurrenceTable} ("id", "lineId", "childItemId", "qty", "uom", "effectiveFrom", "ecnInId", "createdAt", "updatedAt") VALUES ('${occId}', '${line60Id}', '${child.id}', '1', 'pcs', '2026-12-01T00:00:00.000Z', '${ecnE2.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        // draft → cancelled（撤回）：行 60 与发生项全部删除，不留空逻辑行
        ecnE2.state = 'cancelled';
        await ecnE2.save();
        const rows = (await adapter.rawQuery(
          `SELECT COUNT(*) FROM ${lineTable} WHERE "id" = '${line60Id}'`
        )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
        const shape = 'results' in rows ? rows.results[0].rows : rows.rows;
        expect(Number(shape[0][0])).toBe(0);
        // 行号 60 释放后可由另一张 draft ECN 复用
        const ecnE3 = await makeEcn('e21c', day('2027-01-01'));
        await adapter.rawQuery(
          `INSERT INTO ${lineTable} ("id", "headerId", "lineNo", "ecnInId", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${header.id}', 60, '${ecnE3.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
      });

      it('AC#26 ②③ 发布 E1 后 E2 引用其行接受；取消 E1 拒并点名 E2，E2 不受损', async () => {
        const parent = await makeItem(adapter, 'e26b-p');
        const child = await makeItem(adapter, 'e26b-c');
        const { header } = await setupReleasedHeader(adapter, parent, child);
        // E1 发布（生效日 2026-12-01），引入行 L
        const e1 = await makeEcn('e26c', day('2026-12-01'));
        const lineTable = backend === 'wa-sqlite' ? '"bom$bom_line"' : '"bom"."bom_line"';
        const lineId = crypto.randomUUID();
        await adapter.rawQuery(
          `INSERT INTO ${lineTable} ("id", "headerId", "lineNo", "ecnInId", "createdAt", "updatedAt") VALUES ('${lineId}', '${header.id}', 40, '${e1.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        await releaseEcn(e1);
        // ② E2（draft，生效日 2027-01-01）在 L 下插发生项 → 接受（行已发布归属）
        const e2 = await makeEcn('e26d', day('2027-01-01'));
        const occurrenceTable = backend === 'wa-sqlite' ? '"bom$bom_line_occurrence"' : '"bom"."bom_line_occurrence"';
        const occId = crypto.randomUUID();
        await adapter.rawQuery(
          `INSERT INTO ${occurrenceTable} ("id", "lineId", "childItemId", "qty", "uom", "effectiveFrom", "ecnInId", "createdAt", "updatedAt") VALUES ('${occId}', '${lineId}', '${child.id}', '1', 'pcs', '2027-01-01T00:00:00.000Z', '${e2.id}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        );
        // ③ 取消 E1（发布后仍未生效）→ 拒点名 E2；E2 的发生项不受损
        e1.state = 'cancelled';
        await expect(e1.save()).rejects.toThrow(/引用|AC#26/);
        const rows = (await adapter.rawQuery(
          `SELECT COUNT(*) FROM ${occurrenceTable} WHERE "id" = '${occId}'`
        )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
        const shape = 'results' in rows ? rows.results[0].rows : rows.rows;
        expect(Number(shape[0][0])).toBe(1);
      });

      it('loadHistory 装载历史 ECN（C 层种子通道）：生效期行就位，已生效 ECN 取消被拒', async () => {
        // 物料不带已发布修订（本测试的 loadHistory 自带修订装载）
        const parent = new BomItem();
        parent.itemNo = `h-p-${Math.random().toString(36).slice(2, 8)}`;
        await parent.save();
        const child = new BomItem();
        child.itemNo = `h-c-${Math.random().toString(36).slice(2, 8)}`;
        await child.save();
        const ecnId = crypto.randomUUID();
        await loadHistory(adapter, {
          batchNo: `batch-${Math.random().toString(36).slice(2, 10)}`,
          revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
          ecns: [
            {
              id: ecnId,
              ecnNo: `H-E1-${Math.random().toString(36).slice(2, 6)}`,
              state: 'released',
              effectiveDate: day('2026-01-15')
            }
          ],
          headers: [
            {
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: 'org-x',
              lines: [
                {
                  lineNo: 10,
                  // 同一逻辑行的两段发生项：[2026-01-01, 2026-01-15)（被 ECN 截止）+ [2026-01-15, +∞)（ECN 引入）
                  occurrences: [
                    {
                      childItemId: child.id,
                      qty: '1',
                      effectiveFrom: day('2026-01-01'),
                      ecnOutId: ecnId,
                      effectiveTo: day('2026-01-15')
                    },
                    { childItemId: child.id, qty: '2', effectiveFrom: day('2026-01-15'), ecnInId: ecnId }
                  ]
                }
              ]
            }
          ]
        });
        // 按 2026-09-01 解析：ECN 已发布且生效 → 新发生项（qty 2）
        const revisionRows = (await adapter.rawQuery(
          `SELECT "id" FROM ${backend === 'wa-sqlite' ? '"bom$item_revision"' : '"bom"."item_revision"'} WHERE "itemId" = '${parent.id}'`
        )) as unknown as { rows: unknown[][] };
        const result = await resolveBom(
          adapter,
          { bomType: 'ebom', orgId: 'org-x', asOfDate: day('2026-09-01') },
          { parentRevisionId: String(revisionRows.rows[0][0]) }
        );
        expect(result.occurrences).toHaveLength(1);
        expect(result.occurrences[0].qty).toBe('2');
        // 已生效（2026-01-15 < 当日）→ 取消拒绝（直连状态转移与插件 API 同一条存储层路径）
        const ecnTable = backend === 'wa-sqlite' ? '"bom$ecn"' : '"bom"."ecn"';
        await expect(
          adapter.rawQuery(`UPDATE ${ecnTable} SET "state" = 'cancelled' WHERE "id" = '${ecnId}'`)
        ).rejects.toThrow(/更正|已生效|AC#7/);
      });
    });
  }
});
