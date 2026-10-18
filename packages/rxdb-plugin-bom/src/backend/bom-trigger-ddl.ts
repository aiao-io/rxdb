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
import { BOM_CYCLE_DEPTH_LIMIT } from './constants.js';
import {
  buildPgCoproductDdl,
  buildPgCoproductProjectionChecks,
  buildSqliteCoproductDdl,
  buildSqliteCoproductProjectionChecks
} from './coproduct-trigger-ddl.js';
import { buildPgInstanceNodeDdl, buildSqliteInstanceNodeDdl } from './instance-node-ddl.js';
import { buildPgInstanceSourceDdl, buildSqliteInstanceSourceDdl } from './instance-source-ddl.js';
import { buildUnitLotOverlapGuardPg, buildUnitLotOverlapGuardSqlite } from './unit-lot-trigger-ddl.js';

export { BOM_CYCLE_DEPTH_LIMIT } from './constants.js';

/** SQLite 物理表名：`namespace$tableName`（与 sqlite-core 的表名约定一致）。 */
const sqliteTableRef = (metadata: EntityMetadata): string =>
  quoteSqlIdentifier(`${metadata.namespace}$${metadata.tableName}`);

/** PG 表引用：`"schema"."table"`。 */
const pgTableRef = (metadata: EntityMetadata): string =>
  `${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(metadata.tableName)}`;

const column = (metadata: EntityMetadata, field: string): string =>
  quoteSqlIdentifier(getEntityColumnName(metadata, field) as string);

// -----------------------------------------------------[ 消息文本 ]

const WRITE_PROTOCOL = (subject: string, detail: string): string => `rxdb:bom_write_protocol:${subject}:${detail}`;
const PUBLISH_VALIDATION = (subject: string, detail: string): string =>
  `rxdb:bom_publish_validation:${subject}:${detail}`;
const DECIMAL_FORMAT = (field: string, detail?: string): string =>
  `rxdb:bom_decimal_format:${field}${detail ? `:${detail}` : ''}`;

/** 环错误消息前缀（US-509「环错误码」：归一为 BomCycleError，携带路径）。 */
const CYCLE = (path: string): string => `rxdb:bom_cycle:${path}`;

/** 深度上限错误（同一前缀，路径段为空——归一为 BomCycleError 且 path 为空）。 */
const CYCLE_DEPTH_LIMIT_MESSAGE = 'rxdb:bom_cycle:depth_limit';

/** 结构归属列的不可改判据（SQLite：`IS NOT`，PG：`IS DISTINCT FROM` 的反）。 */
const STRUCTURAL_COLUMNS: ReadonlyMap<string, readonly string[]> = new Map([
  ['BomItemRevision', ['itemId']],
  ['BomHeader', ['parentRevisionId', 'bomType', 'orgId']],
  ['BomLineDesignator', ['occurrenceId']],
  ['BomLineOperationSplit', ['occurrenceId']],
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
    // US-513：只有 consume 边进入并集图（by_product / scrap_out 是反向物料流）
    ` AND occ."flowDirection" = 'consume'` +
    ` UNION ALL SELECT ${parentItem(row)}, ${row}."childItemId" WHERE ${row}."flowDirection" = 'consume'`;

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

  // US-513：非 consume 边（by_product / scrap_out）是反向物料流，整体不进入判环
  return [
    sqliteTrigger(
      tableRef,
      'bom_line_occurrence_cycle_i',
      'BEFORE INSERT',
      body('NEW'),
      `NEW."flowDirection" = 'consume'`
    ),
    sqliteTrigger(
      tableRef,
      'bom_line_occurrence_cycle_u',
      'BEFORE UPDATE',
      body('NEW'),
      `NEW."flowDirection" = 'consume' AND NEW."childItemId" IS NOT OLD."childItemId"`
    )
  ];
};

/** ECN 表引用（本步新增守卫共用）。 */
const sqliteEcnRef = quoteSqlIdentifier('bom$ecn');

/** 目标 ECN 处于某状态集的谓词（id 列名由调用方给出）。 */
const ecnStateIs = (idExpr: string, states: string): string =>
  `EXISTS (SELECT 1 FROM ${sqliteEcnRef} e WHERE e."id" = ${idExpr} AND e."state" IN (${states}))`;

/** 目标 ECN 是「运行时可挂」状态：draft，或 released 且属于开启态历史批次（历史装载通道）。 */
const ecnAttachable = (idExpr: string): string =>
  `(${ecnStateIs(idExpr, "'draft'")} OR EXISTS (SELECT 1 FROM ${sqliteEcnRef} e JOIN ${quoteSqlIdentifier('bom$bom_history_batch')} b ON b."batchNo" = e."historyBatchNo" WHERE e."id" = ${idExpr} AND e."state" = 'released' AND b."state" = 'open'))`;

/**
 * 发生项区间由 ECN 派生的保存期守卫（US-515 AC#5/#15/#16，**任何头**都生效）：
 * 挂 `ecn_in` 的行 `effective_from` 必须恰等于该 ECN 生效日、`ecn_out` 的截止标记
 * 同语句把 `effective_to` 收窄为 ECN 生效日；同一发生项只能一个截止方、只能截止
 * 无 ECN 或已发布的发生项。INSERT 不打截止标记。
 */
const sqliteEcnOccurrenceGuards = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = sqliteTableRef(metadata);
  const ecnRef = sqliteEcnRef;
  const derivedFrom = (row: string): string =>
    `(SELECT e."effectiveDate" FROM ${ecnRef} e WHERE e."id" = ${row}."ecnInId")`;
  const derivedTo = (row: string): string =>
    `(SELECT e."effectiveDate" FROM ${ecnRef} e WHERE e."id" = ${row}."ecnOutId")`;
  const guards: string[] = [];

  // INSERT：挂 ECN 时状态可挂 + 区间派生；ecnOutId 只能经 UPDATE 打标记
  // 三值逻辑：violation 每一项都写成二元谓词（IS NOT / IS NULL），NULL 不吞拒绝
  // 历史装载豁免：行所属头挂开启态批次（loadHistory 通道）时 INSERT 可直接带截止标记
  const historicalInsert =
    `EXISTS (SELECT 1 FROM ${quoteSqlIdentifier('bom$bom_line')} l JOIN ${quoteSqlIdentifier('bom$bom_header')} h ON h."id" = l."headerId"` +
    ` JOIN ${quoteSqlIdentifier('bom$bom_history_batch')} b ON b."batchNo" = h."historyBatchNo"` +
    ` WHERE l."id" = NEW."lineId" AND b."state" = 'open')`;
  const insertViolation =
    `NEW."ecnInId" IS NOT NULL AND (` +
    `NOT ${ecnAttachable('NEW."ecnInId"')} OR NEW."effectiveFrom" IS NOT ${derivedFrom('NEW')} OR ` +
    `(NEW."ecnOutId" IS NOT NULL AND NOT ${historicalInsert}) OR NEW."effectiveTo" IS NOT NULL) OR ` +
    `(NEW."ecnInId" IS NULL AND NEW."ecnOutId" IS NOT NULL AND NOT ${historicalInsert})`;
  guards.push(
    sqliteTrigger(
      tableRef,
      'bom_line_occurrence_ecn_derive_i',
      'BEFORE INSERT',
      raiseWhen(WRITE_PROTOCOL(metadata.tableName, '发生项区间必须由 ECN 派生（真相源唯一，AC#5）'), insertViolation)
    )
  );

  // UPDATE：打标记 / 清标记 / 挂 ECN 行的区间改动，三种形态各自校验
  const markViolation =
    `OLD."ecnOutId" IS NULL AND NEW."ecnOutId" IS NOT NULL AND (` +
    `NOT ${ecnAttachable('NEW."ecnOutId"')} OR ` +
    `(OLD."ecnInId" IS NOT NULL AND NOT ${ecnStateIs('OLD."ecnInId"', "'released'")}) OR ` +
    `OLD."effectiveTo" IS NOT NULL OR ` +
    `NEW."effectiveTo" IS NOT ${derivedTo('NEW')})`;
  const unmarkViolation = `OLD."ecnOutId" IS NOT NULL AND NEW."ecnOutId" IS NULL AND NEW."effectiveTo" IS NOT NULL`;
  // 已有截止方的发生项不得再挂第二个截止方（AC#15，任何头）
  const secondMarkViolation = `OLD."ecnOutId" IS NOT NULL AND NEW."ecnOutId" IS NOT NULL AND NEW."ecnOutId" IS NOT OLD."ecnOutId"`;
  const pinnedViolation =
    `NEW."ecnInId" IS NOT OLD."ecnInId" OR ` +
    `(NEW."ecnInId" IS NOT NULL AND NEW."effectiveFrom" IS NOT ${derivedFrom('NEW')}) OR ` +
    `(NEW."ecnOutId" IS NOT NULL AND NEW."ecnOutId" IS OLD."ecnOutId" AND NEW."effectiveTo" IS NOT ${derivedTo('NEW')})`;
  guards.push(
    sqliteTrigger(
      tableRef,
      'bom_line_occurrence_ecn_derive_u',
      'BEFORE UPDATE',
      [
        raiseWhen(
          WRITE_PROTOCOL(
            metadata.tableName,
            '截止标记违约（单截止方 / 只能截止已发布或普通发生项 / 区间由 ECN 派生，AC#15/#16）'
          ),
          markViolation
        ),
        raiseWhen(WRITE_PROTOCOL(metadata.tableName, '清截止标记必须同步恢复 effective_to 为空'), unmarkViolation),
        raiseWhen(WRITE_PROTOCOL(metadata.tableName, '同一发生项只能有一个截止方（AC#15）'), secondMarkViolation),
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '挂 ECN 的发生项区间改动必须等于派生值（ecn 列不可改指）'),
          pinnedViolation
        )
      ].join('\n')
    )
  );
  return guards;
};

/** 发生项协议外列（打标记 / 清标记 / 区间级联之外的一切改动都拒绝）。 */
const SQLITE_OCCURRENCE_PROTOCOL_COLUMNS = [
  'childItemId',
  'childRevisionId',
  'qty',
  'qtyFormula',
  'formulaGrammarVersion',
  'isFixedQty',
  'tierGroupNo',
  'lotsizeFrom',
  'lotsizeTo',
  'componentScrap',
  'componentScrapConvention',
  'componentScrapFixed',
  'uom',
  'uomConversion',
  'phantomOverride',
  'designatorManaged',
  'flowDirection',
  'jointCostShare',
  'substituteGroupId',
  'substituteRole',
  'substitutePriority',
  'usageProbability',
  'equivQty',
  'operationSeq',
  'supplyToVendor',
  'unitFrom',
  'unitTo',
  'lotCodes',
  'selectionConditionId',
  'ext',
  'ecnInId'
] as const;

/**
 * 已发布头的行 / 发生项写入协议（US-515 矩阵，US-507 AC#10 的追加放行）：
 * 行 INSERT 挂 draft ECN；行 DELETE 挂 draft/cancelled ECN 且发生项已先删；行 UPDATE 全拒。
 * 发生项 INSERT 挂 draft ECN（行归属与成员组归属按 AC#26）；打截止标记（空 → X，X draft、
 * 本行无 ECN 或已发布、当前 +∞、同语句收窄为 X 生效日）；清标记（X → 空，X draft/cancelled、
 * effective_to 同步恢复）；区间级联（新值恰等于派生值）；其余 UPDATE 全拒。
 */
const sqliteReleasedHeaderMembersGuard = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLine' && metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = sqliteTableRef(metadata);
  const headerRef = quoteSqlIdentifier('bom$bom_header');
  const lineRef = quoteSqlIdentifier('bom$bom_line');
  // 发生项经逻辑行找头；逻辑行直接找头
  const ownerColumn = column(metadata, metadata.name === 'BomLine' ? 'headerId' : 'lineId');
  const releasedJoin =
    metadata.name === 'BomLine' ?
      (row: string): string => `SELECT 1 FROM ${headerRef} WHERE "id" = ${row}.${ownerColumn} AND "state" = 'released'`
    : (row: string): string =>
        `SELECT 1 FROM ${headerRef} h JOIN ${lineRef} l ON l."headerId" = h."id" WHERE l."id" = ${row}.${ownerColumn} AND h."state" = 'released'`;
  const guards: string[] = [];

  if (metadata.name === 'BomLine') {
    const message = WRITE_PROTOCOL(
      metadata.tableName,
      '已发布头的逻辑行：仅放行挂 draft ECN 的插入与挂 draft/cancelled ECN 的删除'
    );
    guards.push(
      sqliteTrigger(
        tableRef,
        `${metadata.tableName}_released_header_i`,
        'BEFORE INSERT',
        raiseWhen(message, `EXISTS (${releasedJoin('NEW')}) AND NOT (${ecnAttachable('NEW."ecnInId"')})`)
      ),
      sqliteTrigger(
        tableRef,
        `${metadata.tableName}_released_header_u`,
        'BEFORE UPDATE',
        raiseWhen(message, `EXISTS (${releasedJoin('NEW')})`)
      ),
      sqliteTrigger(
        tableRef,
        `${metadata.tableName}_released_header_d`,
        'BEFORE DELETE',
        raiseWhen(
          message,
          `EXISTS (${releasedJoin('OLD')}) AND NOT (` +
            `${ecnStateIs('OLD."ecnInId"', "'draft', 'cancelled'")} AND ` +
            `NOT EXISTS (SELECT 1 FROM ${quoteSqlIdentifier('bom$bom_line_occurrence')} occ WHERE occ."lineId" = OLD."id"))`
        )
      )
    );
    return guards;
  }

  // BomLineOccurrence
  void tableRef;
  const ecnRef = sqliteEcnRef;
  const derivedFrom = (row: string): string =>
    `(SELECT e."effectiveDate" FROM ${ecnRef} e WHERE e."id" = ${row}."ecnInId")`;
  const derivedTo = (row: string): string =>
    `(SELECT e."effectiveDate" FROM ${ecnRef} e WHERE e."id" = ${row}."ecnOutId")`;
  // 所属逻辑行的 ECN 归属（AC#26 ①）：无 ECN、已发布或同一张 draft ECN——violation 形式
  const lineOwnerViolation = (row: string): string =>
    `EXISTS (SELECT 1 FROM ${lineRef} l WHERE l."id" = ${row}."lineId" AND l."ecnInId" IS NOT NULL AND ` +
    `l."ecnInId" IS NOT ${row}."ecnInId" AND NOT ${ecnStateIs('l."ecnInId"', "'released'")})`;
  // 成员组归属（AC#26 ① 替代组分支）——violation 形式
  const groupOwnerViolation = (row: string): string =>
    `EXISTS (SELECT 1 FROM ${quoteSqlIdentifier('bom$bom_substitute_group')} g WHERE g."id" = ${row}."substituteGroupId" AND ` +
    `g."ecnInId" IS NOT NULL AND g."ecnInId" IS NOT ${row}."ecnInId" AND NOT ${ecnStateIs('g."ecnInId"', "'released'")})`;
  const untouchedColumns = SQLITE_OCCURRENCE_PROTOCOL_COLUMNS.map(
    field => `NEW.${column(metadata, field)} IS NOT OLD.${column(metadata, field)}`
  ).join(' OR ');
  const message = WRITE_PROTOCOL(metadata.tableName, '已发布头的发生项写入超出写入协议矩阵（US-515）');

  // INSERT：挂 draft ECN + 行归属 + 成员组归属 + 区间由 ECN 派生（violation 组合，三值安全）
  const insertViolation =
    `NEW."ecnInId" IS NULL OR NOT ${ecnAttachable('NEW."ecnInId"')} OR ${lineOwnerViolation('NEW')} OR ${groupOwnerViolation('NEW')} OR ` +
    `NEW."effectiveFrom" IS NOT ${derivedFrom('NEW')} OR NEW."ecnOutId" IS NOT NULL OR NEW."effectiveTo" IS NOT NULL`;
  guards.push(
    sqliteTrigger(
      tableRef,
      `${metadata.tableName}_released_header_i`,
      'BEFORE INSERT',
      raiseWhen(message, `EXISTS (${releasedJoin('NEW')}) AND (${insertViolation})`)
    )
  );

  // UPDATE：三种放行形态——打截止标记 / 清截止标记 / 区间级联（改期与取消的存储层级联）
  const markViolation =
    `OLD."ecnOutId" IS NOT NULL OR NEW."ecnOutId" IS NULL OR ` +
    `NOT ${ecnAttachable('NEW."ecnOutId"')} OR ` +
    `(OLD."ecnInId" IS NOT NULL AND NOT ${ecnStateIs('OLD."ecnInId"', "'released'")}) OR ` +
    `OLD."effectiveTo" IS NOT NULL OR NEW."effectiveTo" IS NOT ${derivedTo('NEW')} OR (${untouchedColumns})`;
  const unmarkViolation =
    `OLD."ecnOutId" IS NULL OR NEW."ecnOutId" IS NOT NULL OR ` +
    `NOT ${ecnStateIs('OLD."ecnOutId"', "'draft', 'cancelled'")} OR ` +
    `NEW."effectiveTo" IS NOT NULL OR (${untouchedColumns})`;
  const draftEditColumns = SQLITE_OCCURRENCE_PROTOCOL_COLUMNS.filter(
    field => !['qty', 'componentScrap', 'operationSeq', 'jointCostShare'].includes(field)
  )
    .map(field => `NEW."${field}" IS NOT OLD."${field}"`)
    .join(' OR ');
  const draftEditViolation =
    `OLD."ecnInId" IS NULL OR NOT ${ecnStateIs('OLD."ecnInId"', "'draft'")} OR ` +
    `OLD."ecnOutId" IS NOT NULL OR NEW."ecnOutId" IS NOT NULL OR ` +
    `NEW."effectiveFrom" IS NOT OLD."effectiveFrom" OR NEW."effectiveTo" IS NOT OLD."effectiveTo" OR (${draftEditColumns})`;
  const rescheduleViolation =
    `(NEW."ecnInId" IS NULL OR NEW."ecnInId" IS NOT OLD."ecnInId" OR ` +
    `NEW."effectiveFrom" IS NOT ${derivedFrom('NEW')} OR NEW."effectiveTo" IS NOT OLD."effectiveTo" OR (${untouchedColumns})) AND ` +
    `(NEW."ecnOutId" IS NULL OR NEW."ecnOutId" IS NOT OLD."ecnOutId" OR ` +
    `NEW."effectiveTo" IS NOT ${derivedTo('NEW')} OR NEW."effectiveFrom" IS NOT OLD."effectiveFrom" OR (${untouchedColumns}))`;
  guards.push(
    `DROP TRIGGER IF EXISTS ${quoteSqlIdentifier(`${metadata.tableName}_released_header_u`)}`,
    sqliteTrigger(
      tableRef,
      `${metadata.tableName}_released_header_u`,
      'BEFORE UPDATE',
      raiseWhen(
        message,
        `EXISTS (${releasedJoin('NEW')}) AND (${markViolation}) AND (${unmarkViolation}) AND (${rescheduleViolation}) AND (${draftEditViolation})`
      )
    )
  );

  // DELETE：挂 draft/cancelled ECN（取消 / 撤回级联）
  guards.push(
    sqliteTrigger(
      tableRef,
      `${metadata.tableName}_released_header_d`,
      'BEFORE DELETE',
      raiseWhen(
        message,
        `EXISTS (${releasedJoin('OLD')}) AND NOT (${ecnStateIs('OLD."ecnInId"', "'draft', 'cancelled'")})`
      )
    )
  );
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
const canonicalGlob = (field: string): string => `(
  NEW."${field}" NOT GLOB '*[^0-9.]*' AND
  length(replace(NEW."${field}", '.', '')) >= length(NEW."${field}") - 1 AND
  substr(NEW."${field}", 1, 1) BETWEEN '0' AND '9' AND
  (substr(NEW."${field}", 1, 1) <> '0' OR NEW."${field}" = '0' OR substr(NEW."${field}", 1, 2) = '0.') AND
  (instr(NEW."${field}", '.') = 0 OR substr(NEW."${field}", -1, 1) <> '0')
)`;

