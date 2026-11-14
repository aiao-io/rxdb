/**
 * @fileoverview 批量写入与单条写入同一保存期口径（BOM 分支第二轮评审 P1-2 同类绕过）
 *
 * `saveMany` / `mutations` / 多实体 `save()` 不经仓储的单条 create / update，由仓储的批量写钩子在同一个写事务里
 * 兑现同一组校验：写前规范化十进制与 ext，写后、提交前按本批写入后的库状态校验（同批内互相引用的行可见），
 * 违约整批回滚。双后端（wa-sqlite / pglite）同断言。
 */

import { describe, expect, it } from 'vitest';
import {
  BomAttrDef,
  BomConfigChar,
  BomConfigCharValue,
  BomConfigCondition,
  BomHeader,
  BomItem,
  BomItemRevision,
  BomLine,
  BomLineOccurrence
} from '../entities.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { BomConfigError, CONDITION_GRAMMAR_VERSION } from '../resolve/config-condition.js';
import { BomExtAttrError } from '../resolve/ext-attr.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const rand = (): string => Math.random().toString(36).slice(2, 10);

const countRows = async (adapter: BomTestAdapter, table: string, column: string, value: string): Promise<number> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const result = await adapter.rawQuery(
    `SELECT COUNT(*) FROM ${dialect.table(table)} WHERE "${column}" = ${dialect.placeholder(0)}`,
    [value]
  );
  return Number(result.rows[0][0]);
};

const readColumn = async (adapter: BomTestAdapter, table: string, column: string, id: string): Promise<unknown> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const result = await adapter.rawQuery(
    `SELECT "${column}" FROM ${dialect.table(table)} WHERE "id" = ${dialect.placeholder(0)}`,
    [id]
  );
  return result.rows[0]?.[0];
};

/** 一个组织下的颜色特征、红色取值与「颜色 = 红」条件（经单条保存，走完整保存期校验）。 */
const conditionOf = async (adapter: BomTestAdapter, orgId: string): Promise<BomConfigCondition> => {
  const em = adapter.rxdb.entityManager;
  const char = em.instantiate(BomConfigChar, { orgId, code: '颜色', required: false });
  await char.save();
  await em.instantiate(BomConfigCharValue, { charId: char.id, value: '红' }).save();
  const condition = em.instantiate(BomConfigCondition, {
    orgId,
    expression: '颜色 = 红',
    grammarVersion: CONDITION_GRAMMAR_VERSION
  });
  await condition.save();
  return condition;
};

/** 组织 orgId 下一张草稿头（父件、修订与头都经单条保存）。 */
const draftHeaderOf = async (adapter: BomTestAdapter, orgId: string): Promise<BomHeader> => {
  const em = adapter.rxdb.entityManager;
  const parent = em.instantiate(BomItem, { itemNo: `batch-parent-${rand()}` });
  await parent.save();
  const revision = em.instantiate(BomItemRevision, { itemId: parent.id, revisionNo: 'A' });
  await revision.save();
  const header = em.instantiate(BomHeader, { parentRevisionId: revision.id, bomType: 'ebom', orgId });
  await header.save();
  return header;
};

/** 每条用例独立建库：字典与条件只属于本用例。 */
const withAdapter = async (backend: BomTestBackend, run: (adapter: BomTestAdapter) => Promise<void>): Promise<void> => {
  const adapter = await createBomTestAdapter(backend);
  try {
    await run(adapter);
  } finally {
    await disposeBomTestAdapter(adapter);
  }
};

for (const backend of BACKENDS) {
  describe(`批量写入与单条写入同一保存期口径 [${backend}]`, () => {
    it(
      'saveMany 缺必填扩展属性整批拒绝且一行不落库；合法批次照常提交并规范化 ext',
      () =>
        withAdapter(backend, async adapter => {
          const em = adapter.rxdb.entityManager;
          await em
            .instantiate(BomAttrDef, {
              code: 'rohs',
              dataType: 'string',
              required: true,
              appliesTo: 'item',
              enumValues: '["yes","no"]'
            })
            .save();
          const prefix = `batch-ext-${rand()}`;
          const missing = [
            em.instantiate(BomItem, { itemNo: `${prefix}-a` }),
            em.instantiate(BomItem, { itemNo: `${prefix}-b` })
          ];

          await expect(em.saveMany(missing)).rejects.toBeInstanceOf(BomExtAttrError);
          expect(await countRows(adapter, 'item', 'itemNo', `${prefix}-a`)).toBe(0);
          expect(await countRows(adapter, 'item', 'itemNo', `${prefix}-b`)).toBe(0);

          const valid = em.instantiate(BomItem, { itemNo: `${prefix}-ok`, ext: '{ "rohs" : "yes" }' });
          await em.saveMany([valid, em.instantiate(BomItem, { itemNo: `${prefix}-ok2`, ext: '{"rohs":"no"}' })]);
          expect(await readColumn(adapter, 'item', 'ext', valid.id)).toBe('{"rohs":"yes"}');
        }),
      60_000
    );

    it(
      '同批新建的逻辑行与挂选择条件的发生项互相可见；条件属他组织时整批拒绝',
      () =>
        withAdapter(backend, async adapter => {
          const em = adapter.rxdb.entityManager;
          const own = await conditionOf(adapter, 'org-batch');
          const foreign = await conditionOf(adapter, 'org-other');
          const header = await draftHeaderOf(adapter, 'org-batch');
          const child = em.instantiate(BomItem, { itemNo: `batch-child-${rand()}` });
          await child.save();
          const occurrenceOf = (line: BomLine, selectionConditionId: string, qty: string): BomLineOccurrence =>
            em.instantiate(BomLineOccurrence, {
              lineId: line.id,
              childItemId: child.id,
              qty,
              uom: 'pcs',
              effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
              selectionConditionId
            });

          const line = em.instantiate(BomLine, { headerId: header.id, lineNo: 10 });
          const occurrence = occurrenceOf(line, own.id, '2.50');
          await em.saveMany([line, occurrence]);
          expect(await readColumn(adapter, 'bom_line_occurrence', 'qty', occurrence.id)).toBe('2.5');

          const rejectedLine = em.instantiate(BomLine, { headerId: header.id, lineNo: 20 });
          await expect(em.saveMany([rejectedLine, occurrenceOf(rejectedLine, foreign.id, '1')])).rejects.toBeInstanceOf(
            BomConfigError
          );
          expect(await countRows(adapter, 'bom_line', 'id', rejectedLine.id)).toBe(0);
        }),
      60_000
    );
  });
}
