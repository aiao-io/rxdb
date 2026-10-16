/**
 * @fileoverview 序列 / 批次有效域三维重叠守卫的触发器 DDL 生成（US-518，SQLite 与 PGlite 各一份）
 *
 * 同一逻辑行（`lineId` 相同）的两个发生项，**日期、序列、批次三维同时相交**才算重叠并拒绝
 * （AC#5）；任一维不相交即可并存（AC#7/#8/#9/#10）。判定口径与解析侧纯函数
 * `resolve/unit-lot.ts` 同源：日期半开 `[from, to)`（ISO 文本比较）、序列闭区间
 * （NULL 侧 = 1 / 无上界，用 COALESCE + IS NULL 双保险避开三值逻辑吞谓词）、
 * 批次集合相交（NULL = 全部批次；SQLite 用 `json_each`、PGlite 用
 * `jsonb_array_elements_text`，触发器 SQL 不用正则）。
 *
 * 消息前缀 `rxdb:bom_effectivity_overlap:`（与 US-030 的归一约定同构），错误带三维
 * 相交的 detail 文本。DDL 幂等：SQLite `CREATE TRIGGER IF NOT EXISTS`，PG 函数
 * `CREATE OR REPLACE` + DO 块内 `DROP TRIGGER IF EXISTS`（PGlite 0.5.8 解析器坑：
 * 裸 `CREATE TRIGGER` 走 DO 块、`EXECUTE FUNCTION` 目标不带引号，照抄现有先例）。
 *
 * 另给 AC#4 的 `unit_from ≤ unit_to` 单行 CHECK 表达式文本（US-030 阶段 A 的落点）。
 */

import { EntityMetadata, getEntityColumnName, quoteSqlIdentifier } from '@aiao/rxdb';

// 触发器消息前缀：三维有效域重叠（归一入口在 types.normalizeBomError）。
import { BOM_EFFECTIVITY_OVERLAP_PREFIX } from '../types.js';
export { BOM_EFFECTIVITY_OVERLAP_PREFIX };

/** SQLite 物理表名：`namespace$tableName`（与 sqlite-core 的表名约定一致）。 */
const sqliteTableRef = (metadata: EntityMetadata): string =>
  quoteSqlIdentifier(`${metadata.namespace}$${metadata.tableName}`);

/** PG 表引用：`"schema"."table"`。 */
const pgTableRef = (metadata: EntityMetadata): string =>
  `${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(metadata.tableName)}`;

const column = (metadata: EntityMetadata, field: string): string =>
  quoteSqlIdentifier(getEntityColumnName(metadata, field) as string);

const sqliteTrigger = (tableRef: string, name: string, timing: string, body: string): string =>
  [`CREATE TRIGGER IF NOT EXISTS ${quoteSqlIdentifier(name)}`, `${timing} ON ${tableRef}`, `BEGIN`, body, `END;`].join(
    '\n'
  );

const pgFunctionHeader = (metadata: EntityMetadata, name: string): string =>
  `CREATE OR REPLACE FUNCTION ${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(name)}() RETURNS trigger AS $$\nBEGIN`;

// 守卫函数只挂在 INSERT / UPDATE 上，放行一律 RETURN NEW（无 DELETE 分支）
const pgFunctionFooter = `\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;`;

/**
 * PG 触发器创建语句：包进 `DO $$` 块（PGlite 0.5.8 解析不了裸 `CREATE TRIGGER`）；
 * `EXECUTE FUNCTION` 的目标**不得加引号**（探针：加引号报 `at end of input`）。
 */
const pgCreateTrigger = (
  metadata: EntityMetadata,
  tableRef: string,
  name: string,
  events: string,
  functionName: string
): string =>
  `DO $$\nBEGIN\n  DROP TRIGGER IF EXISTS ${quoteSqlIdentifier(name)} ON ${tableRef};\n  CREATE TRIGGER ${quoteSqlIdentifier(name)} ${events} ON ${tableRef} FOR EACH ROW EXECUTE FUNCTION ${metadata.namespace}.${functionName}();\nEND $$;`;

// -----------------------------------------------------[ 三维判定谓词 ]

/**
 * 日期半开相交（两后端同一文本，ISO 文本比较）：
 * `aTo 无界 或 aFrom < bTo` 且 `bTo 无界 或 bFrom < aTo`。
 */
const dateOverlap = (a: string, b: string): string =>
  `(${b}."effectiveTo" IS NULL OR ${a}."effectiveFrom" < ${b}."effectiveTo") AND ` +
  `(${a}."effectiveTo" IS NULL OR ${b}."effectiveFrom" < ${a}."effectiveTo")`;