/** 需要格式触发器兜底的十进制列（qty 可空：公式行的 qty 为空，跳过检查）。 */
const SQLITE_DECIMAL_FORMAT_COLUMNS: { entity: string; field: string; nullable: boolean }[] = [
  { entity: 'BomLineOccurrence', field: 'qty', nullable: true },
  { entity: 'BomLineOccurrence', field: 'componentScrap', nullable: false },
  { entity: 'BomLineOccurrence', field: 'componentScrapFixed', nullable: false },
  { entity: 'BomLineOccurrence', field: 'lotsizeFrom', nullable: true },
  { entity: 'BomLineOccurrence', field: 'lotsizeTo', nullable: true },
  { entity: 'BomLineOccurrence', field: 'uomConversion', nullable: true },
  { entity: 'BomHeader', field: 'baseQty', nullable: false },
  { entity: 'BomHeader', field: 'assemblyScrap', nullable: false },
  { entity: 'BomRoutingOperation', field: 'setupTime', nullable: false },
  { entity: 'BomRoutingOperation', field: 'runTime', nullable: false },
  { entity: 'BomRoutingOperation', field: 'fixedTime', nullable: false },
  { entity: 'BomWorkCenter', field: 'overheadRate', nullable: true },
  { entity: 'BomHeader', field: 'costLotQty', nullable: true },
  { entity: 'BomItem', field: 'unitPrice', nullable: true },
  { entity: 'BomItem', field: 'creditPrice', nullable: true }
];

/**
 * 良率制损耗域（US-511 AC#12）：`0 ≤ s < 1` ⇔ `s = '0' OR substr(s, 1, 2) = '0.'`，
 * 逐字节谓词，两后端一致；加成制不受此限。
 */
const sqliteYieldScrapGuard = (field: string, conventionField: string): string =>
  `NEW."${conventionField}" = 'yield' AND NEW."${field}" <> '0' AND substr(NEW."${field}", 1, 2) <> '0.'`;

/**
 * 阶梯边界域（US-511 AC#25/#26）：15 位有效数字、整数部分 ≤ 15 位、小数部分 ≤ 15 位
 * （后两条逐字节长度谓词；有效数字 = 去小数点后去前导零的长度）。
 */
const sqliteLotsizeBoundGuard = (field: string): string => {
  const digits = `replace(NEW."${field}", '.', '')`;
  const significant = `CASE WHEN ${digits} = '0' THEN '0' ELSE ltrim(${digits}, '0') END`;
  return `(
    length(${significant}) > 15 OR
    (CASE WHEN instr(NEW."${field}", '.') = 0 THEN length(NEW."${field}") ELSE instr(NEW."${field}", '.') - 1 END) > 15 OR
    (CASE WHEN instr(NEW."${field}", '.') = 0 THEN 0 ELSE length(NEW."${field}") - instr(NEW."${field}", '.') END) > 15
  )`;
};

const sqliteDecimalFormatTriggers = (metadata: EntityMetadata): string[] => {
  if (!['BomLineOccurrence', 'BomHeader', 'BomRoutingOperation', 'BomWorkCenter', 'BomItem'].includes(metadata.name))
    return [];
  const tableRef = sqliteTableRef(metadata);
  const statements: string[] = [];
  for (const { entity, field, nullable } of SQLITE_DECIMAL_FORMAT_COLUMNS) {
    if (entity !== metadata.name) continue;
    const violation =
      nullable ? `NEW."${field}" IS NOT NULL AND NOT ${canonicalGlob(field)}` : `NOT ${canonicalGlob(field)}`;
    const message = DECIMAL_FORMAT(field);
    statements.push(
      sqliteTrigger(
        tableRef,
        `${metadata.tableName}_${field}_decimal_i`,
        'BEFORE INSERT',
        raiseWhen(message, violation)
      ),
      sqliteTrigger(
        tableRef,
        `${metadata.tableName}_${field}_decimal_u`,
        'BEFORE UPDATE',
        raiseWhen(message, violation)
      )
    );
  }
  // 良率制损耗域（AC#12）
  if (metadata.name === 'BomHeader') {
    const message = DECIMAL_FORMAT('assemblyScrap', '良率制损耗必须在 [0,1)（s = 1 拒绝）');
    statements.push(
      sqliteTrigger(
        tableRef,
        'bom_header_assembly_scrap_yield_i',
        'BEFORE INSERT',
        raiseWhen(message, sqliteYieldScrapGuard('assemblyScrap', 'assemblyScrapConvention'))
      ),
      sqliteTrigger(
        tableRef,
        'bom_header_assembly_scrap_yield_u',
        'BEFORE UPDATE',
        raiseWhen(message, sqliteYieldScrapGuard('assemblyScrap', 'assemblyScrapConvention'))
      )
    );
  }
  if (metadata.name === 'BomLineOccurrence') {
    const message = DECIMAL_FORMAT('componentScrap', '良率制损耗必须在 [0,1)（s = 1 拒绝）');
    statements.push(
      sqliteTrigger(
        tableRef,
        'bom_line_occurrence_component_scrap_yield_i',
        'BEFORE INSERT',
        raiseWhen(message, sqliteYieldScrapGuard('componentScrap', 'componentScrapConvention'))
      ),
      sqliteTrigger(
        tableRef,
        'bom_line_occurrence_component_scrap_yield_u',
        'BEFORE UPDATE',
        raiseWhen(message, sqliteYieldScrapGuard('componentScrap', 'componentScrapConvention'))
      )
    );
    // 阶梯边界域（AC#25/#26）
    for (const field of ['lotsizeFrom', 'lotsizeTo'] as const) {
      const boundMessage = DECIMAL_FORMAT(field, '阶梯边界限 15 位有效数字、整数与小数部分各 ≤ 15 位');
      statements.push(
        sqliteTrigger(
          tableRef,
          `bom_line_occurrence_${field}_bound_i`,
          'BEFORE INSERT',
          raiseWhen(boundMessage, `NEW."${field}" IS NOT NULL AND ${sqliteLotsizeBoundGuard(field)}`)
        ),
        sqliteTrigger(
          tableRef,
          `bom_line_occurrence_${field}_bound_u`,
          'BEFORE UPDATE',
          raiseWhen(boundMessage, `NEW."${field}" IS NOT NULL AND ${sqliteLotsizeBoundGuard(field)}`)
        )
      );
    }
  }
  return statements;
};

/**
 * 头发布转移的阶梯切片校验（US-511 AC#24）：同 (header, tier_group_no) 组内两条阶梯行，
 * 生效域与批量区间**同时**相交才拒绝（同档跨期改量的旧新发生项并存通过）。
 * 批量比较收窄在 15 位域内（保存期触发器已保证），SQLite `CAST AS REAL` 与 PG `::numeric`
 * 结论一致；区间一律半开 `[from, to)`。
 */
const sqliteTierPublishGuard = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHeader') return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = quoteSqlIdentifier('bom$bom_line_occurrence');
  const line = quoteSqlIdentifier('bom$bom_line');
  const overlap = (a: string, b: string, suffix: string): string =>
    `(${a}."${suffix}To" IS NULL OR CAST(${b}."${suffix}From" AS REAL) < CAST(${a}."${suffix}To" AS REAL)) AND ` +
    `(${b}."${suffix}To" IS NULL OR CAST(${a}."${suffix}From" AS REAL) < CAST(${b}."${suffix}To" AS REAL))`;
  // 日期段用同名 from/to（半开判定一致，但日期段是文本 ISO 比较）
  const dateOverlap = (a: string, b: string): string =>
    `(${a}."effectiveTo" IS NULL OR ${b}."effectiveFrom" < ${a}."effectiveTo") AND ` +
    `(${b}."effectiveTo" IS NULL OR ${a}."effectiveFrom" < ${b}."effectiveTo")`;
  // RAISE 必须是触发器体的顶层语句：消息表达式内联在 SELECT 里（点名组号与两个发生项）
  const message =
    `'${PUBLISH_VALIDATION('bom_header', '阶梯切片重叠：')}'` +
    ` || a."tierGroupNo" || ':' || a."id" || ':' || b."id" || ':日期段与批量段同时相交'`;
  const sql = [
    `SELECT RAISE(ABORT, ${message})`,
    `FROM ${occurrence} a`,
    `JOIN ${line} la ON la."id" = a."lineId"`,
    `JOIN ${occurrence} b ON b."id" <> a."id" AND b."tierGroupNo" = a."tierGroupNo"`,
    `JOIN ${line} lb ON lb."id" = b."lineId"`,
    `WHERE la."headerId" = NEW."id" AND lb."headerId" = NEW."id"`,
    `  AND a."tierGroupNo" IS NOT NULL`,
    `  AND ${dateOverlap('a', 'b')}`,
    `  AND ${overlap('a', 'b', 'lotsize')}`,
    `LIMIT 1;`
  ].join('\n');
  return [
    sqliteTrigger(
      tableRef,
      'bom_header_tier_publish_trg',
      'BEFORE UPDATE OF "state"',
      sql,
      `OLD."state" = 'draft' AND NEW."state" = 'released'`
    )
  ];
};
/**
 * 位号的已发布头协议（US-507 阶段 C + US-515 矩阵）：位号的增删经 occurrence → line → header
 * 判 `released`；INSERT/DELETE 仅放行所属发生项挂 draft（DELETE 另含 cancelled）ECN 的形态，
 * UPDATE 全拒（改位号 = 截止 + 引入，协议外）。
 */
const sqliteDesignatorReleasedGuard = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLineDesignator') return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = quoteSqlIdentifier('bom$bom_line_occurrence');
  const line = quoteSqlIdentifier('bom$bom_line');
  const header = quoteSqlIdentifier('bom$bom_header');
  const message = WRITE_PROTOCOL(metadata.tableName, '已发布头的位号仅放行所属发生项挂 draft/cancelled ECN 的增删');
  const releasedJoin = (row: string): string =>
    `EXISTS (SELECT 1 FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId" JOIN ${header} h ON h."id" = l."headerId" WHERE occ."id" = ${row}."occurrenceId" AND h."state" = 'released')`;
  const ownerEcnIs = (row: string, states: string): string =>
    `EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = ${row}."occurrenceId" AND ${ecnStateIs('occ."ecnInId"', states)})`;
  const ownerAttachable = (row: string): string =>
    `EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = ${row}."occurrenceId" AND ${ecnAttachable('occ."ecnInId"')})`;
  return [
    sqliteTrigger(
      tableRef,
      'bom_line_designator_released_i',
      'BEFORE INSERT',
      raiseWhen(message, `${releasedJoin('NEW')} AND NOT (${ownerAttachable('NEW')})`)
    ),
    sqliteTrigger(tableRef, 'bom_line_designator_released_u', 'BEFORE UPDATE', raiseWhen(message, releasedJoin('NEW'))),
    sqliteTrigger(
      tableRef,
      'bom_line_designator_released_d',
      'BEFORE DELETE',
      raiseWhen(
        message,
        `${releasedJoin('OLD')} AND NOT (${ownerAttachable('OLD')} OR ${ownerEcnIs('OLD', "'cancelled'")})`
      )
    )
  ];
};

/**
 * 位号计数发布校验（US-507 阶段 C，AC#5）：`designator_managed` 且 qty 非空的行的
 * 位号数必须等于名义 qty；错误同时给出位号数与 qty。草稿下可暂不合法（只在发布转移校验）。
 */
const sqliteDesignatorCountGuard = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHeader') return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = quoteSqlIdentifier('bom$bom_line_occurrence');
  const designator = quoteSqlIdentifier('bom$bom_line_designator');
  const line = quoteSqlIdentifier('bom$bom_line');
  const count = (row: string): string => `(SELECT COUNT(*) FROM ${designator} d WHERE d."occurrenceId" = ${row}."id")`;
  // 非整数 qty（含 NULL）不参与比较；整数性由逐字节判定（无小数点）
  const expected = (row: string): string =>
    `CASE WHEN ${row}."qty" IS NULL OR instr(${row}."qty", '.') > 0 THEN -1 ELSE CAST(${row}."qty" AS INTEGER) END`;
  const message =
    `'${PUBLISH_VALIDATION('bom_header', '位号计数违约：')}'` +
    ` || occ."id" || ':位号数' || ${count('occ')} || ':qty' || occ."qty"`;
  const sql = [
    `SELECT RAISE(ABORT, ${message})`,
    `FROM ${occurrence} occ`,
    `JOIN ${line} l ON l."id" = occ."lineId"`,
    `WHERE l."headerId" = NEW."id" AND occ."designatorManaged" = true`,
    `  AND ${count('occ')} <> ${expected('occ')}`,
    `LIMIT 1;`
  ].join('\n');
  return [
    sqliteTrigger(
      tableRef,
      'bom_header_designator_publish_trg',
      'BEFORE UPDATE OF "state"',
      sql,
      `OLD."state" = 'draft' AND NEW."state" = 'released'`
    )
  ];
};
/**
 * 位号级联删除（US-507 阶段 C）：发生项删除时先删其位号。PGlite 0.5.8 的
 * DEFERRABLE FK CASCADE 不生效（探针：FK 声明 confdeltype 'c' 但删除父行后子行仍在），
 * SQLite 侧 FK 级联正常、重复删除无碍——两后端都用触发器兜底，直连删除也自洽。
 */
const sqliteDesignatorCascadeTrigger = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = sqliteTableRef(metadata);
  const designator = quoteSqlIdentifier('bom$bom_line_designator');
  return [
    sqliteTrigger(
      tableRef,
      'bom_line_occurrence_designator_cascade_trg',
      'BEFORE DELETE',
      `DELETE FROM ${designator} WHERE "occurrenceId" = OLD."id";`
    )
  ];
};
/**
 * by_product 子件不得是头父件（US-513 AC#11）：主产物就是头父件，副产自己的头父件
 * 没有意义；发布转移校验（与位号计数同入口形态）。
 */
const sqliteByProductGuard = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHeader') return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = quoteSqlIdentifier('bom$bom_line_occurrence');
  const line = quoteSqlIdentifier('bom$bom_line');
  const header = quoteSqlIdentifier('bom$bom_header');
  const revision = quoteSqlIdentifier('bom$item_revision');
  const message = PUBLISH_VALIDATION('bom_header', 'by_product 行的子件不得是头父件本身（主产物就是头父件）');
  const sql = [
    `SELECT RAISE(ABORT, '${message}')`,
    `FROM ${occurrence} occ`,
    `JOIN ${line} l ON l."id" = occ."lineId"`,
    `JOIN ${header} h ON h."id" = l."headerId"`,
    `JOIN ${revision} r ON r."id" = h."parentRevisionId"`,
    `WHERE l."headerId" = NEW."id" AND occ."flowDirection" = 'by_product' AND occ."childItemId" = r."itemId"`,
    `LIMIT 1;`
  ].join('\n');
  return [
    sqliteTrigger(
      tableRef,
      'bom_header_by_product_guard_trg',
      'BEFORE UPDATE OF "state"',
      sql,
      `OLD."state" = 'draft' AND NEW."state" = 'released'`
    )
  ];
};
/**
 * 替代组的保存期守卫（US-512）：
 * 1. `usage_probability` 域：`[0, 1]`、小数至多 9 位（逐字节 `length <= 11`），
 *    发布合计按定点整数精确比较（AC#15）；
 * 2. 成员跨头（组合外键语义）：成员行的 line 必须与组同属一张头（AC#11 ②）；
 * 3. 组的已发布协议：已发布头的组增删改拒绝（AC#13 的组侧）。
 */
