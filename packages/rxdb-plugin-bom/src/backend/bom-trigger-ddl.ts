/**
 * @fileoverview BOM 存储层触发器的 DDL 生成（SQLite 与 PGlite 各一份）
 *
 * 覆盖 US-507 阶段 A / B 的三类不变量：
 * 1. 结构归属列创建后不可改（修订→物料、头→修订/类型/组织、行→头、发生项→行，AC#13）；
 * 2. 已发布修订除 `draft → released` 外不可改（AC#14），发布转移要求 `effective_from` 非空；
 * 3. 已发布头的成员写入按 US-515 写入协议拒绝（首轮无 ECN，全部拒绝，AC#10）；
 * 另加十进制值合同的格式触发器（US-511 AC#23 的存储段）。
 *
 * 消息前缀 `rxdb:<kind>:`（与 US-030 的归一约定同构），错误类归插件（见 `types.ts`）。
 * 触发器 DDL 幂等：SQLite `CREATE TRIGGER IF NOT EXISTS`，PG 函数 `CREATE OR REPLACE` +
 * `DROP TRIGGER IF EXISTS`。声明只覆盖**状态转移与直连 SQL** 的判定面，跨行聚合
 * （位号计数等）随 US-507 阶段 C 接进发布转移。
 */

import { EntityMetadata, getEntityColumnName, quoteSqlIdentifier } from '@aiao/rxdb';

/** SQLite 物理表名：`namespace$tableName`（与 sqlite-core 的表名约定一致）。 */
const sqliteTableRef = (metadata: EntityMetadata): string => quoteSqlIdentifier(`${metadata.namespace}$${metadata.tableName}`);

/** PG 表引用：`"schema"."table"`。 */
const pgTableRef = (metadata: EntityMetadata): string => `${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(metadata.tableName)}`;

const column = (metadata: EntityMetadata, field: string): string =>
  quoteSqlIdentifier(getEntityColumnName(metadata, field) as string);

// -----------------------------------------------------[ 消息文本 ]

const WRITE_PROTOCOL = (subject: string, detail: string): string => `rxdb:bom_write_protocol:${subject}:${detail}`;
const PUBLISH_VALIDATION = (subject: string, detail: string): string =>
  `rxdb:bom_publish_validation:${subject}:${detail}`;
const DECIMAL_FORMAT = (field: string): string => `rxdb:bom_decimal_format:${field}`;

/** 结构归属列的不可改判据（SQLite：`IS NOT`，PG：`IS DISTINCT FROM` 的反）。 */
const STRUCTURAL_COLUMNS: ReadonlyMap<string, readonly string[]> = new Map([
  ['BomItemRevision', ['itemId']],
  ['BomHeader', ['parentRevisionId', 'bomType', 'orgId']],
  ['BomLine', ['headerId']],
  ['BomLineOccurrence', ['lineId']]
]);

// -----------------------------------------------------[ SQLite ]

/** 一条 `SELECT RAISE(ABORT, …) WHERE …` 触发体（多个条件逐个点名）。 */
const raiseWhen = (message: string, condition: string): string =>
  `  SELECT RAISE(ABORT, '${message}') WHERE ${condition};`;

const sqliteTrigger = (tableRef: string, name: string, timing: string, body: string, when?: string): string =>
  [
    `CREATE TRIGGER IF NOT EXISTS ${quoteSqlIdentifier(name)}`,
    `${timing} ON ${tableRef}`,
    ...(when ? [`WHEN ${when}`] : []),
    `BEGIN`,
    body,
    `END;`
  ].join('\n');

const sqliteStructuralTrigger = (metadata: EntityMetadata): string[] => {
  const columns = STRUCTURAL_COLUMNS.get(metadata.name) ?? [];
  if (columns.length === 0) return [];
  const tableRef = sqliteTableRef(metadata);
  const body = columns
    .map(field =>
      raiseWhen(
        WRITE_PROTOCOL(getEntityColumnName(metadata, field) as string, '结构归属列创建后不可改（草稿里也不可改）'),
        `NEW.${column(metadata, field)} IS NOT OLD.${column(metadata, field)}`
      )
    )
    .join('\n');
  return [sqliteTrigger(tableRef, `${metadata.tableName}_structural`, 'BEFORE UPDATE', body)];
};