/**
 * 序列闭区间相交（NULL 侧 = 1 / 无上界）：`COALESCE(a.unitFrom, 1) ≤ b.unitTo`
 * 且 `COALESCE(b.unitFrom, 1) ≤ a.unitTo`。COALESCE 把 NULL 下界折叠为 1 参与比较，
 * 无上界侧用 IS NULL 短路——三值逻辑下 NULL 恒不吞拒绝。
 */
const unitOverlap = (a: string, b: string): string =>
  `(${b}."unitTo" IS NULL OR COALESCE(${a}."unitFrom", 1) <= ${b}."unitTo") AND ` +
  `(${a}."unitTo" IS NULL OR COALESCE(${b}."unitFrom", 1) <= ${a}."unitTo")`;

/** SQLite 侧批次集合相交：任一侧 NULL = 全部批次；否则经 `json_each` 求集合交集。 */
const sqliteLotOverlap = (a: string, b: string): string =>
  `((${a}."lotCodes" IS NULL OR json_array_length(${a}."lotCodes") > 0) AND ` +
  `(${b}."lotCodes" IS NULL OR json_array_length(${b}."lotCodes") > 0) AND ` +
  `(${a}."lotCodes" IS NULL OR ${b}."lotCodes" IS NULL OR EXISTS (` +
  `SELECT 1 FROM json_each(${a}."lotCodes") ja WHERE EXISTS (` +
  `SELECT 1 FROM json_each(${b}."lotCodes") jb WHERE jb.value = ja.value))))`;

/** PGlite 侧批次集合相交：任一侧 NULL = 全部批次；否则经 `jsonb_array_elements_text` 求集合交集。 */
const pgLotOverlap = (a: string, b: string): string =>
  `((${a}."lotCodes" IS NULL OR jsonb_array_length(${a}."lotCodes"::jsonb) > 0) AND ` +
  `(${b}."lotCodes" IS NULL OR jsonb_array_length(${b}."lotCodes"::jsonb) > 0) AND ` +
  `(${a}."lotCodes" IS NULL OR ${b}."lotCodes" IS NULL OR EXISTS (` +
  `SELECT 1 FROM jsonb_array_elements_text(${a}."lotCodes"::jsonb) AS ja(x) WHERE EXISTS (` +
  `SELECT 1 FROM jsonb_array_elements_text(${b}."lotCodes"::jsonb) AS jb(y) WHERE jb.y = ja.x))))`;

// -----------------------------------------------------[ 消息 detail 文本 ]

/** SQLite 侧日期区间文本：`[from, to)`，无上界记 `+∞`。 */
const sqliteDateText = (row: string): string =>
  `'[' || ${row}."effectiveFrom" || ', ' || COALESCE(${row}."effectiveTo", '+∞') || ')'`;

/** SQLite 侧序列区间文本：闭区间，NULL 下界折叠为 1。 */
const sqliteUnitText = (row: string): string =>
  `'[' || COALESCE(CAST(${row}."unitFrom" AS TEXT), '1') || ', ' || COALESCE(CAST(${row}."unitTo" AS TEXT), '+∞') || ']'`;

/** SQLite 侧批次集合文本：`{B1,B2}`；NULL = 全部。 */
const sqliteLotText = (row: string): string =>
  `COALESCE((SELECT '{' || group_concat(je.value, ',') || '}' FROM json_each(${row}."lotCodes") je), '全部')`;

/** PGlite 侧日期区间文本（`::text` 保证串接）。 */
const pgDateText = (row: string): string =>
  `'[' || ${row}."effectiveFrom"::text || ', ' || COALESCE(${row}."effectiveTo"::text, '+∞') || ')'`;

/** PGlite 侧序列区间文本。 */
const pgUnitText = (row: string): string =>
  `'[' || COALESCE(${row}."unitFrom"::text, '1') || ', ' || COALESCE(${row}."unitTo"::text, '+∞') || ']'`;

/** PGlite 侧批次集合文本：`{B1,B2}`；NULL = 全部。 */
const pgLotText = (row: string): string =>
  `COALESCE((SELECT '{' || string_agg(t.x, ',') || '}' FROM jsonb_array_elements_text(${row}."lotCodes"::jsonb) AS t(x)), '全部')`;

// -----------------------------------------------------[ SQLite ]