const sqliteSubstituteGuards = (metadata: EntityMetadata): string[] => {
  const statements: string[] = [];
  if (metadata.name === 'BomLineOccurrence') {
    const tableRef = sqliteTableRef(metadata);
    const group = quoteSqlIdentifier('bom$bom_substitute_group');
    const line = quoteSqlIdentifier('bom$bom_line');
    const probabilityMessage = DECIMAL_FORMAT('usageProbability', '替代概率限 [0,1]、小数至多 9 位');
    const probabilityViolation =
      `NEW."usageProbability" IS NOT NULL AND NOT (` +
      `NEW."usageProbability" = '0' OR NEW."usageProbability" = '1' OR ` +
      `(substr(NEW."usageProbability", 1, 2) = '0.' AND length(NEW."usageProbability") <= 11))`;
    statements.push(
      sqliteTrigger(
        tableRef,
        'bom_line_occurrence_probability_domain_i',
        'BEFORE INSERT',
        raiseWhen(probabilityMessage, probabilityViolation)
      ),
      sqliteTrigger(
        tableRef,
        'bom_line_occurrence_probability_domain_u',
        'BEFORE UPDATE',
        raiseWhen(probabilityMessage, probabilityViolation)
      )
    );
    const crossMessage = WRITE_PROTOCOL('bom_line_occurrence', '替代组成员必须与组同属一张头');
    const crossViolation = (row: string): string =>
      `EXISTS (SELECT 1 FROM ${group} g JOIN ${line} l ON l."id" = ${row}."lineId" WHERE g."id" = ${row}."substituteGroupId" AND g."headerId" <> l."headerId")`;
    statements.push(
      sqliteTrigger(
        tableRef,
        'bom_line_occurrence_substitute_cross_i',
        'BEFORE INSERT',
        raiseWhen(crossMessage, crossViolation('NEW'))
      ),
      sqliteTrigger(
        tableRef,
        'bom_line_occurrence_substitute_cross_u',
        'BEFORE UPDATE',
        raiseWhen(crossMessage, crossViolation('NEW'))
      )
    );
  }
  if (metadata.name === 'BomSubstituteGroup') {
    const tableRef = sqliteTableRef(metadata);
    const header = quoteSqlIdentifier('bom$bom_header');
    const message = WRITE_PROTOCOL(
      metadata.tableName,
      '已发布头的替代组仅放行挂 draft ECN 的插入与挂 draft/cancelled ECN 的删除（组属性不可改，改策略即由 ECN 新建一组）'
    );
    const releasedJoin = (row: string): string =>
      `EXISTS (SELECT 1 FROM ${header} h WHERE h."id" = ${row}."headerId" AND h."state" = 'released')`;
    statements.push(
      sqliteTrigger(
        tableRef,
        'bom_substitute_group_released_i',
        'BEFORE INSERT',
        raiseWhen(message, `${releasedJoin('NEW')} AND NOT (${ecnAttachable('NEW."ecnInId"')})`)
      ),
      sqliteTrigger(
        tableRef,
        'bom_substitute_group_released_u',
        'BEFORE UPDATE',
        raiseWhen(message, releasedJoin('NEW'))
      ),
      sqliteTrigger(
        tableRef,
        'bom_substitute_group_released_d',
        'BEFORE DELETE',
        raiseWhen(message, `${releasedJoin('OLD')} AND NOT (${ecnStateIs('OLD."ecnInId"', "'draft', 'cancelled'")})`)
      )
    );
  }
  return statements;
};

/**
 * 替代组发布转移聚合校验（US-512 AC#5/#7/#11/#12/#15）：按生效域桶——
 * 恰好一个 primary（两 primary 相交即违约）、priority 不并列（两非空相等 priority 相交即违约）、
 * proportional 合计恒 1（定点整数 10⁹ 比较，substitute 成员概率不计 primary）。
 */
const sqliteSubstitutePublishGuard = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHeader') return [];
  const tableRef = sqliteTableRef(metadata);
  const group = quoteSqlIdentifier('bom$bom_substitute_group');
  const member = quoteSqlIdentifier('bom$bom_line_occurrence');
  const dateOverlap = (a: string, b: string): string =>
    `(${a}."effectiveTo" IS NULL OR ${b}."effectiveFrom" < ${a}."effectiveTo") AND ` +
    `(${b}."effectiveTo" IS NULL OR ${a}."effectiveFrom" < ${b}."effectiveTo")`;
  const groupIds = `SELECT g."id" FROM ${group} g WHERE g."headerId" = NEW."id"`;
  const messages: [string, string][] = [
    [
      `${PUBLISH_VALIDATION('bom_header', '替代组零成员或缺 primary')}`,
      `EXISTS (SELECT 1 FROM ${group} g WHERE g."headerId" = NEW."id" AND (` +
        `NOT EXISTS (SELECT 1 FROM ${member} m WHERE m."substituteGroupId" = g."id") OR ` +
        `NOT EXISTS (SELECT 1 FROM ${member} m WHERE m."substituteGroupId" = g."id" AND m."substituteRole" = 'primary')))`
    ],
    [
      `${PUBLISH_VALIDATION('bom_header', '替代组同一切片出现两个 primary')}`,
      `EXISTS (SELECT 1 FROM ${member} a JOIN ${member} b ON b."id" <> a."id" AND b."substituteGroupId" = a."substituteGroupId" AND b."substituteRole" = 'primary'` +
        ` WHERE a."substituteRole" = 'primary' AND a."substituteGroupId" IN (${groupIds}) AND ${dateOverlap('a', 'b')})`
    ],
    [
      `${PUBLISH_VALIDATION('bom_header', 'priority 组优先级并列')}`,
      `EXISTS (SELECT 1 FROM ${member} a JOIN ${member} b ON b."id" <> a."id" AND b."substituteGroupId" = a."substituteGroupId" AND b."substitutePriority" = a."substitutePriority"` +
        ` JOIN ${group} g ON g."id" = a."substituteGroupId"` +
        ` WHERE g."headerId" = NEW."id" AND g."strategy" = 'priority'` +
        ` AND a."substitutePriority" IS NOT NULL AND ${dateOverlap('a', 'b')})`
    ]
  ];
  const statements = messages.map(([message, violation], index) =>
    sqliteTrigger(
      tableRef,
      `bom_header_substitute_publish_trg_${index}`,
      'BEFORE UPDATE OF "state"',
      raiseWhen(message, violation),
      `OLD."state" = 'draft' AND NEW."state" = 'released'`
    )
  );
  // proportional 合计（按生效域桶分组；定点整数比较；报错还原合计值）
  // 定点整数还原规范串：整数段（长度 > 9 时取前缀）+ '.' + 右 9 位小数段
  const totalSql =
    `SELECT g."code" || ':' || CASE WHEN length(CAST(t."total" AS TEXT)) > 9` +
    ` THEN substr(CAST(t."total" AS TEXT), 1, length(CAST(t."total" AS TEXT)) - 9) || '.' || substr('000000000' || CAST(t."total" AS TEXT), -9)` +
    ` ELSE '0.' || substr('000000000' || CAST(t."total" AS TEXT), -9) END AS "msg"` +
    ` FROM (SELECT m."substituteGroupId", m."effectiveFrom", m."effectiveTo",` +
    ` SUM(CASE WHEN m."usageProbability" IS NULL THEN 0 ELSE CAST(substr(m."usageProbability" || '000000000', 3, 9) AS INTEGER) END) AS "total"` +
    ` FROM ${member} m JOIN ${group} g ON g."id" = m."substituteGroupId"` +
    ` WHERE g."headerId" = NEW."id" AND g."strategy" = 'proportional'` +
    ` GROUP BY m."substituteGroupId", m."effectiveFrom", m."effectiveTo"` +
    ` HAVING SUM(CASE WHEN m."usageProbability" IS NULL THEN 0 ELSE CAST(substr(m."usageProbability" || '000000000', 3, 9) AS INTEGER) END) <> 1000000000` +
    ` LIMIT 1) t JOIN ${group} g ON g."id" = t."substituteGroupId"`;
  const totalMessage = `'${PUBLISH_VALIDATION('bom_header', '替代组概率合计 ≠ 1：')}' || (${totalSql})`;
  statements.push(
    sqliteTrigger(
      tableRef,
      'bom_header_substitute_publish_total_trg',
      'BEFORE UPDATE OF "state"',
      `SELECT RAISE(ABORT, ${totalMessage}) WHERE EXISTS (${totalSql});`,
      `OLD."state" = 'draft' AND NEW."state" = 'released'`
    )
  );
  return statements;
};
/**
 * 工艺路线的存储守卫（US-524/520）：
 * 1. 分摊比例域 `[0,1]`、小数至多 9 位（与 usage_probability 同域，保存期拒绝）；
 * 2. 工序损耗良率制 `[0,1)`（US-511 记法同域）；
 * 3. 发布转移：头挂路由时投料工序与分摊行必须在路由序集内（挂了必须可解析）；
 *    分摊合计恒 1（按发生项分组，随发生项生效域不跨期相加）。
 */
const sqliteRoutingGuards = (metadata: EntityMetadata): string[] => {
  const statements: string[] = [];
  if (metadata.name === 'BomLineOperationSplit') {
    const tableRef = sqliteTableRef(metadata);
    const message = DECIMAL_FORMAT('ratio', '分摊比例限 [0,1]、小数至多 9 位');
    const violation = `NOT (NEW."ratio" = '0' OR NEW."ratio" = '1' OR (substr(NEW."ratio", 1, 2) = '0.' AND length(NEW."ratio") <= 11))`;
    statements.push(
      sqliteTrigger(
        tableRef,
        'bom_line_operation_split_ratio_domain_i',
        'BEFORE INSERT',
        raiseWhen(message, violation)
      ),
      sqliteTrigger(tableRef, 'bom_line_operation_split_ratio_domain_u', 'BEFORE UPDATE', raiseWhen(message, violation))
    );
    // US-520 AC#6：行既有 operation_seq 又有分摊行——两种表达互斥
    const occurrence = quoteSqlIdentifier('bom$bom_line_occurrence');
    const exclusiveMessage = WRITE_PROTOCOL(
      'bom_line_operation_split',
      '行既有 operation_seq 又有分摊行（两种表达互斥）'
    );
    const exclusiveViolation = `EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = NEW."occurrenceId" AND occ."operationSeq" IS NOT NULL)`;
    statements.push(
      sqliteTrigger(
        tableRef,
        'bom_line_operation_split_exclusive_i',
        'BEFORE INSERT',
        raiseWhen(exclusiveMessage, exclusiveViolation)
      ),
      sqliteTrigger(
        tableRef,
        'bom_line_operation_split_exclusive_u',
        'BEFORE UPDATE',
        raiseWhen(exclusiveMessage, exclusiveViolation)
      )
    );
    // US-515 矩阵：已发布头的分摊行仅放行所属发生项挂 draft（DELETE 另含 cancelled）ECN 的增删
    const line = quoteSqlIdentifier('bom$bom_line');
    const header = quoteSqlIdentifier('bom$bom_header');
    const protocolMessage = WRITE_PROTOCOL(
      'bom_line_operation_split',
      '已发布头的分摊行仅放行所属发生项挂 draft/cancelled ECN 的增删'
    );
    const releasedJoin = (row: string): string =>
      `EXISTS (SELECT 1 FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId" JOIN ${header} h ON h."id" = l."headerId" WHERE occ."id" = ${row}."occurrenceId" AND h."state" = 'released')`;
    const ownerEcnIs = (row: string, states: string): string =>
      `EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = ${row}."occurrenceId" AND ${ecnStateIs('occ."ecnInId"', states)})`;
    const ownerAttachable = (row: string): string =>
      `EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = ${row}."occurrenceId" AND ${ecnAttachable('occ."ecnInId"')})`;
    statements.push(
      sqliteTrigger(
        tableRef,
        'bom_line_operation_split_released_i',
        'BEFORE INSERT',
        raiseWhen(protocolMessage, `${releasedJoin('NEW')} AND NOT (${ownerAttachable('NEW')})`)
      ),
      sqliteTrigger(
        tableRef,
        'bom_line_operation_split_released_u',
        'BEFORE UPDATE',
        raiseWhen(protocolMessage, releasedJoin('NEW'))
      ),
      sqliteTrigger(
        tableRef,
        'bom_line_operation_split_released_d',
        'BEFORE DELETE',
        raiseWhen(
          protocolMessage,
          `${releasedJoin('OLD')} AND NOT (${ownerAttachable('OLD')} OR ${ownerEcnIs('OLD', "'cancelled'")})`
        )
      )
    );
  }
  // US-520 AC#5/#7：行的 operation_seq 在保存期即校验（头已挂路由时必须在工序序集内）
  if (metadata.name === 'BomLineOccurrence') {
    const tableRef = sqliteTableRef(metadata);
    const line = quoteSqlIdentifier('bom$bom_line');
    const header = quoteSqlIdentifier('bom$bom_header');
    const operation = quoteSqlIdentifier('bom$routing_operation');
    const message = WRITE_PROTOCOL('bom_line_occurrence', '投料工序不属于头选定的路线');
    const violation =
      `NEW."operationSeq" IS NOT NULL AND EXISTS (` +
      `SELECT 1 FROM ${line} l JOIN ${header} h ON h."id" = l."headerId"` +
      ` WHERE l."id" = NEW."lineId" AND h."routingId" IS NOT NULL` +
      ` AND NOT EXISTS (SELECT 1 FROM ${operation} op WHERE op."routingId" = h."routingId" AND op."operationSeq" = NEW."operationSeq"))`;
    statements.push(
      sqliteTrigger(tableRef, 'bom_line_occurrence_operation_seq_i', 'BEFORE INSERT', raiseWhen(message, violation)),
      sqliteTrigger(tableRef, 'bom_line_occurrence_operation_seq_u', 'BEFORE UPDATE', raiseWhen(message, violation))
    );
  }
  if (metadata.name === 'BomRoutingOperation') {
    const tableRef = sqliteTableRef(metadata);
    const message = DECIMAL_FORMAT('operationScrap', '良率制损耗必须在 [0,1)（s = 1 拒绝）');
    const violation = `NEW."scrapConvention" = 'yield' AND NEW."operationScrap" <> '0' AND substr(NEW."operationScrap", 1, 2) <> '0.'`;
    statements.push(
      sqliteTrigger(tableRef, 'bom_routing_operation_scrap_yield_i', 'BEFORE INSERT', raiseWhen(message, violation)),
      sqliteTrigger(tableRef, 'bom_routing_operation_scrap_yield_u', 'BEFORE UPDATE', raiseWhen(message, violation))
    );
  }
  if (metadata.name === 'BomHeader') {
    const tableRef = sqliteTableRef(metadata);
    const occurrence = quoteSqlIdentifier('bom$bom_line_occurrence');
    const split = quoteSqlIdentifier('bom$bom_line_operation_split');
    const line = quoteSqlIdentifier('bom$bom_line');
    const operation = quoteSqlIdentifier('bom$routing_operation');
    // 投料工序与分摊行必须在路由序集内
    const seqMessage = PUBLISH_VALIDATION('bom_header', '投料工序 / 分摊行不在路由工序序集内（挂了必须可解析）');
    const seqViolation =
      `NEW."routingId" IS NOT NULL AND EXISTS (` +
      `SELECT 1 FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId"` +
      ` WHERE l."headerId" = NEW."id" AND occ."operationSeq" IS NOT NULL` +
      ` AND NOT EXISTS (SELECT 1 FROM ${operation} op WHERE op."routingId" = NEW."routingId" AND op."operationSeq" = occ."operationSeq"))` +
      ` OR NEW."routingId" IS NOT NULL AND EXISTS (` +
      `SELECT 1 FROM ${split} s JOIN ${occurrence} occ ON occ."id" = s."occurrenceId" JOIN ${line} l ON l."id" = occ."lineId"` +
      ` WHERE l."headerId" = NEW."id"` +
      ` AND NOT EXISTS (SELECT 1 FROM ${operation} op WHERE op."routingId" = NEW."routingId" AND op."operationSeq" = s."operationSeq"))`;
    statements.push(
      sqliteTrigger(
        tableRef,
        'bom_header_routing_seqs_trg',
        'BEFORE UPDATE OF "state"',
        raiseWhen(seqMessage, seqViolation),
        `OLD."state" = 'draft' AND NEW."state" = 'released'`
      )
    );
    // 分摊合计 = 1（按发生项分组；定点整数 10⁹）
    const totalSql =
      `SELECT occ."id" || ':' || '0.' || substr('000000000' || CAST(SUM(CAST(substr(replace(s."ratio", '.', '') || '000000000', 1, 10) AS INTEGER)) AS TEXT), -9) AS "msg"` +
      ` FROM ${split} s JOIN ${occurrence} occ ON occ."id" = s."occurrenceId" JOIN ${line} l ON l."id" = occ."lineId"` +
      ` WHERE l."headerId" = NEW."id"` +
      ` GROUP BY s."occurrenceId"` +
      ` HAVING SUM(CAST(substr(replace(s."ratio", '.', '') || '000000000', 1, 10) AS INTEGER)) <> 1000000000` +
      ` LIMIT 1`;
    const totalMessage = `'${PUBLISH_VALIDATION('bom_header', '投料分摊合计 ≠ 1：')}' || (${totalSql})`;
    statements.push(
      sqliteTrigger(
        tableRef,
        'bom_header_split_total_trg',
        'BEFORE UPDATE OF "state"',
        `SELECT RAISE(ABORT, ${totalMessage}) WHERE EXISTS (${totalSql});`,
        `OLD."state" = 'draft' AND NEW."state" = 'released'`
      )
    );
  }
  return statements;
};
/**
 * 已发布头的字段全拒守卫（US-515 AC#22）：`bom_header` 一旦 released，任何列改动
 * （base_qty / base_uom / 装配损耗 / cost_lot_qty / routing_id 等）都拒绝——头字段要改
 * 须发布新修订；ECN 状态机的级联不碰头表，无放行形态。
 */
const sqliteReleasedHeaderGuard = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHeader') return [];
  // 历史装载通道豁免：存在开启态批次即豁免（loadHistory 补 cost_lot_qty / routing_id；
  // 补丁不改头的批次号，故按「通道开放」判定而非行级批次）
  const historical = `EXISTS (SELECT 1 FROM ${quoteSqlIdentifier('bom$bom_history_batch')} b WHERE b."state" = 'open')`;
  return [
    sqliteTrigger(
      sqliteTableRef(metadata),
      'bom_header_released_fields_u',
      'BEFORE UPDATE',
      raiseWhen(WRITE_PROTOCOL(metadata.tableName, '已发布头字段不可改（改头字段须发布新修订）'), '1'),
      `OLD."state" = 'released' AND NOT (${historical})`
    )
  ];
};

/**
 * ECN 状态机（US-515 存储层，SQLite）：三种转换——发布（draft → released，禁止追溯生效）、
 * 改期（released 且生效日变，未生效才可、不得越过同一逻辑行后继 ECN、级联先收窄后放宽）、
 * 取消 / 撤回（released → cancelled 未生效才可、draft → cancelled 即撤回；级联删除该 ECN
 * 引入的位号 / 分摊 / 发生项 / 逻辑行 / 替代组并清截止标记）。级联在触发器里执行
 * （recursive_triggers 默认关，不递归触发成员表守卫——级联是真相源派生的权威写入）；
 * 任一校验失败 RAISE，级联随语句整体回滚（AC#4 不留半生效状态）。
 * 「当日」= 存储层 UTC：`date('now')`。投影校验见 {@link sqliteEcnProjectionChecks}。
 */