const sqlitePublishedRevisionTrigger = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomItemRevision') return [];
  const state = column(metadata, 'state');
  const fields = ['revisionNo', 'defaultPhantom', 'effectiveFrom'].map(field => column(metadata, field));
  const changed = fields.map(field => `NEW.${field} IS NOT OLD.${field}`).join(' OR ');
  const when = `OLD.${state} = 'released' AND (NEW.${state} = 'draft' OR ${changed})`;
  const body = raiseWhen(
    WRITE_PROTOCOL('item_revision', '已发布修订除状态转移外不可改（改虚拟件标记须发布新修订）'),
    '1'
  );
  return [sqliteTrigger(sqliteTableRef(metadata), 'item_revision_published', 'BEFORE UPDATE', body, when)];
};

const sqlitePublishTransitionTrigger = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomItemRevision') return [];
  const state = column(metadata, 'state');
  const effectiveFrom = column(metadata, 'effectiveFrom');
  const when = `OLD.${state} = 'draft' AND NEW.${state} = 'released' AND NEW.${effectiveFrom} IS NULL`;
  const body = raiseWhen(
    PUBLISH_VALIDATION('item_revision', '发布要求 effective_from 非空'),
    '1'
  );
  return [sqliteTrigger(sqliteTableRef(metadata), 'item_revision_publish', 'BEFORE UPDATE', body, when)];
};

const sqliteReleasedHeaderMembersGuard = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLine' && metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = sqliteTableRef(metadata);
  const headerRef = quoteSqlIdentifier('bom$bom_header');
  const lineRef = quoteSqlIdentifier('bom$bom_line');
  // 发生项经逻辑行找头；逻辑行直接找头
  const ownerColumn = column(metadata, metadata.name === 'BomLine' ? 'headerId' : 'lineId');
  const join =
    metadata.name === 'BomLine' ?
      `SELECT 1 FROM ${headerRef} WHERE "id" = NEW.${ownerColumn} AND "state" = 'released'`
    : `SELECT 1 FROM ${headerRef} h JOIN ${lineRef} l ON l."headerId" = h."id" WHERE l."id" = NEW.${ownerColumn} AND h."state" = 'released'`;
  const message = WRITE_PROTOCOL(metadata.tableName, '已发布头的成员写入全部拒绝（首轮无 ECN）');
  const guards: string[] = [];
  for (const [timing, row] of [
    ['BEFORE INSERT', 'NEW'],
    ['BEFORE UPDATE', 'NEW'],
    ['BEFORE DELETE', 'OLD']
  ] as const) {
    const condition = `EXISTS (${join.replaceAll(`NEW.${ownerColumn}`, `${row}.${ownerColumn}`)})`;
    guards.push(
      sqliteTrigger(
        tableRef,
        `${metadata.tableName}_released_header_${timing === 'BEFORE INSERT' ? 'i' : timing === 'BEFORE UPDATE' ? 'u' : 'd'}`,
        timing,
        raiseWhen(message, condition)
      )
    );
  }
  return guards;
};

/**
 * 规范十进制串的逐字节谓词（与 DECIMAL_CANONICAL_RE 同定义；GLOB 的 `X*` 是「X 一次 + 通配」，
 * 表达不了「零个或多个数字」，改用反类 + substr/instr/replace 的逐字节判定）：
 * 1. 全串只含数字与至多一个小数点（`[^0-9.]` 反类一次判全串）；
 * 2. 以数字开头（顺带保证非空、无符号）；
 * 3. 无前导零（单个 `0` 或 `0.` 开头除外）；
 * 4. 含小数点时末位不是 `0`（无尾随零）。
 */
const CANONICAL_GLOB = `(
  NEW."qty" NOT GLOB '*[^0-9.]*' AND
  length(replace(NEW."qty", '.', '')) >= length(NEW."qty") - 1 AND
  substr(NEW."qty", 1, 1) BETWEEN '0' AND '9' AND
  (substr(NEW."qty", 1, 1) <> '0' OR NEW."qty" = '0' OR substr(NEW."qty", 1, 2) = '0.') AND
  (instr(NEW."qty", '.') = 0 OR substr(NEW."qty", -1, 1) <> '0')
)`;

