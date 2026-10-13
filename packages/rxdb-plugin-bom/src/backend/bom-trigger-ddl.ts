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

/**
 * 判环递归 CTE 的深度硬上限（US-509 AC#3）：无闭包表时的兜底。触上限即报错，
 * 不静默通过——脏数据（超深链）与真环都无法在受限深度内判定时，拒绝是唯一诚实的结果。
 */
export const BOM_CYCLE_DEPTH_LIMIT = 128;

/** 环错误消息前缀（US-509「环错误码」：归一为 BomCycleError，携带路径）。 */
const CYCLE = (path: string): string => `rxdb:bom_cycle:${path}`;

/** 深度上限错误（同一前缀，路径段为空——归一为 BomCycleError 且 path 为空）。 */
const CYCLE_DEPTH_LIMIT_MESSAGE = 'rxdb:bom_cycle:depth_limit';

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
  const historyBatchNo = column(metadata, 'historyBatchNo');
  const batchTable = quoteSqlIdentifier('bom$bom_history_batch');
  const when = `OLD.${state} = 'draft' AND NEW.${state} = 'released'`;
  // 追溯生效（US-508 AC#9）：发布当日是存储层取的 UTC 日期；指向开启态历史批次的行跳过
  const body = [
    raiseWhen(PUBLISH_VALIDATION('item_revision', '发布要求 effective_from 非空'), `NEW.${effectiveFrom} IS NULL`),
    raiseWhen(
      PUBLISH_VALIDATION('item_revision', '追溯生效被拒绝（effective_from 早于发布当日）'),
      `NEW.${effectiveFrom} IS NOT NULL AND NEW.${effectiveFrom} < date('now') AND NOT EXISTS (SELECT 1 FROM ${batchTable} b WHERE b."batchNo" = NEW.${historyBatchNo} AND b."state" = 'open')`
    )
  ].join('\n');
  return [sqliteTrigger(sqliteTableRef(metadata), 'item_revision_publish', 'BEFORE UPDATE', body, when)];
};


/** 批次表 append-only（US-508 AC#14）：拒绝删除，UPDATE 只允许 open → closed。 */
const sqliteHistoryBatchTriggers = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHistoryBatch') return [];
  const tableRef = sqliteTableRef(metadata);
  const state = column(metadata, 'state');
  return [
    sqliteTrigger(
      tableRef,
      'bom_history_batch_append_only_d',
      'BEFORE DELETE',
      raiseWhen(WRITE_PROTOCOL('bom_history_batch', '批次表只追加，不允许删除'), '1')
    ),
    sqliteTrigger(
      tableRef,
      'bom_history_batch_transition_u',
      'BEFORE UPDATE',
      raiseWhen(
        WRITE_PROTOCOL('bom_history_batch', '批次行不可改写，只允许 open → closed 转移'),
        `NOT (OLD.${state} = 'open' AND NEW.${state} = 'closed')`
      )
    )
  ];
};

/**
 * 判环触发器（US-509）：同一 `(bom_type, org_id)` 内全部已存 consume 行发生项按物料级并集
 * 判环。入口只有发生项的 INSERT 与 `child_item_id` 变化（UPDATE 按行自身排除旧边、补新边）；
 * 自环是路径长度 0 的退化环，由同一递归命中。并集边不过滤头状态与日期——草稿头与
 * 未生效发生项同样计入（解析不可见 ≠ 判环不可见）。
 */