const sqliteEcnStateMachineTriggers = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomEcn') return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = quoteSqlIdentifier('bom$bom_line_occurrence');
  const line = quoteSqlIdentifier('bom$bom_line');
  const designator = quoteSqlIdentifier('bom$bom_line_designator');
  const split = quoteSqlIdentifier('bom$bom_line_operation_split');
  const group = quoteSqlIdentifier('bom$bom_substitute_group');
  const batch = quoteSqlIdentifier('bom$bom_history_batch');
  const ecn = tableRef;
  const dateOf = (row: string): string => `date(${row}."effectiveDate")`;

  // 发布：禁止追溯生效（指向开启态历史批次的行跳过——历史装载通道）
  const publish = [
    `DROP TRIGGER IF EXISTS ${quoteSqlIdentifier('ecn_publish_trg')};`,
    sqliteTrigger(
      tableRef,
      'ecn_publish_trg',
      'AFTER UPDATE',
      [
        raiseWhen(
          PUBLISH_VALIDATION(metadata.tableName, '追溯生效被拒绝（生效日早于发布当日，AC#8）'),
          `${dateOf('NEW')} < date('now') AND NOT EXISTS (SELECT 1 FROM ${batch} b WHERE b."batchNo" = NEW."historyBatchNo" AND b."state" = 'open')`
        ),
        ...sqliteEcnProjectionChecks(metadata, 'NEW."id"', 'NEW."effectiveDate"', 'NEW."historyBatchNo"')
      ].join('\n'),
      `OLD."state" = 'draft' AND NEW."state" = 'released'`
    )
  ];

  // 改期：未生效才可改；不得越过同一逻辑行后继 ECN（AC#20）；级联先收窄后放宽
  const successorViolation =
    `EXISTS (SELECT 1 FROM ${occurrence} o JOIN ${ecn} e ON e."id" = o."ecnOutId"` +
    ` WHERE o."ecnInId" = OLD."id" AND o."ecnOutId" IS NOT NULL AND o."ecnOutId" <> OLD."id"` +
    ` AND ${dateOf('e')} < ${dateOf('NEW')})`;
  const reschedule = [
    `DROP TRIGGER IF EXISTS ${quoteSqlIdentifier('ecn_reschedule_trg')};`,
    sqliteTrigger(
      tableRef,
      'ecn_reschedule_trg',
      'AFTER UPDATE',
      [
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '已生效的 ECN 不可改期，改走更正 ECN（AC#7）'),
          `${dateOf('OLD')} <= date('now')`
        ),
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '改期不得越过同一逻辑行后继 ECN 的生效日（AC#20）：后继'),
          successorViolation
        ),
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '已发布 ECN 改期不得顺带改写其他列'),
          `NEW."reason" IS NOT OLD."reason" OR NEW."historyBatchNo" IS NOT OLD."historyBatchNo"`
        ),
        // 级联：新日期更晚 → 引入行 from 先收窄（变大），截止行 to 后放宽；更早则相反
        `UPDATE ${occurrence} SET "effectiveFrom" = NEW."effectiveDate" WHERE "ecnInId" = OLD."id" AND ${dateOf('NEW')} > ${dateOf('OLD')};`,
        `UPDATE ${occurrence} SET "effectiveTo" = NEW."effectiveDate" WHERE "ecnOutId" = OLD."id" AND ${dateOf('NEW')} < ${dateOf('OLD')};`,
        `UPDATE ${occurrence} SET "effectiveFrom" = NEW."effectiveDate" WHERE "ecnInId" = OLD."id" AND ${dateOf('NEW')} < ${dateOf('OLD')};`,
        `UPDATE ${occurrence} SET "effectiveTo" = NEW."effectiveDate" WHERE "ecnOutId" = OLD."id" AND ${dateOf('NEW')} > ${dateOf('OLD')};`,
        ...sqliteEcnProjectionChecks(
          metadata,
          'OLD."id"',
          `CASE WHEN NEW."effectiveDate" < OLD."effectiveDate" THEN NEW."effectiveDate" ELSE OLD."effectiveDate" END`,
          'NULL'
        )
      ].join('\n'),
      `OLD."state" = 'released' AND NEW."state" = 'released' AND ${dateOf('OLD')} <> ${dateOf('NEW')}`
    )
  ];

  // 取消 / 撤回：released 需未生效；被后续 ECN 截止的引入行不可回退（AC#12）；引入的
  // 行 / 组仍被其他 ECN 引用不可取消（AC#26 ③）；级联删除 + 清截止标记
  const canceledByLaterViolation = `EXISTS (SELECT 1 FROM ${occurrence} o WHERE o."ecnInId" = OLD."id" AND o."ecnOutId" IS NOT NULL AND o."ecnOutId" <> OLD."id")`;
  const referencedLineViolation =
    `EXISTS (SELECT 1 FROM ${occurrence} o WHERE o."lineId" IN (SELECT l."id" FROM ${line} l WHERE l."ecnInId" = OLD."id")` +
    ` AND o."ecnInId" IS NOT NULL AND o."ecnInId" <> OLD."id")`;
  const referencedGroupViolation =
    `EXISTS (SELECT 1 FROM ${occurrence} o WHERE o."substituteGroupId" IN (SELECT g."id" FROM ${group} g WHERE g."ecnInId" = OLD."id")` +
    ` AND o."ecnInId" IS NOT NULL AND o."ecnInId" <> OLD."id")`;
  const cancel = [
    `DROP TRIGGER IF EXISTS ${quoteSqlIdentifier('ecn_cancel_trg')};`,
    sqliteTrigger(
      tableRef,
      'ecn_cancel_trg',
      'AFTER UPDATE',
      [
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '已生效的 ECN 不可取消，改走更正 ECN（AC#7）'),
          `OLD."state" = 'released' AND ${dateOf('OLD')} <= date('now')`
        ),
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '取消被拒：引入的发生项已被后续 ECN 截止，先取消后继 ECN（AC#12）'),
          canceledByLaterViolation
        ),
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '取消被拒：引入的逻辑行仍被其他 ECN 的发生项引用（AC#26 ③）'),
          referencedLineViolation
        ),
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '取消被拒：引入的替代组仍被其他 ECN 的成员引用（AC#26 ③）'),
          referencedGroupViolation
        ),
        // 级联删除：子表 → 发生项 → 逻辑行 / 替代组（删除先于放宽）
        `DELETE FROM ${designator} WHERE "occurrenceId" IN (SELECT o."id" FROM ${occurrence} o WHERE o."ecnInId" = OLD."id");`,
        `DELETE FROM ${split} WHERE "occurrenceId" IN (SELECT o."id" FROM ${occurrence} o WHERE o."ecnInId" = OLD."id");`,
        `DELETE FROM ${occurrence} WHERE "ecnInId" = OLD."id";`,
        `DELETE FROM ${line} WHERE "ecnInId" = OLD."id";`,
        `DELETE FROM ${group} WHERE "ecnInId" = OLD."id";`,
        // 清截止标记并恢复区间
        `UPDATE ${occurrence} SET "ecnOutId" = NULL, "effectiveTo" = NULL WHERE "ecnOutId" = OLD."id";`,
        ...sqliteEcnProjectionChecks(metadata, 'OLD."id"', 'OLD."effectiveDate"', 'NULL')
      ].join('\n'),
      `(OLD."state" = 'released' OR OLD."state" = 'draft') AND NEW."state" = 'cancelled'`
    )
  ];

  // 其余转移拒绝：released → draft、cancelled → *、released 改其他列、任何状态改 ecnNo
  const guard = [
    sqliteTrigger(
      tableRef,
      'ecn_state_guard_trg',
      'BEFORE UPDATE',
      [
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, 'ECN 状态转移不合法：released 不可退回 draft，cancelled 是终态'),
          `(OLD."state" = 'released' AND NEW."state" = 'draft') OR (OLD."state" = 'cancelled')`
        ),
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '已发布 ECN 除改期与取消外不可改写'),
          `OLD."state" = 'released' AND NEW."state" = 'released' AND ${dateOf('OLD')} = ${dateOf('NEW')} AND (` +
            `NEW."reason" IS NOT OLD."reason" OR NEW."historyBatchNo" IS NOT OLD."historyBatchNo")`
        ),
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, 'ecnNo 创建后不可改（结构归属列）'),
          `NEW."ecnNo" IS NOT OLD."ecnNo"`
        )
      ].join('\n')
    )
  ];

  return [...publish, ...reschedule, ...cancel, ...guard];
};

/**
 * 转换后运行投影校验（US-515 AC#9/#23/#24/#25 + US-512 AC#6/#9/#14 + 阶梯 / 位号 / 分摊，
 * SQLite 侧）：ECN 的发布 / 改期 / 取消三种转换在「转换后运行投影」上对全部已发布头做
 * 跨行聚合校验——投影成员排除未发布 ECN 引入的发生项、未发布 ECN 的截止不采信（视为 +∞）；
 * 替代组按「检查点切片」聚合（检查点 = 校验起点 ∪ 成员区间端点，空切片不校验）；
 * 位号计数与分摊合计对目标 ECN 引入的行逐行校验；阶梯按投影成员两两相交校验。
 * 历史装载（目标 ECN 指向开启态批次）跳过全部投影校验——历史结构是既成事实，装载时
 * 已按当时的头发布校验通过。
 *
 * @param metadata - BomEcn 的实体元数据
 * @param target - 目标 ECN 的 id 表达式（触发器行引用）
 * @param startDate - 校验起点表达式（发布取生效日；改期取新旧生效日较小者；取消取原生效日）
 * @param historyBatchNo - 目标 ECN 的批次号表达式（历史装载跳过用；运行时恒 NULL）
 */
const sqliteEcnProjectionChecks = (
  metadata: EntityMetadata,
  target: string,
  startDate: string,
  historyBatchNo: string
): string[] => {
  void metadata;
  const occurrence = quoteSqlIdentifier('bom$bom_line_occurrence');
  const line = quoteSqlIdentifier('bom$bom_line');
  const header = quoteSqlIdentifier('bom$bom_header');
  const ecn = quoteSqlIdentifier('bom$ecn');
  const group = quoteSqlIdentifier('bom$bom_substitute_group');
  const designator = quoteSqlIdentifier('bom$bom_line_designator');
  const split = quoteSqlIdentifier('bom$bom_line_operation_split');
  const batch = quoteSqlIdentifier('bom$bom_history_batch');

  // 历史装载跳过：目标 ECN 的批次号指向开启态批次
  const historical =
    historyBatchNo !== 'NULL' ?
      `EXISTS (SELECT 1 FROM ${batch} b WHERE b."batchNo" = ${historyBatchNo} AND b."state" = 'open')`
    : '0';
  // 投影可见：未发布 ECN 引入的行排除；采信区间：未发布截止视为 +∞
  const visible = (alias: string): string =>
    `(${alias}."ecnInId" IS NULL OR ${alias}."ecnInId" = ${target} OR ` +
    `EXISTS (SELECT 1 FROM ${ecn} e WHERE e."id" = ${alias}."ecnInId" AND e."state" = 'released'))`;
  const trustedTo = (alias: string): string =>
    `CASE WHEN ${alias}."ecnOutId" IS NULL OR ${alias}."ecnOutId" = ${target} OR ` +
    `EXISTS (SELECT 1 FROM ${ecn} e WHERE e."id" = ${alias}."ecnOutId" AND e."state" = 'released') ` +
    `THEN ${alias}."effectiveTo" ELSE NULL END`;

  // 替代组成员（投影 + 采信区间 + 已发布头）
  const membersCte = [
    `WITH members AS (`,
    `  SELECT m."id" AS "mid", m."substituteGroupId" AS "gid", m."effectiveFrom" AS "f",`,
    `    ${trustedTo('m')} AS "t", m."substituteRole" AS "role", m."substitutePriority" AS "prio", m."usageProbability" AS "prob"`,
    `  FROM ${occurrence} m JOIN ${line} l ON l."id" = m."lineId" JOIN ${header} h ON h."id" = l."headerId"`,
    `  WHERE h."state" = 'released' AND m."substituteGroupId" IS NOT NULL AND ${visible('m')}`,
    `),`,
    `points AS (`,
    `  SELECT ${startDate} AS "p"`,
    `  UNION SELECT DISTINCT m."f" FROM members m WHERE m."f" > ${startDate}`,
    `  UNION SELECT DISTINCT m."t" FROM members m WHERE m."t" > ${startDate}`,
    `),`,
    `active AS (`,
    `  SELECT a."gid", po."p", a."role", a."prio", a."prob" FROM members a JOIN points po ON a."f" <= po."p" AND (a."t" IS NULL OR a."t" > po."p")`,
    `)`
  ].join('\n');

  // 定点整数合计还原规范串（与头发布校验同口径）
  const totalText = (total: string): string =>
    `CASE WHEN length(CAST(${total} AS TEXT)) > 9` +
    ` THEN substr(CAST(${total} AS TEXT), 1, length(CAST(${total} AS TEXT)) - 9) || '.' || substr('000000000' || CAST(${total} AS TEXT), -9)` +
    ` ELSE '0.' || substr('000000000' || CAST(${total} AS TEXT), -9) END`;
  const fixedProb = `CAST(substr(a."prob" || '000000000', 3, 9) AS INTEGER)`;

  const guards: string[] = buildSqliteCoproductProjectionChecks(metadata, target, startDate, historyBatchNo);

  // 位号计数（目标 ECN 引入的 managed 行，发布时逐行；AC#9 错误点名头与发生项）
  const designatorCount = (row: string): string =>
    `(SELECT COUNT(*) FROM ${designator} d WHERE d."occurrenceId" = ${row}."id")`;
  const expectedQty = (row: string): string =>
    `CASE WHEN ${row}."qty" IS NULL OR instr(${row}."qty", '.') > 0 THEN -1 ELSE CAST(${row}."qty" AS INTEGER) END`;
  const designatorMessage =
    `'${PUBLISH_VALIDATION('ecn', '位号计数违约：')}'` +
    ` || occ."id" || ':位号数' || ${designatorCount('occ')} || ':qty' || occ."qty"`;
  guards.push(
    `WITH occ AS (SELECT o."id", o."qty" FROM ${occurrence} o JOIN ${line} l ON l."id" = o."lineId" JOIN ${header} h ON h."id" = l."headerId" WHERE o."ecnInId" = ${target} AND h."state" = 'released')` +
      ` SELECT RAISE(ABORT, ${designatorMessage}) FROM occ` +
      ` WHERE NOT (${historical}) AND EXISTS (` +
      `SELECT 1 FROM ${occurrence} o JOIN ${line} l ON l."id" = o."lineId" WHERE o."ecnInId" = ${target} AND o."designatorManaged" = true` +
      ` AND ${designatorCount('o')} <> ${expectedQty('o')} LIMIT 1);`
  );

  // 分摊合计（目标 ECN 引入的发生项，逐发生项定点合计 = 1）
  const splitMessage = `'${PUBLISH_VALIDATION('ecn', '投料分摊合计 ≠ 1：')}' || s."occurrenceId" || ':' || '0.' || substr('000000000' || CAST(SUM(CAST(substr(replace(s."ratio", '.', '') || '000000000', 1, 10) AS INTEGER)) AS TEXT), -9)`;
  guards.push(
    `SELECT RAISE(ABORT, ${splitMessage}) FROM ${split} s JOIN ${occurrence} o ON o."id" = s."occurrenceId"` +
      ` WHERE o."ecnInId" = ${target} AND NOT (${historical})` +
      ` GROUP BY s."occurrenceId" HAVING SUM(CAST(substr(replace(s."ratio", '.', '') || '000000000', 1, 10) AS INTEGER)) <> 1000000000 LIMIT 1;`
  );

  // 替代组：每检查点活动成员非空时恰好一个 primary（空切片不校验，US-512 AC#14）
  const primaryMessage =
    `'${PUBLISH_VALIDATION('ecn', '替代组切片缺 primary 或不止一个 primary：')}'` +
    ` || (SELECT g."code" FROM ${group} g WHERE g."id" = bad."gid") || ':' || bad."p"`;
  guards.push(
    `${membersCte}` +
      ` SELECT RAISE(ABORT, ${primaryMessage}) FROM (` +
      `SELECT a."gid", a."p" FROM active a` +
      ` GROUP BY a."gid", a."p" HAVING COUNT(*) > 0 AND SUM(CASE WHEN a."role" = 'primary' THEN 1 ELSE 0 END) <> 1 LIMIT 1) bad` +
      ` WHERE NOT (${historical});`
  );

  // priority 组：每检查点优先级不并列（NULL 优先级成员彼此不去重）
  const priorityMessage =
    `'${PUBLISH_VALIDATION('ecn', 'priority 组切片优先级并列：')}'` +
    ` || (SELECT g."code" FROM ${group} g WHERE g."id" = bad."gid") || ':' || bad."p" || ':并列' || bad."dup"`;
  guards.push(
    `${membersCte}` +
      ` SELECT RAISE(ABORT, ${priorityMessage}) FROM (` +
      `SELECT a."gid", a."p", (SELECT g."strategy" FROM ${group} g WHERE g."id" = a."gid") AS "strategy",` +
      ` COUNT(*) - COUNT(DISTINCT a."prio") - SUM(CASE WHEN a."prio" IS NULL THEN 1 ELSE 0 END) AS "dup"` +
      ` FROM active a GROUP BY a."gid", a."p"` +
      ` HAVING COUNT(*) > 0 AND (SELECT g."strategy" FROM ${group} g WHERE g."id" = a."gid") = 'priority'` +
      ` AND COUNT(*) <> COUNT(DISTINCT a."prio") + SUM(CASE WHEN a."prio" IS NULL THEN 1 ELSE 0 END) LIMIT 1) bad` +
      ` WHERE NOT (${historical});`
  );

  // proportional 组：每检查点定点合计 = 1（错误给出切片与实际合计）
  const totalMessage =
    `'${PUBLISH_VALIDATION('ecn', '替代组概率合计 ≠ 1：')}'` +
    ` || (SELECT g."code" FROM ${group} g WHERE g."id" = bad."gid") || ':' || bad."p" || ':' || ${totalText('bad."total"')}`;
  guards.push(
    `${membersCte}` +
      ` SELECT RAISE(ABORT, ${totalMessage}) FROM (` +
      `SELECT a."gid", a."p", SUM(${fixedProb}) AS "total" FROM active a` +
      ` GROUP BY a."gid", a."p"` +
      ` HAVING COUNT(*) > 0 AND (SELECT g."strategy" FROM ${group} g WHERE g."id" = a."gid") = 'proportional'` +
      ` AND SUM(${fixedProb}) <> 1000000000 LIMIT 1) bad` +
      ` WHERE NOT (${historical});`
  );

  // 阶梯：投影成员两两「日期段与批量段同时相交」（同头同组；与头发布校验同谓词形态）
  const tierMessage =
    `'${PUBLISH_VALIDATION('ecn', '阶梯切片重叠：')}'` +
    ` || a."tierGroupNo" || ':' || a."id" || ':' || b."id" || ':日期段与批量段同时相交'`;
  const dateOverlap = (x: string, y: string): string =>
    `(${x}."effectiveTo" IS NULL OR ${y}."effectiveFrom" < ${x}."effectiveTo") AND ` +
    `(${y}."effectiveTo" IS NULL OR ${x}."effectiveFrom" < ${y}."effectiveTo")`;
  const lotOverlap = (x: string, y: string, suffix: string): string =>
    `(${x}."${suffix}To" IS NULL OR CAST(${y}."${suffix}From" AS REAL) < CAST(${x}."${suffix}To" AS REAL)) AND ` +
    `(${y}."${suffix}To" IS NULL OR CAST(${x}."${suffix}From" AS REAL) < CAST(${y}."${suffix}To" AS REAL))`;
  guards.push(
    `SELECT RAISE(ABORT, ${tierMessage})` +
      ` FROM ${occurrence} a JOIN ${line} la ON la."id" = a."lineId" JOIN ${header} ha ON ha."id" = la."headerId"` +
      ` JOIN ${occurrence} b ON b."id" <> a."id" AND b."tierGroupNo" = a."tierGroupNo"` +
      ` JOIN ${line} lb ON lb."id" = b."lineId" JOIN ${header} hb ON hb."id" = lb."headerId"` +
      ` WHERE ha."id" = hb."id" AND ha."state" = 'released' AND a."tierGroupNo" IS NOT NULL` +
      ` AND ${visible('a')} AND ${visible('b')} AND ${dateOverlap('a', 'b')} AND ${lotOverlap('a', 'b', 'lotsize')}` +
      ` AND NOT (${historical}) LIMIT 1;`
  );

  return guards;
};

