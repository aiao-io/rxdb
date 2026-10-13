/**
 * @fileoverview BOM 图骨架的存储层回归测试（US-507 阶段 A / B + US-511 十进制存储段）
 *
 * 双后端（wa-sqlite / pglite）同断言：多重边（AC#1）、phantom 随修订 / serialized 随物料
 * （AC#6/#7）、相邻发生项接受与重叠拒绝（AC#8/#9）、已发布头成员写入全拒（AC#10）、
 * 修订属于子件（AC#11）、结构归属列与已发布修订不可改（AC#13/#14）、qty 规范十进制串
 * 存取与拒绝（US-511 AC#22 存储段 / AC#23）。
 */

import { firstValueFrom } from 'rxjs';
import { RxDBExclusionViolationError, uuid } from '@aiao/rxdb';
import { afterAll, describe, expect, it } from 'vitest';
import { BomDecimalFormatError, BomPublishValidationError, BomWriteProtocolError } from '../types.js';
import { BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { DECIMAL_CANONICAL_RE, normalizeDecimalString } from '../decimal.utils.js';
import { BomTestAdapter, createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const settled = <T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> =>
  promise.then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error })
  );

/** 把两端 rawQuery 的不同返回形状归一成行列形态。 */
const readRows = (result: unknown): { columns: string[]; rows: unknown[][] } => {
  const shaped = result as {
    results?: { columns: string[]; rows: unknown[][] }[];
    columns?: string[];
    rows?: unknown[];
  };
  if (Array.isArray(shaped.results)) {
    return shaped.results[0] ?? { columns: [], rows: [] };
  }
  const columns = shaped.columns ?? [];
  const rows = (shaped.rows ?? []).map(row => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return columns.map(column => (row as Record<string, unknown>)[column]);
    }
    return row as unknown[];
  });
  return { columns, rows };
};

const rawRows = async (adapter: BomTestAdapter, sql: string): Promise<unknown[][]> =>
  readRows(await adapter.rawQuery(sql)).rows;

/** 直连 SQL 的表引用：SQLite 是 `bom$表名`，PG 是 `bom"."表名`。 */
const tableRef = (backend: BomTestBackend, table: string): string =>
  backend === 'wa-sqlite' ? `"bom$${table}"` : `"bom"."${table}"`;


/** 建一套最小装配：item → revision → header（须在同一 RxDB 实例上，实体注册是全局单例）。 */
const setup = async () => {
  const item = new BomItem();
  item.itemNo = `item-${Math.random().toString(36).slice(2, 8)}`;
  await item.save();
  const revision = new BomItemRevision();
  revision.revisionNo = 'A';
  revision.itemId = item.id;
  await revision.save();
  const header = new BomHeader();
  header.parentRevisionId = revision.id;
  header.bomType = 'ebom';
  header.orgId = 'org-x';
  await header.save();
  return { item, revision, header };
};

/** 在头下建一条逻辑行。 */
const addLine = async (header: BomHeader, lineNo: number): Promise<BomLine> => {
  const line = new BomLine();
  line.headerId = header.id;
  line.lineNo = lineNo;
  await line.save();
  return line;
};

/** 在逻辑行下建一个（未保存的）发生项。 */
const makeOccurrence = (line: BomLine, item: BomItem, overrides: Partial<BomLineOccurrence> = {}): BomLineOccurrence => {
  const occurrence = new BomLineOccurrence();
  occurrence.lineId = line.id;
  occurrence.childItemId = item.id;
  occurrence.qty = '1';
  occurrence.effectiveFrom = day('2026-01-01');
  Object.assign(occurrence, overrides);
  return occurrence;
};