const sqliteCycleTriggers = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = tableRef;
  const line = quoteSqlIdentifier('bom$bom_line');
  const header = quoteSqlIdentifier('bom$bom_header');
  const revision = quoteSqlIdentifier('bom$item_revision');

  // NEW 行的作用域（bom_type / org_id）与父物料——内联标量子查询：
  // SQLite 不允许递归 CTE 的递归项子查询引用外层 CTE（`no such column: s.x`）
  const scopeType = (row: string): string =>
    `(SELECT h."bomType" FROM ${line} l JOIN ${header} h ON h."id" = l."headerId" WHERE l."id" = ${row}."lineId")`;
  const scopeOrg = (row: string): string =>
    `(SELECT h."orgId" FROM ${line} l JOIN ${header} h ON h."id" = l."headerId" WHERE l."id" = ${row}."lineId")`;
  const parentItem = (row: string): string =>
    `(SELECT r."itemId" FROM ${line} l JOIN ${header} h ON h."id" = l."headerId" JOIN ${revision} r ON r."id" = h."parentRevisionId" WHERE l."id" = ${row}."lineId")`;

  // 并集边（物料级）：表内边排除被更新的行自身，再补 NEW 边
  const edgesSql = (row: string): string =>
    `SELECT r."itemId" AS parent_item_id, occ."childItemId" AS child_item_id` +
    ` FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId"` +
    ` JOIN ${header} h ON h."id" = l."headerId" JOIN ${revision} r ON r."id" = h."parentRevisionId"` +
    ` WHERE h."bomType" = ${scopeType(row)} AND h."orgId" = ${scopeOrg(row)} AND occ."id" IS NOT ${row}."id"` +
    ` UNION ALL SELECT ${parentItem(row)}, ${row}."childItemId"`;

  // WITH 必须在语句顶层（SQLite 不接受 `FROM (WITH ...)` 的括号形态），
  // 末段 SELECT RAISE 在触发器体内对 verdict 行触发。
  // 递归项到达父物料即停止延伸：路径终止于父（正是错误消息要的环路径），
  // 多重边成环时递归不会沿环重复枚举（UNION ALL 不去重，会指数爆炸）
  const cycleCheck = (row: string): string => {
    const edges = edgesSql(row);
    return [
      `WITH reach(item_id, path, depth) AS (`,
      `  SELECT ${row}."childItemId", CAST(${row}."childItemId" AS TEXT), 0`,
      `  UNION ALL`,
      `  SELECT e.child_item_id, reach.path || '>' || e.child_item_id, reach.depth + 1`,
      `  FROM reach JOIN (${edges}) e ON e.parent_item_id = reach.item_id`,
      `  WHERE reach.depth < ${BOM_CYCLE_DEPTH_LIMIT} AND reach.item_id <> ${parentItem(row)}`,
      `),`,
      `found AS (SELECT reach.path FROM reach WHERE reach.item_id = ${parentItem(row)} LIMIT 1),`,
      `truncated AS (`,
      `  SELECT 1 AS hit FROM reach JOIN (${edges}) e ON e.parent_item_id = reach.item_id`,
      `  WHERE reach.depth >= ${BOM_CYCLE_DEPTH_LIMIT} LIMIT 1`,
      `),`,
      `verdict AS (`,
      `  SELECT CASE WHEN EXISTS (SELECT 1 FROM found)` +
        ` THEN (SELECT '${CYCLE('')}' || path FROM found)` +
        ` WHEN EXISTS (SELECT 1 FROM truncated) THEN '${CYCLE_DEPTH_LIMIT_MESSAGE}' END AS msg`,
      `)`,
      `SELECT RAISE(ABORT, verdict.msg) FROM verdict WHERE verdict.msg IS NOT NULL`
    ].join('\n');
  };

  const body = (row: string): string => `  ${cycleCheck(row)};`;

  return [
    sqliteTrigger(tableRef, 'bom_line_occurrence_cycle_i', 'BEFORE INSERT', body('NEW')),
    sqliteTrigger(
      tableRef,
      'bom_line_occurrence_cycle_u',
      'BEFORE UPDATE',
      body('NEW'),
      `NEW."childItemId" IS NOT OLD."childItemId"`
    )
  ];
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
  ...sqliteHistoryBatchTriggers(metadata),
  ...sqliteReleasedHeaderMembersGuard(metadata),
  ...sqliteDecimalFormatTriggers(metadata),
  ...sqliteCycleTriggers(metadata)
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
  const historyBatchNo = column(metadata, 'historyBatchNo');
  const batchTable = pgNamedTable(metadata, 'bom_history_batch');
  const body =
    `  IF OLD.${state} = 'draft' AND NEW.${state} = 'released' THEN\n` +
    `    IF NEW.${effectiveFrom} IS NULL THEN\n` +
    `      RAISE EXCEPTION '${PUBLISH_VALIDATION('item_revision', '发布要求 effective_from 非空')}';\n` +
    `    END IF;\n` +
    `    IF NEW.${effectiveFrom} < (now() AT TIME ZONE 'UTC')::date AND NOT EXISTS (` +
    `SELECT 1 FROM ${batchTable} b WHERE b."batchNo" = NEW.${historyBatchNo} AND b."state" = 'open') THEN\n` +
    `      RAISE EXCEPTION '${PUBLISH_VALIDATION('item_revision', '追溯生效被拒绝（effective_from 早于发布当日）')}';\n` +
    `    END IF;\n` +
    `  END IF;`;
  const tableRef = pgTableRef(metadata);
  return [
    `${pgFunctionHeader(metadata, 'item_revision__publish_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(metadata, tableRef, 'item_revision__publish_trg', 'BEFORE UPDATE', 'item_revision__publish_guard')
  ];
};


const pgHistoryBatchFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHistoryBatch') return [];
  const state = column(metadata, 'state');
  const body =
    `  IF TG_OP = 'DELETE' THEN\n` +
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_history_batch', '批次表只追加，不允许删除')}';\n` +
    `  END IF;\n` +
    `  IF TG_OP = 'UPDATE' AND NOT (OLD.${state} = 'open' AND NEW.${state} = 'closed') THEN\n` +
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_history_batch', '批次行不可改写，只允许 open → closed 转移')}';\n` +
    `  END IF;`;
  const tableRef = pgTableRef(metadata);
  return [
    `${pgFunctionHeader(metadata, 'bom_history_batch__append_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(metadata, tableRef, 'bom_history_batch__append_trg', 'BEFORE DELETE OR UPDATE', 'bom_history_batch__append_guard')
  ];
};

/**
 * PG 判环触发器函数（US-509）：与 SQLite 同口径——同一 `(bom_type, org_id)` 物料级并集、
 * 行自身排除 + NEW 边补充、深度硬上限、三态判定。
 */
const pgCycleFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = tableRef;
  const line = pgNamedTable(metadata, 'bom_line');
  const header = pgNamedTable(metadata, 'bom_header');
  const revision = pgNamedTable(metadata, 'item_revision');
  const limit = BOM_CYCLE_DEPTH_LIMIT;

  // 递归 CTE 的递归项子查询里引用不了兄弟 CTE（PG 报 missing FROM-clause，SQLite 报
  // no such column）——作用域三元组（bomType / orgId / parentItemId）一律内联成标量子查询，
  // 与 SQLite 触发器同口径；PG 递归 CTE 还必须写 RECURSIVE 关键字，裸 WITH 的自引用会被
  // 当成普通表查找（relation "reach" does not exist）
  const scopeType =
    `(SELECT h."bomType" FROM ${line} l JOIN ${header} h ON h."id" = l."headerId" WHERE l."id" = NEW."lineId")`;
  const scopeOrg =
    `(SELECT h."orgId" FROM ${line} l JOIN ${header} h ON h."id" = l."headerId" WHERE l."id" = NEW."lineId")`;
  const parentItem =
    `(SELECT r."itemId" FROM ${line} l JOIN ${header} h ON h."id" = l."headerId" JOIN ${revision} r ON r."id" = h."parentRevisionId" WHERE l."id" = NEW."lineId")`;

  // 并集边（物料级）：表内边排除被更新的行自身，再补 NEW 边
  const edgesSql =
    `SELECT r."itemId" AS parent_item_id, occ."childItemId" AS child_item_id` +
    ` FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId"` +
    ` JOIN ${header} h ON h."id" = l."headerId" JOIN ${revision} r ON r."id" = h."parentRevisionId"` +
    ` WHERE h."bomType" = ${scopeType} AND h."orgId" = ${scopeOrg} AND occ."id" IS DISTINCT FROM NEW."id"` +
    ` UNION ALL SELECT ${parentItem}, NEW."childItemId"`;

  const body =
    `  IF TG_OP = 'UPDATE' AND OLD."childItemId" IS NOT DISTINCT FROM NEW."childItemId" THEN\n` +
    `    RETURN NEW;\n` +
    `  END IF;\n` +
    `  WITH RECURSIVE reach(item_id, path, depth) AS (\n` +
    `    SELECT NEW."childItemId", NEW."childItemId"::text, 0\n` +
    `    UNION ALL\n` +
    `    SELECT e.child_item_id, reach.path || '>' || e.child_item_id, reach.depth + 1\n` +
    `    FROM reach JOIN (${edgesSql}) e ON e.parent_item_id = reach.item_id\n` +
    `    WHERE reach.depth < ${limit} AND reach.item_id <> ${parentItem}\n` +
    `  ),\n` +
    `  found AS (SELECT reach.path FROM reach WHERE reach.item_id = ${parentItem} LIMIT 1),\n` +
    `  truncated AS (SELECT 1 AS hit FROM reach JOIN (${edgesSql}) e ON e.parent_item_id = reach.item_id WHERE reach.depth >= ${limit} LIMIT 1)\n` +
    `  SELECT CASE\n` +
    `    WHEN EXISTS (SELECT 1 FROM found) THEN '${CYCLE('')}' || (SELECT path FROM found)\n` +
    `    WHEN EXISTS (SELECT 1 FROM truncated) THEN '${CYCLE_DEPTH_LIMIT_MESSAGE}'\n` +
    `  END INTO msg FROM (SELECT 1) AS seed;\n` +
    `  IF msg IS NOT NULL THEN\n` +
    `    RAISE EXCEPTION '%', msg;\n` +
    `  END IF;`;

  // DECLARE 必须在 BEGIN 之前（plpgsql 块结构），函数头单独拼
  const functionHeader = `CREATE OR REPLACE FUNCTION ${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier('bom_line_occurrence__cycle_guard')}() RETURNS trigger AS $$\nDECLARE msg text;\nBEGIN`;
  const functionFooter = `\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;`;
  return [
    `${functionHeader}\n${body}${functionFooter}`,
    pgCreateTrigger(metadata, tableRef, 'bom_line_occurrence__cycle_trg', 'BEFORE INSERT OR UPDATE', 'bom_line_occurrence__cycle_guard')
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
  ...pgHistoryBatchFunction(metadata),
  ...pgReleasedHeaderMembersFunction(metadata),
  ...pgDecimalFormatFunction(metadata),
  ...pgCycleFunction(metadata)
];