/**
 * 行映射的 NULL 规则（US-516 AC#9，存储层）：added 只 source 空、removed 只 target 空、
 * 其余四态两侧必填、不允许双 NULL。
 */
const sqliteMapNullRuleTriggers = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomMap') return [];
  const tableRef = sqliteTableRef(metadata);
  const message = WRITE_PROTOCOL(
    metadata.tableName,
    'NULL 规则违约：added 只 source 空、removed 只 target 空、其余四态两侧必填、不允许双 NULL'
  );
  const violation = (row: string): string =>
    `(${row}."relation" = 'added' AND (${row}."sourceLineId" IS NOT NULL OR ${row}."targetLineId" IS NULL)) OR ` +
    `(${row}."relation" = 'removed' AND (${row}."targetLineId" IS NOT NULL OR ${row}."sourceLineId" IS NULL)) OR ` +
    `(${row}."relation" NOT IN ('added', 'removed') AND (${row}."sourceLineId" IS NULL OR ${row}."targetLineId" IS NULL))`;
  return [
    sqliteTrigger(tableRef, 'bom_map_null_rule_i', 'BEFORE INSERT', raiseWhen(message, violation('NEW'))),
    sqliteTrigger(tableRef, 'bom_map_null_rule_u', 'BEFORE UPDATE', raiseWhen(message, violation('NEW')))
  ];
};

/** 实体全部 SQLite 触发器 DDL（单条语句数组）。 */

export const buildSqliteBomTriggerDdl = (metadata: EntityMetadata): string[] => [
  ...buildSqliteCoproductDdl(metadata),
  ...buildSqliteInstanceNodeDdl(metadata),
  ...buildSqliteInstanceSourceDdl(metadata),
  // 有效域三维重叠守卫创建最早 = 执行最晚（SQLite 同事件触发器逆创建序）：
  // 让 ECN 派生 / 行归属等更具体的违约先报，三维重叠作兜底
  ...buildUnitLotOverlapGuardSqlite(metadata),
  ...sqliteStructuralTrigger(metadata),
  ...sqlitePublishedRevisionTrigger(metadata),
  ...sqlitePublishTransitionTrigger(metadata),
  ...sqliteHistoryBatchTriggers(metadata),
  ...sqliteEcnStateMachineTriggers(metadata),
  ...sqliteReleasedHeaderMembersGuard(metadata),
  ...sqliteEcnOccurrenceGuards(metadata),
  ...sqliteReleasedHeaderGuard(metadata),
  ...sqliteMapNullRuleTriggers(metadata),
  ...sqliteDecimalFormatTriggers(metadata),
  ...sqliteTierPublishGuard(metadata),
  ...sqliteDesignatorCountGuard(metadata),
  ...sqliteDesignatorReleasedGuard(metadata),
  ...sqliteDesignatorCascadeTrigger(metadata),
  ...sqliteByProductGuard(metadata),
  ...sqliteSubstituteGuards(metadata),
  ...sqliteSubstitutePublishGuard(metadata),
  ...sqliteRoutingGuards(metadata),
  ...sqliteCycleTriggers(metadata)
];

// -----------------------------------------------------[ PGlite ]

const pgFunctionHeader = (metadata: EntityMetadata, name: string): string =>
  `CREATE OR REPLACE FUNCTION ${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(name)}() RETURNS trigger AS $$\nBEGIN`;

// DELETE 触发器返回 NEW 会把删除吞掉（PG 语义：BEFORE DELETE 返回 NEW = 取消删除）——
// 守卫函数统一按 TG_OP 返回：DELETE 放行时 RETURN OLD，INSERT / UPDATE 时 RETURN NEW
const pgFunctionFooter = `\n  IF TG_OP = 'DELETE' THEN\n    RETURN OLD;\n  END IF;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;`;

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
  `${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(tableName)}`;

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
    pgCreateTrigger(
      metadata,
      tableRef,
      `${metadata.tableName}__structural_trg`,
      'BEFORE UPDATE',
      `${metadata.tableName}__structural_guard`
    )
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
    pgCreateTrigger(
      metadata,
      tableRef,
      'item_revision__published_trg',
      'BEFORE UPDATE',
      'item_revision__published_guard'
    )
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
    pgCreateTrigger(
      metadata,
      tableRef,
      'bom_history_batch__append_trg',
      'BEFORE DELETE OR UPDATE',
      'bom_history_batch__append_guard'
    )
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
  const scopeType = `(SELECT h."bomType" FROM ${line} l JOIN ${header} h ON h."id" = l."headerId" WHERE l."id" = NEW."lineId")`;
  const scopeOrg = `(SELECT h."orgId" FROM ${line} l JOIN ${header} h ON h."id" = l."headerId" WHERE l."id" = NEW."lineId")`;
  const parentItem = `(SELECT r."itemId" FROM ${line} l JOIN ${header} h ON h."id" = l."headerId" JOIN ${revision} r ON r."id" = h."parentRevisionId" WHERE l."id" = NEW."lineId")`;

  // 并集边（物料级）：表内边排除被更新的行自身，再补 NEW 边
  const edgesSql =
    `SELECT r."itemId" AS parent_item_id, occ."childItemId" AS child_item_id` +
    ` FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId"` +
    ` JOIN ${header} h ON h."id" = l."headerId" JOIN ${revision} r ON r."id" = h."parentRevisionId"` +
    ` WHERE h."bomType" = ${scopeType} AND h."orgId" = ${scopeOrg} AND occ."id" IS DISTINCT FROM NEW."id"` +
    ` AND occ."flowDirection" = 'consume'` +
    ` UNION ALL SELECT ${parentItem}, NEW."childItemId" WHERE NEW."flowDirection" = 'consume'`;

  const body =
    `  IF NEW."flowDirection" <> 'consume' THEN\n` +
    `    RETURN NEW;\n` +
    `  END IF;\n` +
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
    pgCreateTrigger(
      metadata,
      tableRef,
      'bom_line_occurrence__cycle_trg',
      'BEFORE INSERT OR UPDATE',
      'bom_line_occurrence__cycle_guard'
    )
  ];
};

/** PG 侧 ECN 状态谓词（与 SQLite 侧同口径）。 */
const pgEcnStateIs = (idExpr: string, states: string): string =>
  `EXISTS (SELECT 1 FROM bom.ecn e WHERE e."id" = ${idExpr} AND e."state" IN (${states}))`;

/** PG 侧「运行时可挂」谓词：draft，或 released 且属于开启态历史批次。 */
const pgEcnAttachable = (idExpr: string): string =>
  `(${pgEcnStateIs(idExpr, "'draft'")} OR EXISTS (SELECT 1 FROM bom.ecn e JOIN bom.bom_history_batch b ON b."batchNo" = e."historyBatchNo" WHERE e."id" = ${idExpr} AND e."state" = 'released' AND b."state" = 'open'))`;

/** PG 侧发生项协议外列清单（与 SQLite 侧同）。 */
const PG_OCCURRENCE_PROTOCOL_COLUMNS = [
  'childItemId',
  'childRevisionId',
  'qty',
  'qtyFormula',
  'formulaGrammarVersion',
  'isFixedQty',
  'tierGroupNo',
  'lotsizeFrom',
  'lotsizeTo',
  'componentScrap',
  'componentScrapConvention',
  'componentScrapFixed',
  'uom',
  'uomConversion',
  'phantomOverride',
  'designatorManaged',
  'flowDirection',
  'jointCostShare',
  'substituteGroupId',
  'substituteRole',
  'substitutePriority',
  'usageProbability',
  'equivQty',
  'operationSeq',
  'supplyToVendor',
  'unitFrom',
  'unitTo',
  'lotCodes',
  'selectionConditionId',
  'ext',
  'ecnInId'
] as const;

/**
 * 已发布头的行 / 发生项写入协议（PG 侧，与 SQLite 同口径的矩阵形态）。
 */
const pgReleasedHeaderMembersFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLine' && metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = pgTableRef(metadata);
  const headerRef = pgNamedTable(metadata, 'bom_header');
  const lineRef = pgNamedTable(metadata, 'bom_line');
  const ownerColumn = column(metadata, metadata.name === 'BomLine' ? 'headerId' : 'lineId');
  // plpgsql 不会给裸列名补行前缀：DELETE 触发器里 NEW 未赋值，按 TG_OP 选行
  const ownerRef = `CASE WHEN TG_OP = 'DELETE' THEN OLD.${ownerColumn} ELSE NEW.${ownerColumn} END`;
  const releasedJoin =
    metadata.name === 'BomLine' ?
      `SELECT 1 FROM ${headerRef} WHERE "id" = ${ownerRef} AND "state" = 'released'`
    : `SELECT 1 FROM ${headerRef} h JOIN ${lineRef} l ON l."headerId" = h."id" WHERE l."id" = ${ownerRef} AND h."state" = 'released'`;
  const message = WRITE_PROTOCOL(metadata.tableName, '已发布头的成员写入超出写入协议矩阵（US-515）');

  if (metadata.name === 'BomLine') {
    const body =
      `  IF TG_OP = 'INSERT' AND EXISTS (${releasedJoin}) AND NOT (${pgEcnAttachable('NEW."ecnInId"')}) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n` +
      `  END IF;\n` +
      `  IF TG_OP = 'UPDATE' AND EXISTS (${releasedJoin}) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n` +
      `  END IF;\n` +
      `  IF TG_OP = 'DELETE' AND EXISTS (${releasedJoin}) AND NOT (` +
      `${pgEcnStateIs('OLD."ecnInId"', "'draft', 'cancelled'")} AND ` +
      `NOT EXISTS (SELECT 1 FROM bom.bom_line_occurrence occ WHERE occ."lineId" = OLD."id")) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n` +
      `  END IF;`;
    const functionName = `${metadata.tableName}__released_header_guard`;
    return [
      `${pgFunctionHeader(metadata, functionName)}\n${body}${pgFunctionFooter}`,
      pgCreateTrigger(
        metadata,
        tableRef,
        `${metadata.tableName}__released_header_trg`,
        'BEFORE INSERT OR UPDATE OR DELETE',
        `${metadata.tableName}__released_header_guard`
      )
    ];
  }

  // BomLineOccurrence
  const derivedFrom = `(SELECT e."effectiveDate" FROM bom.ecn e WHERE e."id" = NEW."ecnInId")`;
  const derivedTo = `(SELECT e."effectiveDate" FROM bom.ecn e WHERE e."id" = NEW."ecnOutId")`;
  // 三值逻辑：IF 条件里的 `=` 在 NULL 比较下得到 NULL（不执行），violation 一律二元谓词
  const lineOwnerViolation =
    `EXISTS (SELECT 1 FROM ${lineRef} l WHERE l."id" = NEW."lineId" AND l."ecnInId" IS NOT NULL AND ` +
    `l."ecnInId" IS DISTINCT FROM NEW."ecnInId" AND NOT ${pgEcnStateIs('l."ecnInId"', "'released'")})`;
  const groupOwnerViolation =
    `EXISTS (SELECT 1 FROM bom.bom_substitute_group g WHERE g."id" = NEW."substituteGroupId" AND ` +
    `g."ecnInId" IS NOT NULL AND g."ecnInId" IS DISTINCT FROM NEW."ecnInId" AND NOT ${pgEcnStateIs('g."ecnInId"', "'released'")})`;
  const untouchedColumns = PG_OCCURRENCE_PROTOCOL_COLUMNS.map(
    field => `NEW."${field}" IS DISTINCT FROM OLD."${field}"`
  ).join(' OR ');
  const insertViolation =
    `NEW."ecnInId" IS NULL OR NOT ${pgEcnAttachable('NEW."ecnInId"')} OR ${lineOwnerViolation} OR ${groupOwnerViolation} OR ` +
    `NEW."effectiveFrom" IS DISTINCT FROM ${derivedFrom} OR NEW."ecnOutId" IS NOT NULL OR NEW."effectiveTo" IS NOT NULL`;
  const markViolation =
    `OLD."ecnOutId" IS NOT NULL OR NEW."ecnOutId" IS NULL OR ` +
    `NOT ${pgEcnAttachable('NEW."ecnOutId"')} OR ` +
    `(OLD."ecnInId" IS NOT NULL AND NOT ${pgEcnStateIs('OLD."ecnInId"', "'released'")}) OR ` +
    `OLD."effectiveTo" IS NOT NULL OR NEW."effectiveTo" IS DISTINCT FROM ${derivedTo} OR (${untouchedColumns})`;
  const unmarkViolation =
    `OLD."ecnOutId" IS NULL OR NEW."ecnOutId" IS NOT NULL OR ` +
    `NOT ${pgEcnStateIs('OLD."ecnOutId"', "'draft', 'cancelled'")} OR ` +
    `NEW."effectiveTo" IS NOT NULL OR (${untouchedColumns})`;
  const draftEditColumns = PG_OCCURRENCE_PROTOCOL_COLUMNS.filter(
    field => !['qty', 'componentScrap', 'operationSeq', 'jointCostShare'].includes(field)
  )
    .map(field => `NEW."${field}" IS DISTINCT FROM OLD."${field}"`)
    .join(' OR ');
  const draftEditViolation =
    `OLD."ecnInId" IS NULL OR NOT ${pgEcnStateIs('OLD."ecnInId"', "'draft'")} OR ` +
    `OLD."ecnOutId" IS NOT NULL OR NEW."ecnOutId" IS NOT NULL OR ` +
    `NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom" OR NEW."effectiveTo" IS DISTINCT FROM OLD."effectiveTo" OR (${draftEditColumns})`;
  const rescheduleViolation =
    `(NEW."ecnInId" IS NULL OR NEW."ecnInId" IS DISTINCT FROM OLD."ecnInId" OR ` +
    `NEW."effectiveFrom" IS DISTINCT FROM ${derivedFrom} OR NEW."effectiveTo" IS DISTINCT FROM OLD."effectiveTo" OR (${untouchedColumns})) AND ` +
    `(NEW."ecnOutId" IS NULL OR NEW."ecnOutId" IS DISTINCT FROM OLD."ecnOutId" OR ` +
    `NEW."effectiveTo" IS DISTINCT FROM ${derivedTo} OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom" OR (${untouchedColumns}))`;
  const body =
    `  IF TG_OP = 'INSERT' AND EXISTS (${releasedJoin}) AND (${insertViolation}) THEN\n` +
    `    RAISE EXCEPTION '${message}';\n` +
    `  END IF;\n` +
    `  IF TG_OP = 'UPDATE' AND EXISTS (${releasedJoin}) AND (${markViolation}) AND (${unmarkViolation}) AND (${rescheduleViolation}) AND (${draftEditViolation}) THEN\n` +
    `    RAISE EXCEPTION '${message}';\n` +
    `  END IF;\n` +
    `  IF TG_OP = 'DELETE' AND EXISTS (${releasedJoin}) AND NOT (${pgEcnStateIs('OLD."ecnInId"', "'draft', 'cancelled'")}) THEN\n` +
    `    RAISE EXCEPTION '${message}';\n` +
    `  END IF;`;
  const functionName = `${metadata.tableName}__released_header_guard`;
  return [
    `${pgFunctionHeader(metadata, functionName)}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(
      metadata,
      tableRef,
      `${metadata.tableName}__released_header_trg`,
      'BEFORE INSERT OR UPDATE OR DELETE',
      `${metadata.tableName}__released_header_guard`
    )
  ];
};

/**
 * 发生项区间由 ECN 派生的保存期守卫（PG 侧，与 SQLite 同口径；任何头都生效，AC#5/#15/#16）。
 */
const pgEcnOccurrenceFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLineOccurrence') return [];
  const tableRef = pgTableRef(metadata);
  const derivedFrom = `(SELECT e."effectiveDate" FROM bom.ecn e WHERE e."id" = NEW."ecnInId")`;
  const derivedTo = `(SELECT e."effectiveDate" FROM bom.ecn e WHERE e."id" = NEW."ecnOutId")`;
  const body =
    `  IF TG_OP = 'INSERT' AND (` +
    `(NEW."ecnInId" IS NOT NULL AND (NOT ${pgEcnAttachable('NEW."ecnInId"')} OR NEW."effectiveFrom" IS DISTINCT FROM ${derivedFrom} OR ` +
    `(NEW."ecnOutId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bom.bom_line l JOIN bom.bom_header h ON h."id" = l."headerId" JOIN bom.bom_history_batch b ON b."batchNo" = h."historyBatchNo" WHERE l."id" = NEW."lineId" AND b."state" = 'open')) OR NEW."effectiveTo" IS NOT NULL)) OR ` +
    `(NEW."ecnInId" IS NULL AND NEW."ecnOutId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bom.bom_line l JOIN bom.bom_header h ON h."id" = l."headerId" JOIN bom.bom_history_batch b ON b."batchNo" = h."historyBatchNo" WHERE l."id" = NEW."lineId" AND b."state" = 'open'))) THEN\n` +
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_line_occurrence', '发生项区间必须由 ECN 派生（真相源唯一，AC#5）')}';\n` +
    `  END IF;\n` +
    `  IF TG_OP = 'UPDATE' THEN\n` +
    `    IF OLD."ecnOutId" IS NULL AND NEW."ecnOutId" IS NOT NULL AND (` +
    `NOT ${pgEcnAttachable('NEW."ecnOutId"')} OR ` +
    `(OLD."ecnInId" IS NOT NULL AND NOT ${pgEcnStateIs('OLD."ecnInId"', "'released'")}) OR ` +
    `OLD."effectiveTo" IS NOT NULL OR ` +
    `NEW."effectiveTo" IS DISTINCT FROM ${derivedTo}) THEN\n` +
    `      RAISE EXCEPTION '${WRITE_PROTOCOL('bom_line_occurrence', '截止标记违约（单截止方 / 只能截止已发布或普通发生项 / 区间由 ECN 派生，AC#15/#16）')}';\n` +
    `    END IF;\n` +
    `    IF OLD."ecnOutId" IS NOT NULL AND NEW."ecnOutId" IS NULL AND NEW."effectiveTo" IS NOT NULL THEN\n` +
    `      RAISE EXCEPTION '${WRITE_PROTOCOL('bom_line_occurrence', '清截止标记必须同步恢复 effective_to 为空')}';\n` +
    `    END IF;\n` +
    `    IF OLD."ecnOutId" IS NOT NULL AND NEW."ecnOutId" IS NOT NULL AND NEW."ecnOutId" IS DISTINCT FROM OLD."ecnOutId" THEN\n` +
    `      RAISE EXCEPTION '${WRITE_PROTOCOL('bom_line_occurrence', '同一发生项只能有一个截止方（AC#15）')}';\n` +
    `    END IF;\n` +
    `    IF NEW."ecnInId" IS DISTINCT FROM OLD."ecnInId" OR ` +
    `(NEW."ecnInId" IS NOT NULL AND NEW."effectiveFrom" IS DISTINCT FROM ${derivedFrom}) OR ` +
    `(NEW."ecnOutId" IS NOT NULL AND NEW."ecnOutId" IS NOT DISTINCT FROM OLD."ecnOutId" AND NEW."effectiveTo" IS DISTINCT FROM ${derivedTo}) THEN\n` +
    `      RAISE EXCEPTION '${WRITE_PROTOCOL('bom_line_occurrence', '挂 ECN 的发生项区间改动必须等于派生值（ecn 列不可改指）')}';\n` +
    `    END IF;\n` +
    `  END IF;`;
  return [
    `${pgFunctionHeader(metadata, 'bom_line_occurrence__ecn_derive_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(
      metadata,
      tableRef,
      'bom_line_occurrence__ecn_derive_trg',
      'BEFORE INSERT OR UPDATE',
      'bom_line_occurrence__ecn_derive_guard'
    )
  ];
};

/**
 * 已发布头的字段全拒守卫（PG 侧，US-515 AC#22）。
 */
const pgReleasedHeaderFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHeader') return [];
  const state = column(metadata, 'state');
  const body =
    `  IF TG_OP = 'UPDATE' AND OLD.${state} = 'released' AND NOT EXISTS (` +
    `SELECT 1 FROM ${pgNamedTable(metadata, 'bom_history_batch')} b WHERE b."state" = 'open') THEN\n` +
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_header', '已发布头字段不可改（改头字段须发布新修订）')}';\n` +
    `  END IF;`;
  return [
    `${pgFunctionHeader(metadata, 'bom_header__released_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(
      metadata,
      pgTableRef(metadata),
      'bom_header__released_trg',
      'BEFORE UPDATE',
      'bom_header__released_guard'
    )
  ];
};

/**
 * ECN 状态机（US-515 存储层，PG 侧，与 SQLite 同口径）：发布 / 改期 / 取消三种转换，
 * 级联在触发器函数里执行（PGlite 0.5.8 行级触发器内 DML 不触发其他触发器，探针实证；
 * RAISE 后级联随语句回滚）。「当日」= `(now() AT TIME ZONE 'UTC')::date`。
 */
const pgEcnStateMachineFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomEcn') return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = pgNamedTable(metadata, 'bom_line_occurrence');
  const line = pgNamedTable(metadata, 'bom_line');
  const designator = pgNamedTable(metadata, 'bom_line_designator');
  const split = pgNamedTable(metadata, 'bom_line_operation_split');
  const group = pgNamedTable(metadata, 'bom_substitute_group');
  const batch = pgNamedTable(metadata, 'bom_history_batch');
  const ecn = tableRef;
  const body = [
    `  IF OLD."state" = 'draft' AND NEW."state" = 'released' THEN`,
    `    IF NEW."effectiveDate"::date < (now() AT TIME ZONE 'UTC')::date AND NOT EXISTS (` +
      `SELECT 1 FROM ${batch} b WHERE b."batchNo" = NEW."historyBatchNo" AND b."state" = 'open') THEN`,
    `      RAISE EXCEPTION '${PUBLISH_VALIDATION('ecn', '追溯生效被拒绝（生效日早于发布当日，AC#8）')}';`,
    `    END IF;`,
    ...pgEcnProjectionChecks(metadata, 'NEW', 'NEW."effectiveDate"', 'NEW."historyBatchNo"'),
    `    RETURN NEW;`,
    `  END IF;`,
    `  IF OLD."state" = 'released' AND NEW."state" = 'released' AND OLD."effectiveDate" <> NEW."effectiveDate" THEN`,
    `    IF OLD."effectiveDate"::date <= (now() AT TIME ZONE 'UTC')::date THEN`,
    `      RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '已生效的 ECN 不可改期，改走更正 ECN（AC#7）')}';`,
    `    END IF;`,
    `    IF NEW."reason" IS DISTINCT FROM OLD."reason" OR NEW."historyBatchNo" IS DISTINCT FROM OLD."historyBatchNo" THEN`,
    `      RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '已发布 ECN 改期不得顺带改写其他列')}';`,
    `    END IF;`,
    `    DECLARE successor text;`,
    `    BEGIN`,
    `      SELECT e."ecnNo" INTO successor FROM ${occurrence} o JOIN ${ecn} e ON e."id" = o."ecnOutId"` +
      ` WHERE o."ecnInId" = OLD."id" AND o."ecnOutId" IS NOT NULL AND o."ecnOutId" <> OLD."id"` +
      ` AND e."effectiveDate"::date < NEW."effectiveDate"::date LIMIT 1;`,
    `      IF successor IS NOT NULL THEN`,
    `        RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '改期不得越过同一逻辑行后继 ECN 的生效日（AC#20）：后继 %')}', successor;`,
    `      END IF;`,
    `    END;`,
    // 级联：新日期更晚 → 引入行 from 先收窄（变大），截止行 to 后放宽；更早则相反
    `    IF NEW."effectiveDate" > OLD."effectiveDate" THEN`,
    `      UPDATE ${occurrence} SET "effectiveFrom" = NEW."effectiveDate" WHERE "ecnInId" = OLD."id";`,
    `    END IF;`,
    `    IF NEW."effectiveDate" < OLD."effectiveDate" THEN`,
    `      UPDATE ${occurrence} SET "effectiveTo" = NEW."effectiveDate" WHERE "ecnOutId" = OLD."id";`,
    `    END IF;`,
    `    IF NEW."effectiveDate" < OLD."effectiveDate" THEN`,
    `      UPDATE ${occurrence} SET "effectiveFrom" = NEW."effectiveDate" WHERE "ecnInId" = OLD."id";`,
    `    END IF;`,
    `    IF NEW."effectiveDate" > OLD."effectiveDate" THEN`,
    `      UPDATE ${occurrence} SET "effectiveTo" = NEW."effectiveDate" WHERE "ecnOutId" = OLD."id";`,
    `    END IF;`,
    ...pgEcnProjectionChecks(
      metadata,
      'OLD',
      'CASE WHEN NEW."effectiveDate" < OLD."effectiveDate" THEN NEW."effectiveDate" ELSE OLD."effectiveDate" END',
      'NULL'
    ),
    `    RETURN NEW;`,
    `  END IF;`,
    `  IF (OLD."state" = 'released' OR OLD."state" = 'draft') AND NEW."state" = 'cancelled' THEN`,
    `    IF OLD."state" = 'released' AND OLD."effectiveDate"::date <= (now() AT TIME ZONE 'UTC')::date THEN`,
    `      RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '已生效的 ECN 不可取消，改走更正 ECN（AC#7）')}';`,
    `    END IF;`,
    `    DECLARE blocked text;`,
    `    BEGIN`,
    `      SELECT '后续 ECN ' || e."ecnNo" INTO blocked FROM ${occurrence} o JOIN ${ecn} e ON e."id" = o."ecnOutId"` +
      ` WHERE o."ecnInId" = OLD."id" AND o."ecnOutId" IS NOT NULL AND o."ecnOutId" <> OLD."id" LIMIT 1;`,
    `      IF blocked IS NOT NULL THEN`,
    `        RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '取消被拒：引入的发生项已被后续 ECN 截止，先取消后继 ECN（AC#12）：%')}', blocked;`,
    `      END IF;`,
    `      SELECT '引用 ECN ' || e."ecnNo" INTO blocked FROM ${occurrence} o JOIN ${ecn} e ON e."id" = o."ecnInId"` +
      ` WHERE o."lineId" IN (SELECT l."id" FROM ${line} l WHERE l."ecnInId" = OLD."id")` +
      ` AND o."ecnInId" IS NOT NULL AND o."ecnInId" <> OLD."id" LIMIT 1;`,
    `      IF blocked IS NOT NULL THEN`,
    `        RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '取消被拒：引入的逻辑行仍被其他 ECN 的发生项引用（AC#26 ③）：%')}', blocked;`,
    `      END IF;`,
    `      SELECT '引用 ECN ' || e."ecnNo" INTO blocked FROM ${occurrence} o JOIN ${ecn} e ON e."id" = o."ecnInId"` +
      ` WHERE o."substituteGroupId" IN (SELECT g."id" FROM ${group} g WHERE g."ecnInId" = OLD."id")` +
      ` AND o."ecnInId" IS NOT NULL AND o."ecnInId" <> OLD."id" LIMIT 1;`,
    `      IF blocked IS NOT NULL THEN`,
    `        RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '取消被拒：引入的替代组仍被其他 ECN 的成员引用（AC#26 ③）：%')}', blocked;`,
    `      END IF;`,
    `    END;`,
    // 级联删除：子表 → 发生项 → 逻辑行 / 替代组（删除先于放宽）
    `    DELETE FROM ${designator} WHERE "occurrenceId" IN (SELECT o."id" FROM ${occurrence} o WHERE o."ecnInId" = OLD."id");`,
    `    DELETE FROM ${split} WHERE "occurrenceId" IN (SELECT o."id" FROM ${occurrence} o WHERE o."ecnInId" = OLD."id");`,
    `    DELETE FROM ${occurrence} WHERE "ecnInId" = OLD."id";`,
    `    DELETE FROM ${line} WHERE "ecnInId" = OLD."id";`,
    `    DELETE FROM ${group} WHERE "ecnInId" = OLD."id";`,
    `    UPDATE ${occurrence} SET "ecnOutId" = NULL, "effectiveTo" = NULL WHERE "ecnOutId" = OLD."id";`,
    ...pgEcnProjectionChecks(metadata, 'OLD', 'OLD."effectiveDate"', 'NULL'),
    `    RETURN NEW;`,
    `  END IF;`,
    `  IF (OLD."state" = 'released' AND NEW."state" = 'draft') OR OLD."state" = 'cancelled' THEN`,
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', 'ECN 状态转移不合法：released 不可退回 draft，cancelled 是终态')}';`,
    `  END IF;`,
    `  IF OLD."state" = 'released' AND NEW."state" = 'released' AND OLD."effectiveDate" = NEW."effectiveDate" AND (` +
      `NEW."reason" IS DISTINCT FROM OLD."reason" OR NEW."historyBatchNo" IS DISTINCT FROM OLD."historyBatchNo") THEN`,
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '已发布 ECN 除改期与取消外不可改写')}';`,
    `  END IF;`,
    `  IF NEW."ecnNo" IS DISTINCT FROM OLD."ecnNo" THEN`,
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', 'ecnNo 创建后不可改（结构归属列）')}';`,
    `  END IF;`
  ].join('\n');
  return [
    `${pgFunctionHeader(metadata, 'ecn__state_machine')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(metadata, tableRef, 'ecn__state_machine_trg', 'AFTER UPDATE', 'ecn__state_machine')
  ];
};

/**
 * 转换后运行投影校验（PG 侧，与 SQLite 同口径的检查点切片聚合）。
 *
 * @param metadata - BomEcn 的实体元数据
 * @param target - 目标 ECN 行引用（`OLD` / `NEW`）
 * @param startDate - 校验起点表达式
 * @param historyBatchNo - 目标 ECN 的批次号表达式（历史装载跳过；运行时恒 `NULL`）
 */
const pgEcnProjectionChecks = (
  metadata: EntityMetadata,
  target: string,
  startDate: string,
  historyBatchNo: string
): string[] => {
  void metadata;
  const occurrence = pgNamedTable(metadata, 'bom_line_occurrence');
  const line = pgNamedTable(metadata, 'bom_line');
  const header = pgNamedTable(metadata, 'bom_header');
  const ecn = pgNamedTable(metadata, 'ecn');
  const group = pgNamedTable(metadata, 'bom_substitute_group');
  const designator = pgNamedTable(metadata, 'bom_line_designator');
  const split = pgNamedTable(metadata, 'bom_line_operation_split');
  const batch = pgNamedTable(metadata, 'bom_history_batch');

  const historical =
    historyBatchNo !== 'NULL' ?
      `EXISTS (SELECT 1 FROM ${batch} b WHERE b."batchNo" = ${historyBatchNo} AND b."state" = 'open')`
    : 'FALSE';
  const visible = (alias: string): string =>
    `(${alias}."ecnInId" IS NULL OR ${alias}."ecnInId" = ${target}."id" OR ` +
    `EXISTS (SELECT 1 FROM ${ecn} e WHERE e."id" = ${alias}."ecnInId" AND e."state" = 'released'))`;
  const trustedTo = (alias: string): string =>
    `CASE WHEN ${alias}."ecnOutId" IS NULL OR ${alias}."ecnOutId" = ${target}."id" OR ` +
    `EXISTS (SELECT 1 FROM ${ecn} e WHERE e."id" = ${alias}."ecnOutId" AND e."state" = 'released') ` +
    `THEN ${alias}."effectiveTo" ELSE NULL END`;
  const fixedProb = `(substr(a."prob" || '000000000', 3, 9))::bigint`;
  const totalText = (total: string): string =>
    `CASE WHEN length(${total}::text) > 9` +
    ` THEN left(${total}::text, length(${total}::text) - 9) || '.' || right('000000000' || ${total}::text, 9)` +
    ` ELSE '0.' || right('000000000' || ${total}::text, 9) END`;

  const membersCte = (start: string): string =>
    `WITH members AS (` +
    `SELECT m."id" AS mid, m."substituteGroupId" AS gid, m."effectiveFrom" AS f,` +
    ` ${trustedTo('m')} AS t, m."substituteRole" AS role, m."substitutePriority" AS prio, m."usageProbability" AS prob` +
    ` FROM ${occurrence} m JOIN ${line} l ON l."id" = m."lineId" JOIN ${header} h ON h."id" = l."headerId"` +
    ` WHERE h."state" = 'released' AND m."substituteGroupId" IS NOT NULL AND ${visible('m')}` +
    `), points AS (` +
    `SELECT ${start} AS p` +
    ` UNION SELECT DISTINCT m.f FROM members m WHERE m.f > ${start}` +
    ` UNION SELECT DISTINCT m.t FROM members m WHERE m.t > ${start}` +
    `), active AS (` +
    `SELECT a.gid, po.p, a.role, a.prio, a.prob FROM members a JOIN points po ON a.f <= po.p AND (a.t IS NULL OR a.t > po.p)` +
    `)`;

  // 每个校验一个 DECLARE 块：SELECT ... INTO msg → RAISE EXCEPTION '%', msg
  const checkBlock = (violation: string): string =>
    `    DECLARE msg text;\n    BEGIN\n      ${violation} INTO msg;\n      IF msg IS NOT NULL THEN\n        RAISE EXCEPTION '%', msg;\n      END IF;\n    END;`;

  const checks: string[] = buildPgCoproductProjectionChecks(metadata, target, startDate, historyBatchNo);

  // 位号计数（目标 ECN 引入的 managed 行）
  checks.push(
    `    IF NOT (${historical}) THEN`,
    checkBlock(
      `SELECT '${PUBLISH_VALIDATION('ecn', '位号计数违约：')}' || occ."id" || ':位号数' || ` +
        `(SELECT COUNT(*) FROM ${designator} d WHERE d."occurrenceId" = occ."id") || ':qty' || occ."qty"` +
        ` FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId"` +
        ` WHERE occ."ecnInId" = ${target}."id" AND occ."designatorManaged" = true` +
        ` AND (SELECT COUNT(*) FROM ${designator} d WHERE d."occurrenceId" = occ."id") <> ` +
        `CASE WHEN occ."qty" IS NULL OR strpos(occ."qty", '.') > 0 THEN -1 ELSE occ."qty"::integer END LIMIT 1`
    ),
    `    END IF;`
  );

  // 分摊合计（目标 ECN 引入的发生项）
  checks.push(
    `    IF NOT (${historical}) THEN`,
    checkBlock(
      `SELECT '${PUBLISH_VALIDATION('ecn', '投料分摊合计 ≠ 1：')}' || s."occurrenceId" || ':' || ` +
        `CASE WHEN length(SUM((substr(replace(s."ratio", '.', '') || '000000000', 1, 10))::bigint)::text) > 9` +
        ` THEN left(SUM((substr(replace(s."ratio", '.', '') || '000000000', 1, 10))::bigint)::text, length(SUM((substr(replace(s."ratio", '.', '') || '000000000', 1, 10))::bigint)::text) - 9) || '.' || right(SUM((substr(replace(s."ratio", '.', '') || '000000000', 1, 10))::bigint)::text, 9)` +
        ` ELSE '0.' || right(SUM((substr(replace(s."ratio", '.', '') || '000000000', 1, 10))::bigint)::text, 9) END` +
        ` FROM ${split} s JOIN ${occurrence} o ON o."id" = s."occurrenceId"` +
        ` WHERE o."ecnInId" = ${target}."id"` +
        ` GROUP BY s."occurrenceId" HAVING SUM((substr(replace(s."ratio", '.', '') || '000000000', 1, 10))::bigint) <> 1000000000 LIMIT 1`
    ),
    `    END IF;`
  );

  // 替代组：primary / priority / proportional（检查点切片）
  checks.push(
    `    IF NOT (${historical}) THEN`,
    checkBlock(
      `${membersCte(startDate)}` +
        ` SELECT '${PUBLISH_VALIDATION('ecn', '替代组切片缺 primary 或不止一个 primary：')}' || g."code" || ':' || bad.p::text` +
        ` FROM (SELECT a.gid, a.p FROM active a` +
        ` GROUP BY a.gid, a.p HAVING COUNT(*) > 0 AND SUM(CASE WHEN a.role = 'primary' THEN 1 ELSE 0 END) <> 1 LIMIT 1) bad` +
        ` JOIN ${group} g ON g."id" = bad.gid`
    ),
    `    END IF;`,
    `    IF NOT (${historical}) THEN`,
    checkBlock(
      `${membersCte(startDate)}` +
        ` SELECT '${PUBLISH_VALIDATION('ecn', 'priority 组切片优先级并列：')}' || g."code" || ':' || bad.p::text || ':并列' || bad.dup::text` +
        ` FROM (SELECT a.gid, a.p, COUNT(*) - COUNT(DISTINCT a.prio) - SUM(CASE WHEN a.prio IS NULL THEN 1 ELSE 0 END) AS dup` +
        ` FROM active a GROUP BY a.gid, a.p` +
        ` HAVING COUNT(*) > 0 AND (SELECT g."strategy" FROM ${group} g WHERE g."id" = a.gid) = 'priority'` +
        ` AND COUNT(*) <> COUNT(DISTINCT a.prio) + SUM(CASE WHEN a.prio IS NULL THEN 1 ELSE 0 END) LIMIT 1) bad` +
        ` JOIN ${group} g ON g."id" = bad.gid`
    ),
    `    END IF;`,
    `    IF NOT (${historical}) THEN`,
    checkBlock(
      `${membersCte(startDate)}` +
        ` SELECT '${PUBLISH_VALIDATION('ecn', '替代组概率合计 ≠ 1：')}' || g."code" || ':' || bad.p::text || ':' || ${totalText('bad.total')}` +
        ` FROM (SELECT a.gid, a.p, SUM(${fixedProb}) AS total FROM active a` +
        ` GROUP BY a.gid, a.p` +
        ` HAVING COUNT(*) > 0 AND (SELECT g."strategy" FROM ${group} g WHERE g."id" = a.gid) = 'proportional'` +
        ` AND SUM(${fixedProb}) <> 1000000000 LIMIT 1) bad` +
        ` JOIN ${group} g ON g."id" = bad.gid`
    ),
    `    END IF;`
  );

  // 阶梯：投影成员两两相交
  checks.push(
    `    IF NOT (${historical}) THEN`,
    checkBlock(
      `SELECT '${PUBLISH_VALIDATION('ecn', '阶梯切片重叠：')}' || a."tierGroupNo" || ':' || a."id" || ':' || b."id" || ':日期段与批量段同时相交'` +
        ` FROM ${occurrence} a JOIN ${line} la ON la."id" = a."lineId" JOIN ${header} ha ON ha."id" = la."headerId"` +
        ` JOIN ${occurrence} b ON b."id" <> a."id" AND b."tierGroupNo" = a."tierGroupNo"` +
        ` JOIN ${line} lb ON lb."id" = b."lineId" JOIN ${header} hb ON hb."id" = lb."headerId"` +
        ` WHERE ha."id" = hb."id" AND ha."state" = 'released' AND a."tierGroupNo" IS NOT NULL` +
        ` AND ${visible('a')} AND ${visible('b')}` +
        ` AND (a."effectiveTo" IS NULL OR b."effectiveFrom" < a."effectiveTo") AND (b."effectiveTo" IS NULL OR a."effectiveFrom" < b."effectiveTo")` +
        ` AND (a."lotsizeTo" IS NULL OR b."lotsizeFrom"::numeric < a."lotsizeTo"::numeric) AND (b."lotsizeTo" IS NULL OR a."lotsizeFrom"::numeric < b."lotsizeTo"::numeric)` +
        ` LIMIT 1`
    ),
    `    END IF;`
  );

  return checks;
};

const PG_CANONICAL_RE = `'^(0|[1-9][0-9]*)(\\.[0-9]*[1-9])?$'`;

/** PG 侧格式触发器兜底的十进制列（与 SQLite 侧同清单）。 */
const PG_DECIMAL_FORMAT_COLUMNS: { entity: string; field: string; nullable: boolean }[] = [
  { entity: 'BomLineOccurrence', field: 'qty', nullable: true },
  { entity: 'BomLineOccurrence', field: 'componentScrap', nullable: false },
  { entity: 'BomLineOccurrence', field: 'componentScrapFixed', nullable: false },
  { entity: 'BomLineOccurrence', field: 'lotsizeFrom', nullable: true },
  { entity: 'BomLineOccurrence', field: 'lotsizeTo', nullable: true },
  { entity: 'BomLineOccurrence', field: 'uomConversion', nullable: true },
  { entity: 'BomHeader', field: 'baseQty', nullable: false },
  { entity: 'BomHeader', field: 'assemblyScrap', nullable: false },
  { entity: 'BomRoutingOperation', field: 'setupTime', nullable: false },
  { entity: 'BomRoutingOperation', field: 'runTime', nullable: false },
  { entity: 'BomRoutingOperation', field: 'fixedTime', nullable: false },
  { entity: 'BomWorkCenter', field: 'overheadRate', nullable: true },
  { entity: 'BomHeader', field: 'costLotQty', nullable: true },
  { entity: 'BomItem', field: 'unitPrice', nullable: true },
  { entity: 'BomItem', field: 'creditPrice', nullable: true }
];

const pgDecimalFormatFunction = (metadata: EntityMetadata): string[] => {
  if (!['BomLineOccurrence', 'BomHeader', 'BomRoutingOperation', 'BomWorkCenter', 'BomItem'].includes(metadata.name))
    return [];
  const tableRef = pgTableRef(metadata);
  const guards: string[] = [];
  for (const { entity, field, nullable } of PG_DECIMAL_FORMAT_COLUMNS) {
    if (entity !== metadata.name) continue;
    const violation =
      nullable ?
        `NEW."${field}" IS NOT NULL AND NEW."${field}" !~ ${PG_CANONICAL_RE}`
      : `NEW."${field}" !~ ${PG_CANONICAL_RE}`;
    guards.push(`  IF ${violation} THEN\n    RAISE EXCEPTION '${DECIMAL_FORMAT(field)}';\n  END IF;`);
  }
  if (metadata.name === 'BomHeader') {
    guards.push(
      `  IF NEW."assemblyScrapConvention" = 'yield' AND NEW."assemblyScrap" <> '0' AND left(NEW."assemblyScrap", 2) <> '0.' THEN`
    );
    guards.push(
      `    RAISE EXCEPTION '${DECIMAL_FORMAT('assemblyScrap', '良率制损耗必须在 [0,1)（s = 1 拒绝）')}';\n  END IF;`
    );
  }
  if (metadata.name === 'BomLineOccurrence') {
    guards.push(
      `  IF NEW."componentScrapConvention" = 'yield' AND NEW."componentScrap" <> '0' AND left(NEW."componentScrap", 2) <> '0.' THEN`
    );
    guards.push(
      `    RAISE EXCEPTION '${DECIMAL_FORMAT('componentScrap', '良率制损耗必须在 [0,1)（s = 1 拒绝）')}';\n  END IF;`
    );
    for (const field of ['lotsizeFrom', 'lotsizeTo'] as const) {
      const digits = `translate(NEW."${field}", '.', '')`;
      const significant = `ltrim(${digits}, '0')`;
      guards.push(`  IF NEW."${field}" IS NOT NULL AND (`);
      guards.push(`    length(CASE WHEN ${digits} = '0' THEN '0' ELSE ${significant} END) > 15 OR`);
      guards.push(
        `    (CASE WHEN strpos(NEW."${field}", '.') = 0 THEN length(NEW."${field}") ELSE strpos(NEW."${field}", '.') - 1 END) > 15 OR`
      );
      guards.push(
        `    (CASE WHEN strpos(NEW."${field}", '.') = 0 THEN 0 ELSE length(NEW."${field}") - strpos(NEW."${field}", '.') END) > 15`
      );
      guards.push(
        `  ) THEN\n    RAISE EXCEPTION '${DECIMAL_FORMAT(field, '阶梯边界限 15 位有效数字、整数与小数部分各 ≤ 15 位')}';\n  END IF;`
      );
    }
  }
  if (guards.length === 0) return [];
  const body = guards.join('\n');
  return [
    `${pgFunctionHeader(metadata, `${metadata.tableName}__decimal_guard`)}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(
      metadata,
      tableRef,
      `${metadata.tableName}__decimal_trg`,
      'BEFORE INSERT OR UPDATE',
      `${metadata.tableName}__decimal_guard`
    )
  ];
};

/**
 * 头发布转移的阶梯切片校验（PG 侧，与 SQLite 同口径；批量比较 `::numeric`）。
 */
const pgTierPublishFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHeader') return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = pgNamedTable(metadata, 'bom_line_occurrence');
  const line = pgNamedTable(metadata, 'bom_line');
  const overlap = (a: string, b: string, suffix: string): string =>
    `(${a}."${suffix}To" IS NULL OR CAST(${b}."${suffix}From" AS numeric) < CAST(${a}."${suffix}To" AS numeric)) AND ` +
    `(${b}."${suffix}To" IS NULL OR CAST(${a}."${suffix}From" AS numeric) < CAST(${b}."${suffix}To" AS numeric))`;
  const dateOverlap = (a: string, b: string): string =>
    `(${a}."effectiveTo" IS NULL OR ${b}."effectiveFrom" < ${a}."effectiveTo") AND ` +
    `(${b}."effectiveTo" IS NULL OR ${a}."effectiveFrom" < ${b}."effectiveTo")`;
  // 违规行查进变量：错误消息点名组号与两个发生项（与 SQLite 侧同口径）
  const violation =
    `SELECT '${PUBLISH_VALIDATION('bom_header', '阶梯切片重叠：')}' || a."tierGroupNo" || ':' || a."id" || ':' || b."id" || ':日期段与批量段同时相交'` +
    ` FROM ${occurrence} a` +
    ` JOIN ${line} la ON la."id" = a."lineId"` +
    ` JOIN ${occurrence} b ON b."id" <> a."id" AND b."tierGroupNo" = a."tierGroupNo"` +
    ` JOIN ${line} lb ON lb."id" = b."lineId"` +
    ` WHERE la."headerId" = NEW."id" AND lb."headerId" = NEW."id"` +
    ` AND a."tierGroupNo" IS NOT NULL` +
    ` AND ${dateOverlap('a', 'b')}` +
    ` AND ${overlap('a', 'b', 'lotsize')}` +
    ` LIMIT 1`;
  const body =
    `  IF OLD."state" = 'draft' AND NEW."state" = 'released' THEN\n` +
    `    DECLARE violation text;\n    BEGIN\n` +
    `      ${violation} INTO violation;\n` +
    `      IF violation IS NOT NULL THEN\n        RAISE EXCEPTION '%', violation;\n      END IF;\n` +
    `    END;\n  END IF;`;
  return [
    `${pgFunctionHeader(metadata, 'bom_header__tier_publish_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(
      metadata,
      tableRef,
      'bom_header__tier_publish_trg',
      'BEFORE UPDATE OF "state"',
      'bom_header__tier_publish_guard'
    )
  ];
};
/**
 * 位号的已发布头协议（PG 侧，US-515 矩阵形态：增删仅放行所属发生项挂 draft/cancelled ECN）。
 */
const pgDesignatorReleasedFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomLineDesignator') return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = pgNamedTable(metadata, 'bom_line_occurrence');
  const line = pgNamedTable(metadata, 'bom_line');
  const header = pgNamedTable(metadata, 'bom_header');
  const message = WRITE_PROTOCOL(metadata.tableName, '已发布头的位号仅放行所属发生项挂 draft/cancelled ECN 的增删');
  // DELETE 触发器里 NEW 未赋值：按 TG_OP 选行（行/发生项守卫的同款先例）
  const owner = `CASE WHEN TG_OP = 'DELETE' THEN OLD."occurrenceId" ELSE NEW."occurrenceId" END`;
  const releasedJoin = `EXISTS (SELECT 1 FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId" JOIN ${header} h ON h."id" = l."headerId" WHERE occ."id" = ${owner} AND h."state" = 'released')`;
  const body =
    `  IF TG_OP = 'INSERT' AND ${releasedJoin} AND NOT (EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = NEW."occurrenceId" AND ${pgEcnAttachable('occ."ecnInId"')})) THEN\n` +
    `    RAISE EXCEPTION '${message}';\n` +
    `  END IF;\n` +
    `  IF TG_OP = 'UPDATE' AND ${releasedJoin} THEN\n` +
    `    RAISE EXCEPTION '${message}';\n` +
    `  END IF;\n` +
    `  IF TG_OP = 'DELETE' AND ${releasedJoin} AND NOT (` +
    `EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = OLD."occurrenceId" AND (${pgEcnAttachable('occ."ecnInId"')} OR ${pgEcnStateIs('occ."ecnInId"', "'cancelled'")}))) THEN\n` +
    `    RAISE EXCEPTION '${message}';\n` +
    `  END IF;`;
  return [
    `${pgFunctionHeader(metadata, 'bom_line_designator__released_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(
      metadata,
      tableRef,
      'bom_line_designator__released_trg',
      'BEFORE INSERT OR UPDATE OR DELETE',
      'bom_line_designator__released_guard'
    )
  ];
};

/**
 * 位号计数发布校验（PG 侧，与 SQLite 同口径；整数性由逐字节判定保证 `::integer` 安全）。
 */
const pgDesignatorCountFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHeader') return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = pgNamedTable(metadata, 'bom_line_occurrence');
  const designator = pgNamedTable(metadata, 'bom_line_designator');
  const line = pgNamedTable(metadata, 'bom_line');
  const count = `(SELECT COUNT(*) FROM ${designator} d WHERE d."occurrenceId" = occ."id")`;
  const expected = `CASE WHEN occ."qty" IS NULL OR strpos(occ."qty", '.') > 0 THEN -1 ELSE occ."qty"::integer END`;
  const violation =
    `SELECT '${PUBLISH_VALIDATION('bom_header', '位号计数违约：')}' || occ."id" || ':位号数' || ${count} || ':qty' || occ."qty"` +
    ` FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId"` +
    ` WHERE l."headerId" = NEW."id" AND occ."designatorManaged" = true` +
    ` AND ${count} <> ${expected} LIMIT 1`;
  const body =
    `  IF OLD."state" = 'draft' AND NEW."state" = 'released' THEN\n` +
    `    DECLARE violation text;\n    BEGIN\n` +
    `      ${violation} INTO violation;\n` +
    `      IF violation IS NOT NULL THEN\n        RAISE EXCEPTION '%', violation;\n      END IF;\n` +
    `    END;\n  END IF;`;
  return [
    `${pgFunctionHeader(metadata, 'bom_header__designator_publish_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(
      metadata,
      tableRef,
      'bom_header__designator_publish_trg',
      'BEFORE UPDATE OF "state"',
      'bom_header__designator_publish_guard'
    )
  ];
};
// 位号级联不落 PG 触发器：PGlite 0.5.8 行级触发器内 DML 不触发（探针实证），
// 级联由 BomRepository.remove 应用层完成（两后端一致）
/**
 * by_product 子件不得是头父件（PG 侧，同 SQLite 口径）。
 */
const pgByProductFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHeader') return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = pgNamedTable(metadata, 'bom_line_occurrence');
  const line = pgNamedTable(metadata, 'bom_line');
  const header = pgNamedTable(metadata, 'bom_header');
  const revision = pgNamedTable(metadata, 'item_revision');
  const message = PUBLISH_VALIDATION('bom_header', 'by_product 行的子件不得是头父件本身（主产物就是头父件）');
  const body =
    `  IF OLD."state" = 'draft' AND NEW."state" = 'released' AND EXISTS (` +
    `SELECT 1 FROM ${occurrence} occ` +
    ` JOIN ${line} l ON l."id" = occ."lineId"` +
    ` JOIN ${header} h ON h."id" = l."headerId"` +
    ` JOIN ${revision} r ON r."id" = h."parentRevisionId"` +
    ` WHERE l."headerId" = NEW."id" AND occ."flowDirection" = 'by_product' AND occ."childItemId" = r."itemId"` +
    `) THEN\n    RAISE EXCEPTION '${message}';\n  END IF;`;
  return [
    `${pgFunctionHeader(metadata, 'bom_header__by_product_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(
      metadata,
      tableRef,
      'bom_header__by_product_guard_trg',
      'BEFORE UPDATE OF "state"',
      'bom_header__by_product_guard'
    )
  ];
};
/**
 * 替代组保存期守卫（PG 侧，与 SQLite 同口径）：概率域、成员跨头、组已发布协议。
 */
const pgSubstituteGuards = (metadata: EntityMetadata): string[] => {
  const statements: string[] = [];
  if (metadata.name === 'BomLineOccurrence') {
    const tableRef = pgTableRef(metadata);
    const group = pgNamedTable(metadata, 'bom_substitute_group');
    const line = pgNamedTable(metadata, 'bom_line');
    const probabilityMessage = DECIMAL_FORMAT('usageProbability', '替代概率限 [0,1]、小数至多 9 位');
    const body =
      `  IF NEW."usageProbability" IS NOT NULL AND NOT (` +
      `NEW."usageProbability" = '0' OR NEW."usageProbability" = '1' OR ` +
      `(left(NEW."usageProbability", 2) = '0.' AND length(NEW."usageProbability") <= 11)) THEN\n` +
      `    RAISE EXCEPTION '${probabilityMessage}';\n  END IF;\n` +
      `  IF EXISTS (SELECT 1 FROM ${group} g JOIN ${line} l ON l."id" = NEW."lineId" WHERE g."id" = NEW."substituteGroupId" AND g."headerId" <> l."headerId") THEN\n` +
      `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_line_occurrence', '替代组成员必须与组同属一张头')}';\n  END IF;`;
    statements.push(
      `${pgFunctionHeader(metadata, 'bom_line_occurrence__substitute_guard')}\n${body}${pgFunctionFooter}`,
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_line_occurrence__substitute_trg',
        'BEFORE INSERT OR UPDATE',
        'bom_line_occurrence__substitute_guard'
      )
    );
  }
  if (metadata.name === 'BomSubstituteGroup') {
    const tableRef = pgTableRef(metadata);
    const header = pgNamedTable(metadata, 'bom_header');
    const message = WRITE_PROTOCOL(
      metadata.tableName,
      '已发布头的替代组仅放行挂 draft ECN 的插入与挂 draft/cancelled ECN 的删除（组属性不可改，改策略即由 ECN 新建一组）'
    );
    const releasedJoin = `EXISTS (SELECT 1 FROM ${header} h WHERE h."id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."headerId" ELSE NEW."headerId" END AND h."state" = 'released')`;
    const body =
      `  IF TG_OP = 'INSERT' AND ${releasedJoin} AND NOT (${pgEcnAttachable('NEW."ecnInId"')}) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n` +
      `  END IF;\n` +
      `  IF TG_OP = 'UPDATE' AND ${releasedJoin} THEN\n` +
      `    RAISE EXCEPTION '${message}';\n` +
      `  END IF;\n` +
      `  IF TG_OP = 'DELETE' AND ${releasedJoin} AND NOT (${pgEcnStateIs('OLD."ecnInId"', "'draft', 'cancelled'")}) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n` +
      `  END IF;`;
    statements.push(
      `${pgFunctionHeader(metadata, 'bom_substitute_group__released_guard')}\n${body}${pgFunctionFooter}`,
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_substitute_group__released_trg',
        'BEFORE INSERT OR UPDATE OR DELETE',
        'bom_substitute_group__released_guard'
      )
    );
  }
  return statements;
};

/**
 * 替代组发布转移聚合校验（PG 侧，与 SQLite 同口径；定点整数 10⁹ 比较）。
 */
const pgSubstitutePublishFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomHeader') return [];
  const tableRef = pgTableRef(metadata);
  const group = pgNamedTable(metadata, 'bom_substitute_group');
  const member = pgNamedTable(metadata, 'bom_line_occurrence');
  const dateOverlap = (a: string, b: string): string =>
    `(${a}."effectiveTo" IS NULL OR ${b}."effectiveFrom" < ${a}."effectiveTo") AND ` +
    `(${b}."effectiveTo" IS NULL OR ${a}."effectiveFrom" < ${b}."effectiveTo")`;
  const groupIds = `SELECT g."id" FROM ${group} g WHERE g."headerId" = NEW."id"`;
  // 定点整数还原规范串（与 SQLite 同口径）
  const totalExpr =
    `(SELECT CASE WHEN length(t."total"::text) > 9` +
    ` THEN left(t."total"::text, length(t."total"::text) - 9) || '.' || right('000000000' || t."total"::text, 9)` +
    ` ELSE '0.' || right('000000000' || t."total"::text, 9) END` +
    ` FROM (SELECT m."substituteGroupId", m."effectiveFrom", m."effectiveTo",` +
    ` SUM(CASE WHEN m."usageProbability" IS NULL THEN 0 ELSE (substr(m."usageProbability" || '000000000', 3, 9))::integer END) AS "total"` +
    ` FROM ${member} m JOIN ${group} g ON g."id" = m."substituteGroupId"` +
    ` WHERE g."headerId" = NEW."id" AND g."strategy" = 'proportional'` +
    ` GROUP BY m."substituteGroupId", m."effectiveFrom", m."effectiveTo"` +
    ` HAVING SUM(CASE WHEN m."usageProbability" IS NULL THEN 0 ELSE (substr(m."usageProbability" || '000000000', 3, 9))::integer END) <> 1000000000` +
    ` LIMIT 1) t)`;
  const body =
    `  IF OLD."state" = 'draft' AND NEW."state" = 'released' THEN\n` +
    `    DECLARE violation text;\n    BEGIN\n` +
    `      SELECT '${PUBLISH_VALIDATION('bom_header', '替代组零成员或缺 primary')}' INTO violation` +
    `        WHERE EXISTS (SELECT 1 FROM ${group} g WHERE g."headerId" = NEW."id" AND (` +
    `          NOT EXISTS (SELECT 1 FROM ${member} m WHERE m."substituteGroupId" = g."id") OR ` +
    `          NOT EXISTS (SELECT 1 FROM ${member} m WHERE m."substituteGroupId" = g."id" AND m."substituteRole" = 'primary')));\n` +
    `      IF violation IS NULL THEN\n` +
    `        SELECT '${PUBLISH_VALIDATION('bom_header', '替代组同一切片出现两个 primary')}' INTO violation` +
    `          WHERE EXISTS (SELECT 1 FROM ${member} a JOIN ${member} b ON b."id" <> a."id" AND b."substituteGroupId" = a."substituteGroupId" AND b."substituteRole" = 'primary'` +
    `            WHERE a."substituteRole" = 'primary' AND a."substituteGroupId" IN (${groupIds}) AND ${dateOverlap('a', 'b')});\n` +
    `      END IF;\n` +
    `      IF violation IS NULL THEN\n` +
    `        SELECT '${PUBLISH_VALIDATION('bom_header', 'priority 组优先级并列')}' INTO violation` +
    `          WHERE EXISTS (SELECT 1 FROM ${member} a JOIN ${member} b ON b."id" <> a."id" AND b."substituteGroupId" = a."substituteGroupId" AND b."substitutePriority" = a."substitutePriority"` +
    `            JOIN ${group} g ON g."id" = a."substituteGroupId"` +
    `            WHERE g."headerId" = NEW."id" AND g."strategy" = 'priority' AND a."substitutePriority" IS NOT NULL AND ${dateOverlap('a', 'b')});\n` +
    `      END IF;\n` +
    `      IF violation IS NULL THEN\n` +
    `        SELECT '${PUBLISH_VALIDATION('bom_header', '替代组概率合计 ≠ 1：')}' || ${totalExpr} INTO violation;\n` +
    `      END IF;\n` +
    `      IF violation IS NOT NULL THEN\n        RAISE EXCEPTION '%', violation;\n      END IF;\n` +
    `    END;\n  END IF;`;
  return [
    `${pgFunctionHeader(metadata, 'bom_header__substitute_publish_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(
      metadata,
      tableRef,
      'bom_header__substitute_publish_trg',
      'BEFORE UPDATE OF "state"',
      'bom_header__substitute_publish_guard'
    )
  ];
};
/**
 * 工艺路线存储守卫（PG 侧，与 SQLite 同口径）。
 */
const pgRoutingGuards = (metadata: EntityMetadata): string[] => {
  const statements: string[] = [];
  if (metadata.name === 'BomLineOperationSplit') {
    const tableRef = pgTableRef(metadata);
    const message = DECIMAL_FORMAT('ratio', '分摊比例限 [0,1]、小数至多 9 位');
    const occurrence = pgNamedTable(metadata, 'bom_line_occurrence');
    const body =
      `  IF NOT (NEW."ratio" = '0' OR NEW."ratio" = '1' OR (left(NEW."ratio", 2) = '0.' AND length(NEW."ratio") <= 11)) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n  END IF;\n` +
      // US-520 AC#6：行既有 operation_seq 又有分摊行——两种表达互斥
      `  IF EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = NEW."occurrenceId" AND occ."operationSeq" IS NOT NULL) THEN\n` +
      `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_line_operation_split', '行既有 operation_seq 又有分摊行（两种表达互斥）')}';\n  END IF;`;
    statements.push(
      `${pgFunctionHeader(metadata, 'bom_line_operation_split__ratio_guard')}\n${body}${pgFunctionFooter}`,
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_line_operation_split__ratio_trg',
        'BEFORE INSERT OR UPDATE',
        'bom_line_operation_split__ratio_guard'
      )
    );
    // US-515 矩阵：已发布头的分摊行仅放行所属发生项挂 draft（DELETE 另含 cancelled）ECN 的增删
    const line = pgNamedTable(metadata, 'bom_line');
    const header = pgNamedTable(metadata, 'bom_header');
    const protocolMessage = WRITE_PROTOCOL(
      'bom_line_operation_split',
      '已发布头的分摊行仅放行所属发生项挂 draft/cancelled ECN 的增删'
    );
    const owner = `CASE WHEN TG_OP = 'DELETE' THEN OLD."occurrenceId" ELSE NEW."occurrenceId" END`;
    const releasedJoin = `EXISTS (SELECT 1 FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId" JOIN ${header} h ON h."id" = l."headerId" WHERE occ."id" = ${owner} AND h."state" = 'released')`;
    const protocolBody =
      `  IF TG_OP = 'INSERT' AND ${releasedJoin} AND NOT (EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = NEW."occurrenceId" AND ${pgEcnAttachable('occ."ecnInId"')})) THEN\n` +
      `    RAISE EXCEPTION '${protocolMessage}';\n` +
      `  END IF;\n` +
      `  IF TG_OP = 'UPDATE' AND ${releasedJoin} THEN\n` +
      `    RAISE EXCEPTION '${protocolMessage}';\n` +
      `  END IF;\n` +
      `  IF TG_OP = 'DELETE' AND ${releasedJoin} AND NOT (` +
      `EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = OLD."occurrenceId" AND (${pgEcnAttachable('occ."ecnInId"')} OR ${pgEcnStateIs('occ."ecnInId"', "'cancelled'")}))) THEN\n` +
      `    RAISE EXCEPTION '${protocolMessage}';\n` +
      `  END IF;`;
    statements.push(
      `${pgFunctionHeader(metadata, 'bom_line_operation_split__released_guard')}\n${protocolBody}${pgFunctionFooter}`,
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_line_operation_split__released_trg',
        'BEFORE INSERT OR UPDATE OR DELETE',
        'bom_line_operation_split__released_guard'
      )
    );
  }
  // US-520 AC#5/#7：行的 operation_seq 保存期校验
  if (metadata.name === 'BomLineOccurrence') {
    const tableRef = pgTableRef(metadata);
    const line = pgNamedTable(metadata, 'bom_line');
    const header = pgNamedTable(metadata, 'bom_header');
    const operation = pgNamedTable(metadata, 'routing_operation');
    const message = WRITE_PROTOCOL('bom_line_occurrence', '投料工序不属于头选定的路线');
    const body =
      `  IF NEW."operationSeq" IS NOT NULL AND EXISTS (` +
      `SELECT 1 FROM ${line} l JOIN ${header} h ON h."id" = l."headerId"` +
      ` WHERE l."id" = NEW."lineId" AND h."routingId" IS NOT NULL` +
      ` AND NOT EXISTS (SELECT 1 FROM ${operation} op WHERE op."routingId" = h."routingId" AND op."operationSeq" = NEW."operationSeq")) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n  END IF;`;
    statements.push(
      `${pgFunctionHeader(metadata, 'bom_line_occurrence__operation_seq_guard')}\n${body}${pgFunctionFooter}`,
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_line_occurrence__operation_seq_trg',
        'BEFORE INSERT OR UPDATE',
        'bom_line_occurrence__operation_seq_guard'
      )
    );
  }
  if (metadata.name === 'BomRoutingOperation') {
    const tableRef = pgTableRef(metadata);
    const message = DECIMAL_FORMAT('operationScrap', '良率制损耗必须在 [0,1)（s = 1 拒绝）');
    const body =
      `  IF NEW."scrapConvention" = 'yield' AND NEW."operationScrap" <> '0' AND left(NEW."operationScrap", 2) <> '0.' THEN\n` +
      `    RAISE EXCEPTION '${message}';\n  END IF;`;
    statements.push(
      `${pgFunctionHeader(metadata, 'bom_routing_operation__scrap_guard')}\n${body}${pgFunctionFooter}`,
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_routing_operation__scrap_trg',
        'BEFORE INSERT OR UPDATE',
        'bom_routing_operation__scrap_guard'
      )
    );
  }
  if (metadata.name === 'BomHeader') {
    const tableRef = pgTableRef(metadata);
    const occurrence = pgNamedTable(metadata, 'bom_line_occurrence');
    const split = pgNamedTable(metadata, 'bom_line_operation_split');
    const line = pgNamedTable(metadata, 'bom_line');
    const operation = pgNamedTable(metadata, 'routing_operation');
    const seqMessage = PUBLISH_VALIDATION('bom_header', '投料工序 / 分摊行不在路由工序序集内（挂了必须可解析）');
    const totalExpr =
      `(SELECT '0.' || right('000000000' || (SUM((substr(replace(s."ratio", '.', '') || '000000000', 1, 10))::integer))::text, 9)` +
      ` FROM ${split} s JOIN ${occurrence} occ ON occ."id" = s."occurrenceId" JOIN ${line} l ON l."id" = occ."lineId"` +
      ` WHERE l."headerId" = NEW."id"` +
      ` GROUP BY s."occurrenceId"` +
      ` HAVING SUM((substr(replace(s."ratio", '.', '') || '000000000', 1, 10))::integer) <> 1000000000` +
      ` LIMIT 1)`;
    const body =
      `  IF OLD."state" = 'draft' AND NEW."state" = 'released' THEN\n` +
      `    DECLARE violation text;\n    BEGIN\n` +
      `      SELECT '${seqMessage}' INTO violation` +
      `        WHERE NEW."routingId" IS NOT NULL AND EXISTS (` +
      `          SELECT 1 FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId"` +
      `          WHERE l."headerId" = NEW."id" AND occ."operationSeq" IS NOT NULL` +
      `          AND NOT EXISTS (SELECT 1 FROM ${operation} op WHERE op."routingId" = NEW."routingId" AND op."operationSeq" = occ."operationSeq"));\n` +
      `      IF violation IS NULL THEN\n` +
      `        SELECT '${seqMessage}' INTO violation` +
      `          WHERE NEW."routingId" IS NOT NULL AND EXISTS (` +
      `          SELECT 1 FROM ${split} s JOIN ${occurrence} occ ON occ."id" = s."occurrenceId" JOIN ${line} l ON l."id" = occ."lineId"` +
      `          WHERE l."headerId" = NEW."id"` +
      `          AND NOT EXISTS (SELECT 1 FROM ${operation} op WHERE op."routingId" = NEW."routingId" AND op."operationSeq" = s."operationSeq"));\n` +
      `      END IF;\n` +
      `      IF violation IS NULL THEN\n` +
      `        SELECT '${PUBLISH_VALIDATION('bom_header', '投料分摊合计 ≠ 1：')}' || ${totalExpr} INTO violation;\n` +
      `      END IF;\n` +
      `      IF violation IS NOT NULL THEN\n        RAISE EXCEPTION '%', violation;\n      END IF;\n` +
      `    END;\n  END IF;`;
    statements.push(
      `${pgFunctionHeader(metadata, 'bom_header__routing_guard')}\n${body}${pgFunctionFooter}`,
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_header__routing_trg',
        'BEFORE UPDATE OF "state"',
        'bom_header__routing_guard'
      )
    );
  }
  return statements;
};
/** 行映射的 NULL 规则（PG 侧，与 SQLite 同口径，US-516 AC#9）。 */
const pgMapNullRuleFunction = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomMap') return [];
  const body =
    `  IF (NEW."relation" = 'added' AND (NEW."sourceLineId" IS NOT NULL OR NEW."targetLineId" IS NULL)) OR ` +
    `(NEW."relation" = 'removed' AND (NEW."targetLineId" IS NOT NULL OR NEW."sourceLineId" IS NULL)) OR ` +
    `(NEW."relation" NOT IN ('added', 'removed') AND (NEW."sourceLineId" IS NULL OR NEW."targetLineId" IS NULL)) THEN\n` +
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_map', 'NULL 规则违约：added 只 source 空、removed 只 target 空、其余四态两侧必填、不允许双 NULL')}';\n  END IF;`;
  return [
    `${pgFunctionHeader(metadata, 'bom_map__null_rule_guard')}\n${body}${pgFunctionFooter}`,
    pgCreateTrigger(
      metadata,
      pgTableRef(metadata),
      'bom_map__null_rule_trg',
      'BEFORE INSERT OR UPDATE',
      'bom_map__null_rule_guard'
    )
  ];
};

/** 实体全部 PGlite 触发器 DDL（单条语句数组）。 */

export const buildPgBomTriggerDdl = (metadata: EntityMetadata): string[] => [
  ...buildPgCoproductDdl(metadata),
  ...buildPgInstanceNodeDdl(metadata),
  ...buildPgInstanceSourceDdl(metadata),
  ...buildUnitLotOverlapGuardPg(metadata),
  ...pgStructuralFunction(metadata),
  ...pgPublishedRevisionFunction(metadata),
  ...pgPublishTransitionFunction(metadata),
  ...pgHistoryBatchFunction(metadata),
  ...pgEcnStateMachineFunction(metadata),
  ...pgEcnOccurrenceFunction(metadata),
  ...pgReleasedHeaderMembersFunction(metadata),
  ...pgReleasedHeaderFunction(metadata),
  ...pgMapNullRuleFunction(metadata),
  ...pgDecimalFormatFunction(metadata),
  ...pgTierPublishFunction(metadata),
  ...pgDesignatorCountFunction(metadata),
  ...pgDesignatorReleasedFunction(metadata),
  ...pgByProductFunction(metadata),
  ...pgSubstituteGuards(metadata),
  ...pgSubstitutePublishFunction(metadata),
  ...pgRoutingGuards(metadata),
  ...pgCycleFunction(metadata)
];