/**
 * SQLite 侧三维重叠守卫：`bom_line_occurrence` 的 BEFORE INSERT / BEFORE UPDATE 触发器，
 * 同 `lineId` 的既有行（按 id 排除自身）与 NEW 行三维同时相交即 RAISE(ABORT, 带 detail 消息)。
 * 不设头状态门槛——有效域交集是逻辑行的域不变量（同 US-508 日期排他的作用域）。
 */
export const buildUnitLotOverlapGuardSqlite = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = tableRef;
  const row = 'NEW';
  // 消息点名两个发生项 id 与三维两侧区间（与纯函数 detail 同形态）
  const message =
    `'${BOM_EFFECTIVITY_OVERLAP_PREFIX}同一逻辑行发生项有效域重叠：'` +
    ` || ${row}."id" || ' 与 ' || b."id"` +
    ` || '、日期 ' || ${sqliteDateText(row)} || ' ∩ ' || ${sqliteDateText('b')}` +
    ` || '、序列 ' || ${sqliteUnitText(row)} || ' ∩ ' || ${sqliteUnitText('b')}` +
    ` || '、批次 ' || ${sqliteLotText(row)} || ' ∩ ' || ${sqliteLotText('b')}`;
  const guard =
    `SELECT RAISE(ABORT, ${message})` +
    ` FROM ${occurrence} b` +
    ` WHERE b."lineId" = ${row}."lineId" AND b."id" <> ${row}."id"` +
    ` AND ${dateOverlap(row, 'b')} AND ${unitOverlap(row, 'b')} AND ${sqliteLotOverlap(row, 'b')}` +
    ` LIMIT 1;`;
  return [
    sqliteTrigger(tableRef, 'bom_line_occurrence_unit_lot_overlap_i', 'BEFORE INSERT', guard),
    sqliteTrigger(tableRef, 'bom_line_occurrence_unit_lot_overlap_u', 'BEFORE UPDATE', guard)
  ];
};

// -----------------------------------------------------[ PGlite ]

/**
 * PGlite 侧三维重叠守卫：plpgsql 函数 + 触发器（与 SQLite 同口径）。
 * 违规行 SELECT ... INTO violation → RAISE EXCEPTION '%'（先例：阶梯 / 位号发布校验）。
 */
export const buildUnitLotOverlapGuardPg = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = tableRef;
  const row = 'NEW';
  const message =
    `'${BOM_EFFECTIVITY_OVERLAP_PREFIX}同一逻辑行发生项有效域重叠：'` +
    ` || ${row}."id" || ' 与 ' || b."id"` +
    ` || '、日期 ' || ${pgDateText(row)} || ' ∩ ' || ${pgDateText('b')}` +
    ` || '、序列 ' || ${pgUnitText(row)} || ' ∩ ' || ${pgUnitText('b')}` +
    ` || '、批次 ' || ${pgLotText(row)} || ' ∩ ' || ${pgLotText('b')}`;
  const violation =
    `SELECT ${message}` +
    ` FROM ${occurrence} b` +
    ` WHERE b."lineId" = ${row}."lineId" AND b."id" <> ${row}."id"` +
    ` AND ${dateOverlap(row, 'b')} AND ${unitOverlap(row, 'b')} AND ${pgLotOverlap(row, 'b')}` +
    ` LIMIT 1`;
  const body =
    `  DECLARE violation text;\n  BEGIN\n    ${violation} INTO violation;\n` +
    `    IF violation IS NOT NULL THEN\n      RAISE EXCEPTION '%', violation;\n    END IF;\n  END;`;
  return [
    `${pgFunctionHeader(metadata, 'bom_line_occurrence__unit_lot_overlap_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(
      metadata,
      tableRef,
      'bom_line_occurrence__unit_lot_overlap_trg',
      'BEFORE INSERT OR UPDATE',
      'bom_line_occurrence__unit_lot_overlap_guard'
    )
  ];
};

// -----------------------------------------------------[ CHECK 表达式 ]

/**
 * AC#4 的 `unit_from ≤ unit_to` 单行 CHECK 表达式文本（给主会话接入实体 checks 用）。
 *
 * @remarks
 * 表达式为 `"unitFrom" <= "unitTo"`：CHECK 对 NULL 不判违约（三值语义），
 * 任一列为 NULL 的行照常放行，`unitFrom > unitTo` 的行保存即拒（US-030 阶段 A 落点）。
 */
export const unitFromGtUnitToCheck = (metadata: EntityMetadata): string =>
  `${column(metadata, 'unitFrom')} <= ${column(metadata, 'unitTo')}`;