const sqliteDecimalFormatTriggers = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = sqliteTableRef(metadata);
  const message = DECIMAL_FORMAT('qty');
  return [
    sqliteTrigger(tableRef, 'bom_line_occurrence_qty_format_i', 'BEFORE INSERT', raiseWhen(message, `NOT ${CANONICAL_GLOB}`)),
    sqliteTrigger(tableRef, 'bom_line_occurrence_qty_format_u', 'BEFORE UPDATE', raiseWhen(message, `NOT ${CANONICAL_GLOB}`))
  ];
};

/** 实体全部 SQLite 触发器 DDL（单条语句数组）。 */
export const buildSqliteBomTriggerDdl = (metadata: EntityMetadata): string[] => [
  ...sqliteStructuralTrigger(metadata),
  ...sqlitePublishedRevisionTrigger(metadata),
  ...sqlitePublishTransitionTrigger(metadata),
  ...sqliteReleasedHeaderMembersGuard(metadata),
  ...sqliteDecimalFormatTriggers(metadata)
];

// -----------------------------------------------------[ PGlite ]

const pgFunctionHeader = (metadata: EntityMetadata, name: string): string =>
  `CREATE OR REPLACE FUNCTION ${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(name)}() RETURNS trigger AS $$\nBEGIN`;

const pgFunctionFooter = `\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;`;

/**
 * 触发器创建语句：包进 `DO $$` 块——PGlite 0.5.8 的扩展协议解析不了裸 `CREATE TRIGGER`，
 * 仓库既有先例（notify 触发器）正是 DO 块形态。DROP IF EXISTS 一并收进块内。
 * `EXECUTE FUNCTION` 的目标**不得加引号**（探针：`"bom"."t__guard"` 让解析器报
 * `at end of input`）；schema 与函数名都由本插件生成、落在安全标识符集内，裸写安全。
 */
const pgCreateTrigger = (
  metadata: EntityMetadata,
  tableRef: string,
  name: string,
  events: string,
  functionName: string
): string =>
  `DO $$\nBEGIN\n  DROP TRIGGER IF EXISTS ${quoteSqlIdentifier(name)} ON ${tableRef};\n  CREATE TRIGGER ${quoteSqlIdentifier(name)} ${events} ON ${tableRef} FOR EACH ROW EXECUTE FUNCTION ${metadata.namespace}.${functionName}();\nEND $$;`;

/** 同命名空间下的另一张 BOM 表引用（BOM 实体共享 `bom` 命名空间）。 */
const pgNamedTable = (metadata: EntityMetadata, tableName: string): string =>
  `${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(tableName)}`;;

const pgStructuralFunction = (metadata: EntityMetadata): string[] => {
  const columns = STRUCTURAL_COLUMNS.get(metadata.name) ?? [];
  if (columns.length === 0) return [];
  const checks = columns
    .map(
      field =>
        `  IF OLD.${column(metadata, field)} IS DISTINCT FROM NEW.${column(metadata, field)} THEN\n` +
        `    RAISE EXCEPTION '${WRITE_PROTOCOL(getEntityColumnName(metadata, field) as string, '结构归属列创建后不可改（草稿里也不可改）')}';\n  END IF;`
    )
    .join('\n');
  const functionName = `${metadata.tableName}__structural_guard`;
  const tableRef = pgTableRef(metadata);
  return [
    `${pgFunctionHeader(metadata, functionName)}\n${checks}${pgFunctionFooter}`,
    pgCreateTrigger(metadata, tableRef, `${metadata.tableName}__structural_trg`, 'BEFORE UPDATE', `${metadata.tableName}__structural_guard`)
  ];
};

const pgPublishedRevisionFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomItemRevision') return [];
  const state = column(metadata, 'state');
  const changed = ['revisionNo', 'defaultPhantom', 'effectiveFrom']
    .map(field => `OLD.${column(metadata, field)} IS DISTINCT FROM NEW.${column(metadata, field)}`)
    .join(' OR ');
  const body =
    `  IF OLD.${state} = 'released' AND (NEW.${state} = 'draft' OR ${changed}) THEN\n` +
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('item_revision', '已发布修订除状态转移外不可改（改虚拟件标记须发布新修订）')}';\n  END IF;`;
  const tableRef = pgTableRef(metadata);
  return [
    `${pgFunctionHeader(metadata, 'item_revision__published_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(metadata, tableRef, 'item_revision__published_trg', 'BEFORE UPDATE', 'item_revision__published_guard')
  ];
};

const pgPublishTransitionFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomItemRevision') return [];
  const state = column(metadata, 'state');
  const effectiveFrom = column(metadata, 'effectiveFrom');
  const body =
    `  IF OLD.${state} = 'draft' AND NEW.${state} = 'released' AND NEW.${effectiveFrom} IS NULL THEN\n` +
    `    RAISE EXCEPTION '${PUBLISH_VALIDATION('item_revision', '发布要求 effective_from 非空')}';\n  END IF;`;
  const tableRef = pgTableRef(metadata);
  return [
    `${pgFunctionHeader(metadata, 'item_revision__publish_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(metadata, tableRef, 'item_revision__publish_trg', 'BEFORE UPDATE', 'item_revision__publish_guard')
  ];
};

const pgReleasedHeaderMembersFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLine' && metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = pgTableRef(metadata);
  const headerRef = pgNamedTable(metadata, 'bom_header');
  const lineRef = pgNamedTable(metadata, 'bom_line');
  const ownerColumn = column(metadata, metadata.name === 'BomLine' ? 'headerId' : 'lineId');
  // plpgsql 不会给裸列名补行前缀：DELETE 触发器里 NEW 未赋值，按 TG_OP 选行
  const ownerRef = `CASE WHEN TG_OP = 'DELETE' THEN OLD.${ownerColumn} ELSE NEW.${ownerColumn} END`;
  const join =
    metadata.name === 'BomLine' ?
      `SELECT 1 FROM ${headerRef} WHERE "id" = ${ownerRef} AND "state" = 'released'`
    : `SELECT 1 FROM ${headerRef} h JOIN ${lineRef} l ON l."headerId" = h."id" WHERE l."id" = ${ownerRef} AND h."state" = 'released'`;
  const message = WRITE_PROTOCOL(metadata.tableName, '已发布头的成员写入全部拒绝（首轮无 ECN）');
  const body =
    `  IF EXISTS (${join}) THEN\n    RAISE EXCEPTION '${message}';\n  END IF;`;
  const functionName = `${metadata.tableName}__released_header_guard`;
  return [
    `${pgFunctionHeader(metadata, functionName)}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(metadata, tableRef, `${metadata.tableName}__released_header_trg`, 'BEFORE INSERT OR UPDATE OR DELETE', `${metadata.tableName}__released_header_guard`)
  ];
};

const pgDecimalFormatFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLineOccurrence') return [];
  const body =
    `  IF NEW."qty" !~ '^(0|[1-9][0-9]*)(\\.[0-9]*[1-9])?$' THEN\n` +
    `    RAISE EXCEPTION '${DECIMAL_FORMAT('qty')}';\n  END IF;`;
  const tableRef = pgTableRef(metadata);
  return [
    `${pgFunctionHeader(metadata, 'bom_line_occurrence__qty_format_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(metadata, tableRef, 'bom_line_occurrence__qty_format_trg', 'BEFORE INSERT OR UPDATE', 'bom_line_occurrence__qty_format_guard')
  ];
};

/** 实体全部 PGlite 触发器 DDL（单条语句数组）。 */
export const buildPgBomTriggerDdl = (metadata: EntityMetadata): string[] => [
  ...pgStructuralFunction(metadata),
  ...pgPublishedRevisionFunction(metadata),
  ...pgPublishTransitionFunction(metadata),
  ...pgReleasedHeaderMembersFunction(metadata),
  ...pgDecimalFormatFunction(metadata)
];