for (const backend of BACKENDS) {
  describe(`BOM 图骨架 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      // 全程共享一个实例：实体装饰器在 RxDB 实例间是单例注册，第二个实例会撞注册冲突
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('同一子件可挂多条逻辑行（AC#1）', async () => {
      const { item, header } = await setup();
      for (const lineNo of [10, 20, 30]) {
        const line = await addLine(header, lineNo);
        await makeOccurrence(line, item).save();
      }
      const lines = await firstValueFrom(
        BomLine.find({ where: { combinator: 'and', rules: [{ field: 'headerId', operator: '=', value: header.id }] } })
      );
      expect(lines.length).toBe(3);
    });

    it('default_phantom 随修订取值（AC#6）、serialized 随物料持久化（AC#7）', async () => {
      const item = new BomItem();
      item.itemNo = `ph-item-${Math.random().toString(36).slice(2, 8)}`;
      item.serialized = true;
      await item.save();
      const phantom = new BomItemRevision();
      phantom.revisionNo = 'D';
      phantom.itemId = item.id;
      phantom.defaultPhantom = true;
      await phantom.save();
      const plain = new BomItemRevision();
      plain.revisionNo = 'E';
      plain.itemId = item.id;
      await plain.save();

      const phantomRow = (await rawRows(adapter, `SELECT "defaultPhantom" FROM ${tableRef(backend, 'item_revision')} WHERE "id" = '${phantom.id}'`))[0];
      expect(Boolean(phantomRow?.[0])).toBe(true);
      const plainRow = (await rawRows(adapter, `SELECT "defaultPhantom" FROM ${tableRef(backend, 'item_revision')} WHERE "id" = '${plain.id}'`))[0];
      expect(Boolean(plainRow?.[0])).toBe(false);
      const itemRow = (await rawRows(adapter, `SELECT "serialized" FROM ${tableRef(backend, 'item')} WHERE "id" = '${item.id}'`))[0];
      expect(Boolean(itemRow?.[0])).toBe(true);
    });

    it('相邻发生项接受、重叠拒绝（AC#8/#9）', async () => {
      const { item, header } = await setup();
      const line = await addLine(header, 10);

      const first = makeOccurrence(line, item, { effectiveTo: day('2026-10-01') });
      await first.save();

      const adjacent = makeOccurrence(line, item, { effectiveFrom: day('2026-10-01'), effectiveTo: null });
      await expect(adjacent.save()).resolves.toBeDefined();

      const overlap = makeOccurrence(line, item, { effectiveFrom: day('2026-09-01'), effectiveTo: null });
      await expect(overlap.save()).rejects.toBeInstanceOf(RxDBExclusionViolationError);
    });

    it('已发布头的成员写入全部拒绝（AC#10 首轮）', async () => {
      const { item, header } = await setup();
      const line = await addLine(header, 10);
      await makeOccurrence(line, item).save();
      header.state = 'released';
      await header.save();

      const extraLine = new BomLine();
      extraLine.headerId = header.id;
      extraLine.lineNo = 20;
      await expect(extraLine.save()).rejects.toBeInstanceOf(BomWriteProtocolError);

      const direct = await settled(
        adapter.rawQuery(`INSERT INTO ${tableRef(backend, 'bom_line')} ("id", "headerId", "lineNo") VALUES ('${uuid()}', '${header.id}', 30)`)
      );
      expect(direct.ok).toBe(false);
      expect(String((direct as { error: Error }).error.message)).toContain('rxdb:bom_write_protocol');

      await expect(makeOccurrence(line, item, { effectiveFrom: day('2026-02-01') }).save()).rejects.toBeInstanceOf(
        BomWriteProtocolError
      );

      // DELETE 同样被协议拒绝
      const directDelete = await settled(
        adapter.rawQuery(`DELETE FROM ${tableRef(backend, 'bom_line')} WHERE "id" = '${line.id}'`)
      );
      expect(directDelete.ok).toBe(false);
      expect(String((directDelete as { error: Error }).error.message)).toContain('rxdb:bom_write_protocol');
    });

    it('修订必须属于子件（AC#11）', async () => {
      const { item, header } = await setup();
      const other = new BomItem();
      other.itemNo = `other-${Math.random().toString(36).slice(2, 8)}`;
      await other.save();
      const otherRevision = new BomItemRevision();
      otherRevision.revisionNo = 'A';
      otherRevision.itemId = other.id;
      await otherRevision.save();

      const line = await addLine(header, 10);
      const occurrence = makeOccurrence(line, item, { childRevisionId: otherRevision.id });
      await expect(occurrence.save()).rejects.toThrow();
    });

    it('结构归属列创建后不可改（AC#13）', async () => {
      const { revision, header } = await setup();
      const otherItem = new BomItem();
      otherItem.itemNo = `move-${Math.random().toString(36).slice(2, 8)}`;
      await otherItem.save();

      const revisionMove = await settled(
        adapter.rawQuery(`UPDATE ${tableRef(backend, 'item_revision')} SET "itemId" = '${otherItem.id}' WHERE "id" = '${revision.id}'`)
      );
      expect(revisionMove.ok).toBe(false);
      expect(String((revisionMove as { error: Error }).error.message)).toContain('rxdb:bom_write_protocol:itemId');

      const headerMove = await settled(
        adapter.rawQuery(`UPDATE ${tableRef(backend, 'bom_header')} SET "orgId" = 'org-y' WHERE "id" = '${header.id}'`)
      );
      expect(headerMove.ok).toBe(false);
      expect(String((headerMove as { error: Error }).error.message)).toContain('rxdb:bom_write_protocol:orgId');
    });

    it('已发布修订除状态转移外不可改（AC#14）', async () => {
      const { item } = await setup();
      const revision = new BomItemRevision();
      revision.revisionNo = 'D';
      revision.itemId = item.id;
      await revision.save();

      // 发布要求 effective_from 非空
      revision.state = 'released';
      await expect(revision.save()).rejects.toBeInstanceOf(BomPublishValidationError);

      // 正常发布
      revision.state = 'draft';
      revision.effectiveFrom = day('2026-01-01');
      await revision.save();
      revision.state = 'released';
      await expect(revision.save()).resolves.toBeDefined();

      // 已发布修订：直连 SQL 改 default_phantom / released→draft 均拒
      const phantom = await settled(
        adapter.rawQuery(`UPDATE ${tableRef(backend, 'item_revision')} SET "revisionNo" = 'X' WHERE "id" = '${revision.id}'`)
      );
      expect(phantom.ok).toBe(false);
      expect(String((phantom as { error: Error }).error.message)).toContain('rxdb:bom_write_protocol');
      const back = await settled(
        adapter.rawQuery(`UPDATE ${tableRef(backend, 'item_revision')} SET "state" = 'draft' WHERE "id" = '${revision.id}'`)
      );
      expect(back.ok).toBe(false);
    });

    it('qty 入口规范化：指数写法与尾随零（US-511 AC#22 ②）', async () => {
      const { item, header } = await setup();
      const line = await addLine(header, 10);
      const occurrence = makeOccurrence(line, item, { qty: '1.5E-3' });
      await occurrence.save();
      const stored = (await rawRows(adapter, `SELECT "qty" FROM ${tableRef(backend, 'bom_line_occurrence')} WHERE "id" = '${occurrence.id}'`))[0];
      expect(stored?.[0]).toBe('0.0015');

      occurrence.qty = '1.50';
      await occurrence.save();
      const after = (await rawRows(adapter, `SELECT "qty" FROM ${tableRef(backend, 'bom_line_occurrence')} WHERE "id" = '${occurrence.id}'`))[0];
      expect(after?.[0]).toBe('1.5');
    });

    it('qty 34 位有效数字存储与回读逐字相同（US-511 AC#22 ① 存储段）', async () => {
      const { item, header } = await setup();
      const qty = '1.000000000000000000000000000000001';
      const line = await addLine(header, 10);
      const occurrence = makeOccurrence(line, item, { qty });
      await occurrence.save();
      const stored = (await rawRows(adapter, `SELECT "qty" FROM ${tableRef(backend, 'bom_line_occurrence')} WHERE "id" = '${occurrence.id}'`))[0];
      expect(stored?.[0]).toBe(qty);
    });

    it('直连 SQL 写非规范串被拒并点名字段（US-511 AC#23 存储段）', async () => {
      const { item, header } = await setup();
      const line = await addLine(header, 10);
      for (const bad of ['1.5E-3', '01', '1.50', '-0']) {
        const result = await settled(
          adapter.rawQuery(
            `INSERT INTO ${tableRef(backend, 'bom_line_occurrence')} ("id", "lineId", "childItemId", "qty", "effectiveFrom") VALUES ('${uuid()}', '${line.id}', '${item.id}', '${bad}', '2026-01-01T00:00:00.000Z')`
          )
        );
        expect(result.ok, bad).toBe(false);
        expect(String((result as { error: Error }).error.message)).toContain('rxdb:bom_decimal_format:qty');
      }
    });

    it('入口拒绝非法值：语法错 / 非有限 / 空串 / 35 位 / 负值（US-511 AC#23）', () => {
      for (const bad of ['1e', 'NaN', 'Infinity', '', '12345678901234567890123456789012345', '-1']) {
        expect(() => normalizeDecimalString(bad, 'qty'), bad).toThrow(BomDecimalFormatError);
      }
      expect(normalizeDecimalString('1.5E-3', 'qty')).toBe('0.0015');
      expect(normalizeDecimalString('-0', 'qty')).toBe('0');
      expect(DECIMAL_CANONICAL_RE.test('0.0015')).toBe(true);
      expect(DECIMAL_CANONICAL_RE.test('1.50')).toBe(false);
    });
  });
}
