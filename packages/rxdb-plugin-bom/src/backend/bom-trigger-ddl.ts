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
 * 触发器 DDL 幂等且升级即替换：SQLite `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`，PG 函数
 * `CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS`。声明只覆盖**状态转移与直连 SQL** 的判定面，跨行聚合
 * （位号计数等）随 US-507 阶段 C 接进发布转移。
 */

import { EntityMetadata, quoteSqlIdentifier, type EntityType } from '@aiao/rxdb';
import { DECIMAL_COLUMNS } from '../decimal-columns.js';
import { DECIMAL_CANONICAL_PATTERN } from '../decimal.utils.js';
import {
  BomEcn,
  BomHeader,
  BomHistoryBatch,
  BomItemRevision,
  BomLine,
  BomLineDesignator,
  BomLineOccurrence,
  BomLineOperationSplit,
  BomMap,
  BomRoutingOperation,
  BomSubstituteGroup
} from '../entities.js';
import {
  buildPgCoproductDdl,
  buildPgCoproductProjectionChecks,
  buildSqliteCoproductDdl,
  buildSqliteCoproductProjectionChecks
} from './coproduct-trigger-ddl.js';
import {
  column,
  isEntity,
  pgCreateTrigger,
  pgTableOf,
  pgTableRef,
  pgTriggerFunction,
  sqliteTableOf,
  sqliteTableRef,
  sqliteTrigger
} from './ddl-kit.js';
import { buildPgInstanceNodeDdl, buildSqliteInstanceNodeDdl } from './instance-node-ddl.js';
import { buildPgInstanceSourceDdl, buildSqliteInstanceSourceDdl } from './instance-source-ddl.js';
import { buildPgStructuralDdl, buildSqliteStructuralDdl } from './structural-trigger-ddl.js';
import { buildUnitLotOverlapGuardPg, buildUnitLotOverlapGuardSqlite } from './unit-lot-trigger-ddl.js';

// -----------------------------------------------------[ 消息文本 ]

const WRITE_PROTOCOL = (subject: string, detail: string): string => `rxdb:bom_write_protocol:${subject}:${detail}`;
const PUBLISH_VALIDATION = (subject: string, detail: string): string =>
  `rxdb:bom_publish_validation:${subject}:${detail}`;
const DECIMAL_FORMAT = (field: string, detail?: string): string =>
  `rxdb:bom_decimal_format:${field}${detail ? `:${detail}` : ''}`;

// 头未挂路线时投料工序 / 分摊行无从解析（爆炸与卷算会静默按无工序损耗计）：发布门、已发布头的
// 成员写入与历史通道的 routing_id 补丁三处同口径拒绝；草稿头可暂缺路线（历史装载先建行后挂路线）
const UNROUTED_PUBLISH = PUBLISH_VALIDATION('bom_header', '头未挂工艺路线却有投料工序 / 分摊行（挂了必须可解析）');
const UNROUTED_OCCURRENCE = WRITE_PROTOCOL(
  'bom_line_occurrence',
  '已发布头未挂工艺路线，不得挂投料工序（挂了必须可解析）'
);
const UNROUTED_SPLIT = WRITE_PROTOCOL(
  'bom_line_operation_split',
  '已发布头未挂工艺路线，不得新增分摊行（挂了必须可解析）'
);
const UNROUTED_DETACH = WRITE_PROTOCOL(
  'bom_header',
  '已发布头有投料工序 / 分摊行，routing_id 不可置空（未挂工艺路线即无从解析）'
);
const REROUTE_UNCOVERED = WRITE_PROTOCOL(
  'bom_header',
  '已发布头改挂的路线不含投料工序 / 分摊行的工序（不在路由工序序集内）'
);
// 已发布头的投料工序 / 分摊行按 (routing_id, operation_seq) 解析：被引用的工序删除、改号或移出路线
// 都让发布时校验过的引用事后悬空；只被草稿头引用时放行（发布门重验）
const OPERATION_REFERENCED = WRITE_PROTOCOL(
  'routing_operation',
  '工序被已发布头的投料工序 / 分摊行引用，不可删除、改号或移出路线（挂了必须可解析）'
);

/** 另一实体的表引用（按方言）。 */
type TableOf = (Entity: EntityType) => string;

export interface BomTriggerDdlOptions {
  historyProjection: boolean;
}

const historyAffectedHeader = (table: TableOf, owner: string, batchNo: string): string => {
  const fromBatch = (value: string): string =>
    `EXISTS (SELECT 1 FROM ${table(BomEcn)} e WHERE e."id" = ${value} AND e."historyBatchNo" = ${batchNo})`;
  return (
    `(${owner}."historyBatchNo" = ${batchNo} OR EXISTS (` +
    `SELECT 1 FROM ${table(BomLine)} affected_line LEFT JOIN ${table(BomLineOccurrence)} affected_occ` +
    ` ON affected_occ."lineId" = affected_line."id" WHERE affected_line."headerId" = ${owner}."id" AND (` +
    `${fromBatch('affected_line."ecnInId"')} OR ${fromBatch('affected_occ."ecnInId"')} OR ${fromBatch('affected_occ."ecnOutId"')}))` +
    ` OR EXISTS (SELECT 1 FROM ${table(BomSubstituteGroup)} affected_group WHERE affected_group."headerId" = ${owner}."id"` +
    ` AND ${fromBatch('affected_group."ecnInId"')}))`
  );
};

/**
 * 头的路线可解析谓词（`NEW` 为头行；发布门与已发布头改挂路线共用）：头下的投料工序与分摊行
 * 要求头挂了路线（`unrouted` 的反）、且工序在该路线的序集内（`seqUncovered` / `splitUncovered` 的反）。
 */
const headerRoutingViolations = (
  table: TableOf,
  owner = 'NEW',
  visible = '1 = 1'
): { unrouted: string; seqUncovered: string; splitUncovered: string } => {
  const occurrence = table(BomLineOccurrence);
  const line = table(BomLine);
  const seqMembers = `SELECT 1 FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId" WHERE l."headerId" = ${owner}."id" AND (${visible}) AND occ."operationSeq" IS NOT NULL`;
  const splitMembers =
    `SELECT 1 FROM ${table(BomLineOperationSplit)} s JOIN ${occurrence} occ ON occ."id" = s."occurrenceId" JOIN ${line} l ON l."id" = occ."lineId"` +
    ` WHERE l."headerId" = ${owner}."id" AND (${visible})`;
  const inRouting = (seq: string): string =>
    `EXISTS (SELECT 1 FROM ${table(BomRoutingOperation)} op WHERE op."routingId" = ${owner}."routingId" AND op."operationSeq" = ${seq})`;
  return {
    unrouted: `${owner}."routingId" IS NULL AND (EXISTS (${seqMembers}) OR EXISTS (${splitMembers}))`,
    seqUncovered: `${owner}."routingId" IS NOT NULL AND EXISTS (${seqMembers} AND NOT ${inRouting('occ."operationSeq"')})`,
    splitUncovered: `${owner}."routingId" IS NOT NULL AND EXISTS (${splitMembers} AND NOT ${inRouting('s."operationSeq"')})`
  };
};

const headerEcnOwnershipViolation = (table: TableOf, headerId: string): string => {
  const mismatches = (owner: string): string =>
    `${owner}."ecnInId" IS NOT NULL AND (occ."ecnInId" IS NULL OR ${owner}."ecnInId" <> occ."ecnInId")` +
    ` AND NOT EXISTS (SELECT 1 FROM ${table(BomEcn)} e WHERE e."id" = ${owner}."ecnInId" AND e."state" = 'released')`;
  return (
    `SELECT 1 FROM ${table(BomLineOccurrence)} occ JOIN ${table(BomLine)} l ON l."id" = occ."lineId"` +
    ` LEFT JOIN ${table(BomSubstituteGroup)} g ON g."id" = occ."substituteGroupId"` +
    ` WHERE l."headerId" = ${headerId} AND ((${mismatches('l')}) OR (${mismatches('g')}))`
  );
};

const historyProjectionQueries = (table: TableOf, batchNo: string): string[] => {
  const visible = (row: string): string =>
    `(${row}."ecnInId" IS NULL OR EXISTS (SELECT 1 FROM ${table(BomEcn)} e WHERE e."id" = ${row}."ecnInId" AND e."state" = 'released'))`;
  const routing = headerRoutingViolations(table, 'h', `${visible('occ')} AND ${visible('l')}`);
  const affected = historyAffectedHeader(table, 'h', batchNo);
  return [
    `SELECT '${PUBLISH_VALIDATION('bom_header', '逻辑行 / 替代组与发生项的 ECN 归属不一致')}' AS message` +
      ` FROM ${table(BomHeader)} h WHERE h."state" = 'released' AND ${affected}` +
      ` AND EXISTS (${headerEcnOwnershipViolation(table, 'h."id"')}) LIMIT 1`,
    `SELECT '${PUBLISH_VALIDATION('bom_header', '投料工序 / 分摊行不在路由工序序集内（挂了必须可解析）')}' AS message` +
      ` FROM ${table(BomHeader)} h WHERE h."state" = 'released' AND ${affected}` +
      ` AND (${routing.unrouted} OR ${routing.seqUncovered} OR ${routing.splitUncovered}) LIMIT 1`,
    `SELECT '${PUBLISH_VALIDATION('bom_header', 'by_product 行的子件不得是头父件本身（主产物就是头父件）')}' AS message` +
      ` FROM ${table(BomLineOccurrence)} o JOIN ${table(BomLine)} l ON l."id" = o."lineId"` +
      ` JOIN ${table(BomHeader)} h ON h."id" = l."headerId" JOIN ${table(BomItemRevision)} r ON r."id" = h."parentRevisionId"` +
      ` WHERE h."state" = 'released' AND ${affected} AND o."flowDirection" = 'by_product' AND o."childItemId" = r."itemId"` +
      ` AND ${visible('o')} AND ${visible('l')} LIMIT 1`,
    `SELECT '${PUBLISH_VALIDATION('bom_header', '替代组零成员或缺 primary')}' AS message` +
      ` FROM ${table(BomSubstituteGroup)} g JOIN ${table(BomHeader)} h ON h."id" = g."headerId"` +
      ` WHERE h."state" = 'released' AND ${affected} AND ${visible('g')} AND NOT EXISTS (` +
      `SELECT 1 FROM ${table(BomLineOccurrence)} o JOIN ${table(BomLine)} l ON l."id" = o."lineId"` +
      ` WHERE o."substituteGroupId" = g."id" AND o."substituteRole" = 'primary' AND ${visible('o')} AND ${visible('l')}) LIMIT 1`
  ];
};

/** 发生项 / 分摊行所属的头已发布且未挂路线（`owner` 给出从行到头的连接与过滤）。 */
const releasedUnroutedHeader = (table: TableOf, owner: 'occurrence' | 'split'): string => {
  const line = table(BomLine);
  const header = table(BomHeader);
  const scope =
    owner === 'occurrence' ?
      `FROM ${line} l JOIN ${header} h ON h."id" = l."headerId" WHERE l."id" = NEW."lineId"`
    : `FROM ${table(BomLineOccurrence)} occ JOIN ${line} l ON l."id" = occ."lineId" JOIN ${header} h ON h."id" = l."headerId" WHERE occ."id" = NEW."occurrenceId"`;
  return `EXISTS (SELECT 1 ${scope} AND h."state" = 'released' AND h."routingId" IS NULL)`;
};

/**
 * 工序键 `(routingId, operationSeq)` 被已发布头引用（`OLD` 为工序行）：挂该路线的已发布头下有发生项
 * 以它为投料工序、或有分摊行分摊到它。不分生效期——截止的发生项在历史时点照样要解析。
 */
const releasedOperationReferenced = (table: TableOf): string => {
  const members = `FROM ${table(BomHeader)} h JOIN ${table(BomLine)} l ON l."headerId" = h."id" JOIN ${table(BomLineOccurrence)} occ ON occ."lineId" = l."id"`;
  const released = `h."routingId" = OLD."routingId" AND h."state" = 'released'`;
  return (
    `EXISTS (SELECT 1 ${members} WHERE ${released} AND occ."operationSeq" = OLD."operationSeq") OR ` +
    `EXISTS (SELECT 1 ${members} JOIN ${table(BomLineOperationSplit)} s ON s."occurrenceId" = occ."id" WHERE ${released} AND s."operationSeq" = OLD."operationSeq")`
  );
};

/**
 * 已发布头发生项的协议外列（打标记 / 清标记 / 区间级联之外的一切改动都拒绝）：两后端同一清单，
 * 只有「列值改动」谓词按方言生成（SQLite `IS NOT`，PG `IS DISTINCT FROM`）。
 */
const OCCURRENCE_PROTOCOL_COLUMNS = [
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

/** 草稿 ECN 引入的发生项在已发布头下仍可改的协议列（US-515 草稿编辑形态）。 */
const OCCURRENCE_DRAFT_EDITABLE_COLUMNS: ReadonlySet<string> = new Set([
  'qty',
  'componentScrap',
  'operationSeq',
  'jointCostShare'
]);

/** 「列值改动」谓词（NEW 对 OLD，三值安全）。 */
type ColumnChanged = (column: string) => string;
const sqliteColumnChanged: ColumnChanged = field => `NEW.${field} IS NOT OLD.${field}`;
const pgColumnChanged: ColumnChanged = field => `NEW.${field} IS DISTINCT FROM OLD.${field}`;

/**
 * 发生项协议列任一改动的谓词。
 *
 * @param scope - `protocol` 取全部协议列；`draftEdit` 排除草稿 ECN 成员可改的列
 */
const occurrenceColumnsChanged = (
  metadata: EntityMetadata,
  changed: ColumnChanged,
  scope: 'protocol' | 'draftEdit'
): string =>
  OCCURRENCE_PROTOCOL_COLUMNS.filter(field => scope === 'protocol' || !OCCURRENCE_DRAFT_EDITABLE_COLUMNS.has(field))
    .map(field => changed(column(metadata, field)))
    .join(' OR ');

// -----------------------------------------------------[ SQLite ]

/** 一条 `SELECT RAISE(ABORT, …) WHERE …` 触发体（多个条件逐个点名）。 */
const raiseWhen = (message: string, condition: string): string =>
  `  SELECT RAISE(ABORT, '${message}') WHERE ${condition};`;

const sqlitePublishedRevisionTrigger = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomItemRevision)) return [];
  const state = column(metadata, 'state');
  const fields = ['revisionNo', 'defaultPhantom', 'effectiveFrom'].map(field => column(metadata, field));
  const changed = fields.map(field => `NEW.${field} IS NOT OLD.${field}`).join(' OR ');
  const when = `OLD.${state} = 'released' AND (NEW.${state} = 'draft' OR ${changed})`;
  const body = raiseWhen(
    WRITE_PROTOCOL('item_revision', '已发布修订除状态转移外不可改（改虚拟件标记须发布新修订）'),
    '1'
  );
  return sqliteTrigger(sqliteTableRef(metadata), 'item_revision_published', 'BEFORE UPDATE', body, when);
};

const sqlitePublishTransitionTrigger = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomItemRevision)) return [];
  const state = column(metadata, 'state');
  const effectiveFrom = column(metadata, 'effectiveFrom');
  const historyBatchNo = column(metadata, 'historyBatchNo');
  const batchTable = sqliteTableOf(BomHistoryBatch);
  const when = `OLD.${state} = 'draft' AND NEW.${state} = 'released'`;
  // 追溯生效（US-508 AC#9）：发布当日是存储层取的 UTC 日期；指向开启态历史批次的行跳过
  const body = [
    raiseWhen(PUBLISH_VALIDATION('item_revision', '发布要求 effective_from 非空'), `NEW.${effectiveFrom} IS NULL`),
    raiseWhen(
      PUBLISH_VALIDATION('item_revision', '追溯生效被拒绝（effective_from 早于发布当日）'),
      `NEW.${effectiveFrom} IS NOT NULL AND NEW.${effectiveFrom} < date('now') AND NOT EXISTS (SELECT 1 FROM ${batchTable} b WHERE b."batchNo" = NEW.${historyBatchNo} AND b."state" = 'open')`
    )
  ].join('\n');
  return [
    ...sqliteTrigger(sqliteTableRef(metadata), 'item_revision_publish', 'BEFORE UPDATE', body, when),
    ...sqliteTrigger(
      sqliteTableRef(metadata),
      'item_revision_publish_i',
      'BEFORE INSERT',
      body,
      `NEW.${state} = 'released'`
    )
  ];
};

/** 批次表 append-only（US-508 AC#14）：拒绝删除，UPDATE 只允许 open → closed。 */
const sqliteHistoryBatchTriggers = (metadata: EntityMetadata, historyProjection: boolean): string[] => {
  if (!isEntity(metadata, BomHistoryBatch)) return [];
  const tableRef = sqliteTableRef(metadata);
  const state = column(metadata, 'state');
  return [
    ...sqliteTrigger(
      tableRef,
      'bom_history_batch_append_only_d',
      'BEFORE DELETE',
      raiseWhen(WRITE_PROTOCOL('bom_history_batch', '批次表只追加，不允许删除'), '1')
    ),
    ...sqliteTrigger(
      tableRef,
      'bom_history_batch_transition_u',
      'BEFORE UPDATE',
      [
        raiseWhen(
          WRITE_PROTOCOL('bom_history_batch', '批次行不可改写，只允许 open → closed 转移'),
          `NOT (OLD.${state} = 'open' AND NEW.${state} = 'closed')`
        ),
        ...(historyProjection ? sqliteEcnProjectionChecks(metadata, null, null, 'NULL', 'NEW."batchNo"') : []),
        ...(historyProjection ? historyProjectionQueries(sqliteTableOf, 'NEW."batchNo"') : []).map(
          query => `SELECT RAISE(ABORT, violation.message) FROM (${query}) violation;`
        )
      ].join('\n')
    )
  ];
};

/** 目标 ECN 处于某状态集的谓词（id 列名由调用方给出）。 */
const ecnStateIs = (idExpr: string, states: string): string =>
  `EXISTS (SELECT 1 FROM ${sqliteTableOf(BomEcn)} e WHERE e."id" = ${idExpr} AND e."state" IN (${states}))`;

/** 目标 ECN 是「运行时可挂」状态：draft，或 released 且属于开启态历史批次（历史装载通道）。 */
const ecnAttachable = (idExpr: string): string =>
  `(${ecnStateIs(idExpr, "'draft'")} OR EXISTS (SELECT 1 FROM ${sqliteTableOf(BomEcn)} e JOIN ${sqliteTableOf(BomHistoryBatch)} b ON b."batchNo" = e."historyBatchNo" WHERE e."id" = ${idExpr} AND e."state" = 'released' AND b."state" = 'open'))`;

/**
 * 发生项区间由 ECN 派生的保存期守卫（US-515 AC#5/#15/#16，**任何头**都生效）：
 * 挂 `ecn_in` 的行 `effective_from` 必须恰等于该 ECN 生效日、`ecn_out` 的截止标记
 * 同语句把 `effective_to` 收窄为 ECN 生效日；同一发生项只能一个截止方、只能截止
 * 无 ECN 或已发布的发生项。INSERT 不打截止标记。
 */
const sqliteEcnOccurrenceGuards = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomLineOccurrence)) return [];
  const tableRef = sqliteTableRef(metadata);
  const ecnRef = sqliteTableOf(BomEcn);
  const derivedFrom = (row: string): string =>
    `(SELECT e."effectiveDate" FROM ${ecnRef} e WHERE e."id" = ${row}."ecnInId")`;
  const derivedTo = (row: string): string =>
    `(SELECT e."effectiveDate" FROM ${ecnRef} e WHERE e."id" = ${row}."ecnOutId")`;
  const guards: string[] = [];

  // INSERT：挂 ECN 时状态可挂 + 区间派生；ecnOutId 只能经 UPDATE 打标记
  // 三值逻辑：violation 每一项都写成二元谓词（IS NOT / IS NULL），NULL 不吞拒绝
  // 历史装载豁免：行所属头挂开启态批次（loadHistory 通道）时 INSERT 可直接带截止标记
  const historicalInsert =
    `EXISTS (SELECT 1 FROM ${sqliteTableOf(BomLine)} l JOIN ${sqliteTableOf(BomHeader)} h ON h."id" = l."headerId"` +
    ` JOIN ${sqliteTableOf(BomHistoryBatch)} b ON b."batchNo" = h."historyBatchNo"` +
    ` WHERE l."id" = NEW."lineId" AND b."state" = 'open')`;
  const insertViolation =
    `NEW."ecnInId" IS NOT NULL AND (` +
    `NOT ${ecnAttachable('NEW."ecnInId"')} OR NEW."effectiveFrom" IS NOT ${derivedFrom('NEW')} OR ` +
    `(NEW."ecnOutId" IS NOT NULL AND NOT ${historicalInsert}) OR NEW."effectiveTo" IS NOT NULL) OR ` +
    `(NEW."ecnInId" IS NULL AND NEW."ecnOutId" IS NOT NULL AND NOT ${historicalInsert})`;
  guards.push(
    ...sqliteTrigger(
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
    ...sqliteTrigger(
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

/**
 * 已发布头的行 / 发生项写入协议（US-515 矩阵，US-507 AC#10 的追加放行）：
 * 行 INSERT 挂 draft ECN；行 DELETE 挂 draft/cancelled ECN 且发生项已先删；行 UPDATE 全拒。
 * 发生项 INSERT 挂 draft ECN（行归属与成员组归属按 AC#26）；打截止标记（空 → X，X draft、
 * 本行无 ECN 或已发布、当前 +∞、同语句收窄为 X 生效日）；清标记（X → 空，X draft/cancelled、
 * effective_to 同步恢复）；区间级联（新值恰等于派生值）；其余 UPDATE 全拒。
 */
const sqliteReleasedHeaderMembersGuard = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomLine, BomLineOccurrence)) return [];
  const tableRef = sqliteTableRef(metadata);
  const headerRef = sqliteTableOf(BomHeader);
  const lineRef = sqliteTableOf(BomLine);
  // 发生项经逻辑行找头；逻辑行直接找头
  const ownerColumn = column(metadata, isEntity(metadata, BomLine) ? 'headerId' : 'lineId');
  const releasedJoin =
    isEntity(metadata, BomLine) ?
      (row: string): string => `SELECT 1 FROM ${headerRef} WHERE "id" = ${row}.${ownerColumn} AND "state" = 'released'`
    : (row: string): string =>
        `SELECT 1 FROM ${headerRef} h JOIN ${lineRef} l ON l."headerId" = h."id" WHERE l."id" = ${row}.${ownerColumn} AND h."state" = 'released'`;
  const guards: string[] = [];

  if (isEntity(metadata, BomLine)) {
    const message = WRITE_PROTOCOL(
      metadata.tableName,
      '已发布头的逻辑行：仅放行挂 draft ECN 的插入与挂 draft/cancelled ECN 的删除'
    );
    guards.push(
      ...sqliteTrigger(
        tableRef,
        `${metadata.tableName}_released_header_i`,
        'BEFORE INSERT',
        raiseWhen(message, `EXISTS (${releasedJoin('NEW')}) AND NOT (${ecnAttachable('NEW."ecnInId"')})`)
      ),
      ...sqliteTrigger(
        tableRef,
        `${metadata.tableName}_released_header_u`,
        'BEFORE UPDATE',
        raiseWhen(message, `EXISTS (${releasedJoin('NEW')})`)
      ),
      ...sqliteTrigger(
        tableRef,
        `${metadata.tableName}_released_header_d`,
        'BEFORE DELETE',
        raiseWhen(
          message,
          `EXISTS (${releasedJoin('OLD')}) AND NOT (` +
            `${ecnStateIs('OLD."ecnInId"', "'draft', 'cancelled'")} AND ` +
            `NOT EXISTS (SELECT 1 FROM ${sqliteTableOf(BomLineOccurrence)} occ WHERE occ."lineId" = OLD."id"))`
        )
      )
    );
    return guards;
  }

  // BomLineOccurrence
  const ecnRef = sqliteTableOf(BomEcn);
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
    `EXISTS (SELECT 1 FROM ${sqliteTableOf(BomSubstituteGroup)} g WHERE g."id" = ${row}."substituteGroupId" AND ` +
    `g."ecnInId" IS NOT NULL AND g."ecnInId" IS NOT ${row}."ecnInId" AND NOT ${ecnStateIs('g."ecnInId"', "'released'")})`;
  const untouchedColumns = occurrenceColumnsChanged(metadata, sqliteColumnChanged, 'protocol');
  const message = WRITE_PROTOCOL(metadata.tableName, '已发布头的发生项写入超出写入协议矩阵（US-515）');

  // INSERT：挂 draft ECN + 行归属 + 成员组归属 + 区间由 ECN 派生（violation 组合，三值安全）
  const insertViolation =
    `NEW."ecnInId" IS NULL OR NOT ${ecnAttachable('NEW."ecnInId"')} OR ${lineOwnerViolation('NEW')} OR ${groupOwnerViolation('NEW')} OR ` +
    `NEW."effectiveFrom" IS NOT ${derivedFrom('NEW')} OR NEW."ecnOutId" IS NOT NULL OR NEW."effectiveTo" IS NOT NULL`;
  guards.push(
    ...sqliteTrigger(
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
  const draftEditColumns = occurrenceColumnsChanged(metadata, sqliteColumnChanged, 'draftEdit');
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
    ...sqliteTrigger(
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
    ...sqliteTrigger(
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
 * 规范十进制串的逐字节谓词（与 DECIMAL_CANONICAL_PATTERN 同定义；GLOB 的 `X*` 是「X 一次 + 通配」，
 * 表达不了「零个或多个数字」，改用反类 + substr/instr/replace 的逐字节判定）：
 * 1. 全串只含数字与至多一个小数点（`[^0-9.]` 反类一次判全串）；
 * 2. 以数字开头（顺带保证非空、无符号）；
 * 3. 无前导零（单个 `0` 或 `0.` 开头除外）；
 * 4. 含小数点时末位是 `1`～`9`（小数部分非空且无尾随零：`1.` / `0.` 与 `1.50` 同样拒绝）。
 */
const canonicalGlob = (field: string): string => `(
  NEW."${field}" NOT GLOB '*[^0-9.]*' AND
  length(replace(NEW."${field}", '.', '')) >= length(NEW."${field}") - 1 AND
  substr(NEW."${field}", 1, 1) BETWEEN '0' AND '9' AND
  (substr(NEW."${field}", 1, 1) <> '0' OR NEW."${field}" = '0' OR substr(NEW."${field}", 1, 2) = '0.') AND
  (instr(NEW."${field}", '.') = 0 OR substr(NEW."${field}", -1, 1) BETWEEN '1' AND '9')
)`;

/**
 * 实体上由规范串格式触发器判定的十进制列（两后端同源：取自十进制列登记 decimal-columns，登记序即安装序）。
 * 可空列的 NULL 跳过检查（如公式行的 qty），可空性取自实体元数据；`jointCostShare` 例外，由联产守卫的
 * 份额谓词判定（规范串 ∩ [0,1] ∩ 小数至多 9 位，见 coproduct-trigger-ddl）。值域守卫（良率制、阶梯边界、
 * [0,1] 九位小数、正数）另装触发器叠加在格式检查之上。
 */
const decimalFormatColumns = (metadata: EntityMetadata): { field: string; nullable: boolean }[] =>
  DECIMAL_COLUMNS.filter(({ storage, entities }) => storage === 'canonical' && isEntity(metadata, ...entities)).map(
    ({ field }) => ({ field, nullable: metadata.propertyMap.get(field)?.nullable === true })
  );

/**
 * 实体上的正数域列与其违约消息（取自十进制列登记，两后端同源）。规范串里零只有 `'0'` 一种写法，
 * 「> 0」即 `s = '0'` 的反（格式触发器先保证规范串；NULL 比较为 NULL，可空列的空值不触发）。
 */
const positiveColumns = (metadata: EntityMetadata): { field: string; message: string }[] =>
  DECIMAL_COLUMNS.flatMap(({ field, domain, entities }) =>
    domain.kind === 'positive' && isEntity(metadata, ...entities) ?
      [{ field, message: DECIMAL_FORMAT(field, `${domain.label}必须大于 0`) }]
    : []
  );

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
  const tableRef = sqliteTableRef(metadata);
  const statements: string[] = [];
  for (const { field, nullable } of decimalFormatColumns(metadata)) {
    const violation =
      nullable ? `NEW."${field}" IS NOT NULL AND NOT ${canonicalGlob(field)}` : `NOT ${canonicalGlob(field)}`;
    const message = DECIMAL_FORMAT(field);
    statements.push(
      ...sqliteTrigger(
        tableRef,
        `${metadata.tableName}_${field}_decimal_i`,
        'BEFORE INSERT',
        raiseWhen(message, violation)
      ),
      ...sqliteTrigger(
        tableRef,
        `${metadata.tableName}_${field}_decimal_u`,
        'BEFORE UPDATE',
        raiseWhen(message, violation)
      )
    );
  }
  // 正数域（换算率、头基准量、标准成本批量）
  for (const { field, message } of positiveColumns(metadata)) {
    statements.push(
      ...sqliteTrigger(
        tableRef,
        `${metadata.tableName}_${field}_positive_i`,
        'BEFORE INSERT',
        raiseWhen(message, `NEW."${field}" = '0'`)
      ),
      ...sqliteTrigger(
        tableRef,
        `${metadata.tableName}_${field}_positive_u`,
        'BEFORE UPDATE',
        raiseWhen(message, `NEW."${field}" = '0'`)
      )
    );
  }
  // 良率制损耗域（AC#12）
  if (isEntity(metadata, BomHeader)) {
    const message = DECIMAL_FORMAT('assemblyScrap', '良率制损耗必须在 [0,1)（s = 1 拒绝）');
    statements.push(
      ...sqliteTrigger(
        tableRef,
        'bom_header_assembly_scrap_yield_i',
        'BEFORE INSERT',
        raiseWhen(message, sqliteYieldScrapGuard('assemblyScrap', 'assemblyScrapConvention'))
      ),
      ...sqliteTrigger(
        tableRef,
        'bom_header_assembly_scrap_yield_u',
        'BEFORE UPDATE',
        raiseWhen(message, sqliteYieldScrapGuard('assemblyScrap', 'assemblyScrapConvention'))
      )
    );
  }
  if (isEntity(metadata, BomLineOccurrence)) {
    const message = DECIMAL_FORMAT('componentScrap', '良率制损耗必须在 [0,1)（s = 1 拒绝）');
    statements.push(
      ...sqliteTrigger(
        tableRef,
        'bom_line_occurrence_component_scrap_yield_i',
        'BEFORE INSERT',
        raiseWhen(message, sqliteYieldScrapGuard('componentScrap', 'componentScrapConvention'))
      ),
      ...sqliteTrigger(
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
        ...sqliteTrigger(
          tableRef,
          `bom_line_occurrence_${field}_bound_i`,
          'BEFORE INSERT',
          raiseWhen(boundMessage, `NEW."${field}" IS NOT NULL AND ${sqliteLotsizeBoundGuard(field)}`)
        ),
        ...sqliteTrigger(
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
  if (!isEntity(metadata, BomHeader)) return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = sqliteTableOf(BomLineOccurrence);
  const line = sqliteTableOf(BomLine);
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
  return sqliteTrigger(
    tableRef,
    'bom_header_tier_publish_trg',
    'BEFORE UPDATE OF "state"',
    sql,
    `OLD."state" = 'draft' AND NEW."state" = 'released'`
  );
};
/**
 * 位号的已发布头协议（US-507 阶段 C + US-515 矩阵）：位号的增删经 occurrence → line → header
 * 判 `released`；INSERT/DELETE 仅放行所属发生项挂 draft（DELETE 另含 cancelled）ECN 的形态，
 * UPDATE 全拒（改位号 = 截止 + 引入，协议外）。
 */
const sqliteDesignatorReleasedGuard = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomLineDesignator)) return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = sqliteTableOf(BomLineOccurrence);
  const line = sqliteTableOf(BomLine);
  const header = sqliteTableOf(BomHeader);
  const message = WRITE_PROTOCOL(metadata.tableName, '已发布头的位号仅放行所属发生项挂 draft/cancelled ECN 的增删');
  const releasedJoin = (row: string): string =>
    `EXISTS (SELECT 1 FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId" JOIN ${header} h ON h."id" = l."headerId" WHERE occ."id" = ${row}."occurrenceId" AND h."state" = 'released')`;
  const ownerEcnIs = (row: string, states: string): string =>
    `EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = ${row}."occurrenceId" AND ${ecnStateIs('occ."ecnInId"', states)})`;
  const ownerAttachable = (row: string): string =>
    `EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = ${row}."occurrenceId" AND ${ecnAttachable('occ."ecnInId"')})`;
  return [
    ...sqliteTrigger(
      tableRef,
      'bom_line_designator_released_i',
      'BEFORE INSERT',
      raiseWhen(message, `${releasedJoin('NEW')} AND NOT (${ownerAttachable('NEW')})`)
    ),
    ...sqliteTrigger(
      tableRef,
      'bom_line_designator_released_u',
      'BEFORE UPDATE',
      raiseWhen(message, releasedJoin('NEW'))
    ),
    ...sqliteTrigger(
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
  if (!isEntity(metadata, BomHeader)) return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = sqliteTableOf(BomLineOccurrence);
  const designator = sqliteTableOf(BomLineDesignator);
  const line = sqliteTableOf(BomLine);
  const count = (row: string): string => `(SELECT COUNT(*) FROM ${designator} d WHERE d."occurrenceId" = ${row}."id")`;
  // 非整数 qty（含 NULL）不参与比较；整数性由逐字节判定（无小数点）
  const expected = (row: string): string =>
    `CASE WHEN ${row}."qty" IS NULL OR instr(${row}."qty", '.') > 0 THEN -1 ELSE CAST(${row}."qty" AS INTEGER) END`;
  const message =
    `'${PUBLISH_VALIDATION('bom_header', '位号计数违约：')}'` +
    ` || occ."id" || ':位号数' || ${count('occ')} || ':qty' || COALESCE(occ."qty", 'NULL')`;
  const sql = [
    `SELECT RAISE(ABORT, ${message})`,
    `FROM ${occurrence} occ`,
    `JOIN ${line} l ON l."id" = occ."lineId"`,
    `WHERE l."headerId" = NEW."id" AND occ."designatorManaged" = true`,
    `  AND ${count('occ')} <> ${expected('occ')}`,
    `LIMIT 1;`
  ].join('\n');
  return sqliteTrigger(
    tableRef,
    'bom_header_designator_publish_trg',
    'BEFORE UPDATE OF "state"',
    sql,
    `OLD."state" = 'draft' AND NEW."state" = 'released'`
  );
};
/**
 * by_product 子件不得是头父件（US-513 AC#11）：主产物就是头父件，副产自己的头父件
 * 没有意义；发布转移校验（与位号计数同入口形态）。
 */
const sqliteByProductGuard = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomHeader)) return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = sqliteTableOf(BomLineOccurrence);
  const line = sqliteTableOf(BomLine);
  const header = sqliteTableOf(BomHeader);
  const revision = sqliteTableOf(BomItemRevision);
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
  return sqliteTrigger(
    tableRef,
    'bom_header_by_product_guard_trg',
    'BEFORE UPDATE OF "state"',
    sql,
    `OLD."state" = 'draft' AND NEW."state" = 'released'`
  );
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
  if (isEntity(metadata, BomLineOccurrence)) {
    const tableRef = sqliteTableRef(metadata);
    const group = sqliteTableOf(BomSubstituteGroup);
    const line = sqliteTableOf(BomLine);
    const probabilityMessage = DECIMAL_FORMAT('usageProbability', '替代概率限 [0,1]、小数至多 9 位');
    const probabilityViolation =
      `NEW."usageProbability" IS NOT NULL AND NOT (` +
      `NEW."usageProbability" = '0' OR NEW."usageProbability" = '1' OR ` +
      `(substr(NEW."usageProbability", 1, 2) = '0.' AND length(NEW."usageProbability") <= 11))`;
    statements.push(
      ...sqliteTrigger(
        tableRef,
        'bom_line_occurrence_probability_domain_i',
        'BEFORE INSERT',
        raiseWhen(probabilityMessage, probabilityViolation)
      ),
      ...sqliteTrigger(
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
      ...sqliteTrigger(
        tableRef,
        'bom_line_occurrence_substitute_cross_i',
        'BEFORE INSERT',
        raiseWhen(crossMessage, crossViolation('NEW'))
      ),
      ...sqliteTrigger(
        tableRef,
        'bom_line_occurrence_substitute_cross_u',
        'BEFORE UPDATE',
        raiseWhen(crossMessage, crossViolation('NEW'))
      )
    );
  }
  if (isEntity(metadata, BomSubstituteGroup)) {
    const tableRef = sqliteTableRef(metadata);
    const header = sqliteTableOf(BomHeader);
    const message = WRITE_PROTOCOL(
      metadata.tableName,
      '已发布头的替代组仅放行挂 draft ECN 的插入与挂 draft/cancelled ECN 的删除（组属性不可改，改策略即由 ECN 新建一组）'
    );
    const releasedJoin = (row: string): string =>
      `EXISTS (SELECT 1 FROM ${header} h WHERE h."id" = ${row}."headerId" AND h."state" = 'released')`;
    statements.push(
      ...sqliteTrigger(
        tableRef,
        'bom_substitute_group_released_i',
        'BEFORE INSERT',
        raiseWhen(message, `${releasedJoin('NEW')} AND NOT (${ecnAttachable('NEW."ecnInId"')})`)
      ),
      ...sqliteTrigger(
        tableRef,
        'bom_substitute_group_released_u',
        'BEFORE UPDATE',
        raiseWhen(message, releasedJoin('NEW'))
      ),
      ...sqliteTrigger(
        tableRef,
        'bom_substitute_group_released_d',
        'BEFORE DELETE',
        raiseWhen(message, `${releasedJoin('OLD')} AND NOT (${ecnStateIs('OLD."ecnInId"', "'draft', 'cancelled'")})`)
      )
    );
  }
  return statements;
};

/** 定点整数（10⁹ 为 1）还原规范串：整数段（长度 > 9 时取前缀）+ '.' + 右 9 位小数段（SQLite）。 */
const sqliteFixedText = (total: string): string =>
  `CASE WHEN length(CAST(${total} AS TEXT)) > 9` +
  ` THEN substr(CAST(${total} AS TEXT), 1, length(CAST(${total} AS TEXT)) - 9) || '.' || substr('000000000' || CAST(${total} AS TEXT), -9)` +
  ` ELSE '0.' || substr('000000000' || CAST(${total} AS TEXT), -9) END`;

/** 替代组切片聚合的方言差异：CTE 列名引用、文本转整数、消息里非文本列的拼接、定点合计还原。 */
interface SliceDialect {
  name(column: string): string;
  integer(expression: string): string;
  text(expression: string): string;
  fixedText(total: string): string;
}

const SQLITE_SLICE: SliceDialect = {
  name: column => `"${column}"`,
  integer: expression => `CAST(${expression} AS INTEGER)`,
  text: expression => expression,
  fixedText: total => sqliteFixedText(total)
};

/** 一条切片违约查询：消息细节、消息尾（违约值）与按切片分组的 HAVING 查询。 */
interface SliceCheck {
  detail: string;
  suffix: string;
  violations: string;
}

/**
 * 替代组切片聚合（US-512 技术笔记「切片」）：头发布与 ECN 投影、两后端共用同一份切片与 HAVING 体——
 * 检查点 = 校验起点 ∪ 其后的成员区间端点（无起点取全时间轴的全部端点），每个**非空**切片
 * 恰好一个 primary、priority 不并列（NULL 优先级彼此不算并列）、proportional 定点合计恒 1
 * （NULL 概率按 0、`1` 按 10⁹ 计，与运行期 `usageProbability ?? '0'` 同口径）。
 *
 * @param dialect - 方言差异
 * @param group - 替代组表引用
 * @param members - 成员行查询（列 `gid` / `f` / `t` / `role` / `prio` / `prob`）
 * @param startDate - 校验起点表达式；`null` 取全时间轴（头发布）
 * @returns 公共 CTE 与三条违约查询，依次校验 primary / priority / proportional
 */
const substituteSliceQueries = (
  dialect: SliceDialect,
  group: string,
  members: string,
  startDate: string | null
): { cte: string; checks: SliceCheck[] } => {
  const n = dialect.name;
  const points =
    startDate === null ?
      `SELECT m.${n('f')} AS ${n('p')} FROM members m UNION SELECT m.${n('t')} FROM members m WHERE m.${n('t')} IS NOT NULL`
    : `SELECT ${startDate} AS ${n('p')} UNION SELECT m.${n('f')} FROM members m WHERE m.${n('f')} > ${startDate}` +
      ` UNION SELECT m.${n('t')} FROM members m WHERE m.${n('t')} > ${startDate}`;
  const cte =
    `WITH members AS (${members}), points AS (${points}), active AS (` +
    `SELECT a.${n('gid')}, po.${n('p')}, a.${n('role')}, a.${n('prio')}, a.${n('prob')} FROM members a JOIN points po` +
    ` ON a.${n('f')} <= po.${n('p')} AND (a.${n('t')} IS NULL OR a.${n('t')} > po.${n('p')}))`;
  const strategyIs = (strategy: string): string =>
    `(SELECT g."strategy" FROM ${group} g WHERE g."id" = a.${n('gid')}) = '${strategy}'`;
  const fixedProb =
    `CASE WHEN a.${n('prob')} IS NULL THEN 0 WHEN a.${n('prob')} = '1' THEN 1000000000` +
    ` ELSE ${dialect.integer(`substr(a.${n('prob')} || '000000000', 3, 9)`)} END`;
  const slice = `a.${n('gid')}, a.${n('p')}`;
  const prio = `a.${n('prio')}`;
  return {
    cte,
    checks: [
      {
        detail: '替代组切片缺 primary 或不止一个 primary：',
        suffix: '',
        violations: `SELECT ${slice} FROM active a GROUP BY ${slice} HAVING SUM(CASE WHEN a.${n('role')} = 'primary' THEN 1 ELSE 0 END) <> 1`
      },
      {
        detail: 'priority 组切片优先级并列：',
        suffix: ` || ':并列' || ${dialect.text(`bad.${n('dup')}`)}`,
        violations:
          `SELECT ${slice}, COUNT(${prio}) - COUNT(DISTINCT ${prio}) AS ${n('dup')} FROM active a` +
          ` WHERE ${strategyIs('priority')} GROUP BY ${slice} HAVING COUNT(${prio}) <> COUNT(DISTINCT ${prio})`
      },
      {
        detail: '替代组概率合计 ≠ 1：',
        suffix: ` || ':' || ${dialect.fixedText(`bad.${n('total')}`)}`,
        violations:
          `SELECT ${slice}, SUM(${fixedProb}) AS ${n('total')} FROM active a` +
          ` WHERE ${strategyIs('proportional')} GROUP BY ${slice} HAVING SUM(${fixedProb}) <> 1000000000`
      }
    ]
  };
};

/**
 * 替代组切片校验的 SQLite 组装（{@link substituteSliceQueries}）：RAISE 必须是触发体顶层语句，
 * 消息表达式内联在 SELECT 里（点名组编码与切片点）。
 *
 * @param skip - 整体跳过条件（历史装载；无则 `'0'`）
 * @returns 三条触发器体顶层语句
 */
const sqliteSubstituteSliceChecks = (
  members: string,
  startDate: string | null,
  subject: string,
  skip: string
): string[] => {
  const group = sqliteTableOf(BomSubstituteGroup);
  const { cte, checks } = substituteSliceQueries(SQLITE_SLICE, group, members, startDate);
  const code = `(SELECT g."code" FROM ${group} g WHERE g."id" = bad."gid")`;
  return checks.map(
    ({ detail, suffix, violations }) =>
      `${cte} SELECT RAISE(ABORT, '${PUBLISH_VALIDATION(subject, detail)}' || ${code} || ':' || bad."p"${suffix})` +
      ` FROM (${violations} LIMIT 1) bad WHERE NOT (${skip});`
  );
};

/**
 * 替代组发布转移聚合校验（US-512 AC#5/#7/#9/#11/#12/#14/#15）：零成员或从无 primary 的组拒绝，
 * 其余按原子切片校验（{@link sqliteSubstituteSliceChecks}，与 ECN 投影同一口径）。单个触发器内
 * 逐条校验，先违约者报错（与 PG 侧函数同序）。
 */
const sqliteSubstitutePublishGuard = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomHeader)) return [];
  const group = sqliteTableOf(BomSubstituteGroup);
  const member = sqliteTableOf(BomLineOccurrence);
  const hasMember = (condition: string): string =>
    `EXISTS (SELECT 1 FROM ${member} m WHERE m."substituteGroupId" = g."id"${condition})`;
  const members =
    `SELECT m."substituteGroupId" AS "gid", m."effectiveFrom" AS "f", m."effectiveTo" AS "t",` +
    ` m."substituteRole" AS "role", m."substitutePriority" AS "prio", m."usageProbability" AS "prob"` +
    ` FROM ${member} m JOIN ${group} g ON g."id" = m."substituteGroupId" WHERE g."headerId" = NEW."id"`;
  const body = [
    raiseWhen(
      PUBLISH_VALIDATION('bom_header', '替代组零成员或缺 primary'),
      `EXISTS (SELECT 1 FROM ${group} g WHERE g."headerId" = NEW."id" AND ` +
        `(NOT ${hasMember('')} OR NOT ${hasMember(` AND m."substituteRole" = 'primary'`)}))`
    ),
    ...sqliteSubstituteSliceChecks(members, null, 'bom_header', '0')
  ].join('\n');
  // 旧版拆成四个触发器（逆创建序执行，与 PG 校验序相反）：合并后旧名一并删除
  const retired = ['trg_0', 'trg_1', 'trg_2', 'total_trg'].map(
    suffix => `DROP TRIGGER IF EXISTS ${quoteSqlIdentifier(`bom_header_substitute_publish_${suffix}`)};`
  );
  return [
    ...retired,
    ...sqliteTrigger(
      sqliteTableRef(metadata),
      'bom_header_substitute_publish_trg',
      'BEFORE UPDATE OF "state"',
      body,
      `OLD."state" = 'draft' AND NEW."state" = 'released'`
    )
  ];
};
/**
 * 工艺路线的存储守卫（US-524/520）：
 * 1. 分摊比例域 `[0,1]`、小数至多 9 位（与 usage_probability 同域，保存期拒绝）；
 * 2. 工序损耗良率制 `[0,1)`（US-511 记法同域）；
 * 3. 发布转移：头挂路由时投料工序与分摊行必须在路由序集内（挂了必须可解析）；
 *    分摊合计恒 1（按发生项分组，随发生项生效域不跨期相加）；
 * 4. 发布之后：已发布头引用的工序键 `(routing_id, operation_seq)` 不可删除、改号或移出路线（US-520 AC#13）。
 */
const sqliteRoutingGuards = (metadata: EntityMetadata): string[] => {
  const statements: string[] = [];
  if (isEntity(metadata, BomLineOperationSplit)) {
    const tableRef = sqliteTableRef(metadata);
    const message = DECIMAL_FORMAT('ratio', '分摊比例限 [0,1]、小数至多 9 位');
    const violation = `NOT (NEW."ratio" = '0' OR NEW."ratio" = '1' OR (substr(NEW."ratio", 1, 2) = '0.' AND length(NEW."ratio") <= 11))`;
    statements.push(
      ...sqliteTrigger(
        tableRef,
        'bom_line_operation_split_ratio_domain_i',
        'BEFORE INSERT',
        raiseWhen(message, violation)
      ),
      ...sqliteTrigger(
        tableRef,
        'bom_line_operation_split_ratio_domain_u',
        'BEFORE UPDATE',
        raiseWhen(message, violation)
      )
    );
    // US-520 AC#6：行既有 operation_seq 又有分摊行——两种表达互斥
    const occurrence = sqliteTableOf(BomLineOccurrence);
    const exclusiveMessage = WRITE_PROTOCOL(
      'bom_line_operation_split',
      '行既有 operation_seq 又有分摊行（两种表达互斥）'
    );
    const exclusiveViolation = `EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = NEW."occurrenceId" AND occ."operationSeq" IS NOT NULL)`;
    statements.push(
      ...sqliteTrigger(
        tableRef,
        'bom_line_operation_split_exclusive_i',
        'BEFORE INSERT',
        raiseWhen(exclusiveMessage, exclusiveViolation)
      ),
      ...sqliteTrigger(
        tableRef,
        'bom_line_operation_split_exclusive_u',
        'BEFORE UPDATE',
        raiseWhen(exclusiveMessage, exclusiveViolation)
      )
    );
    // US-515 矩阵：已发布头的分摊行仅放行所属发生项挂 draft（DELETE 另含 cancelled）ECN 的增删
    const line = sqliteTableOf(BomLine);
    const header = sqliteTableOf(BomHeader);
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
      ...sqliteTrigger(
        tableRef,
        'bom_line_operation_split_released_i',
        'BEFORE INSERT',
        [
          raiseWhen(protocolMessage, `${releasedJoin('NEW')} AND NOT (${ownerAttachable('NEW')})`),
          raiseWhen(UNROUTED_SPLIT, releasedUnroutedHeader(sqliteTableOf, 'split'))
        ].join('\n')
      ),
      ...sqliteTrigger(
        tableRef,
        'bom_line_operation_split_released_u',
        'BEFORE UPDATE',
        raiseWhen(protocolMessage, releasedJoin('NEW'))
      ),
      ...sqliteTrigger(
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
  // US-520 AC#5/#7：行的 operation_seq 在保存期即校验（头已挂路由时必须在工序序集内）；
  // AC#6 互斥的发生项一侧：已有分摊行时不得再挂 operation_seq（分摊行一侧见上）
  if (isEntity(metadata, BomLineOccurrence)) {
    const tableRef = sqliteTableRef(metadata);
    const line = sqliteTableOf(BomLine);
    const header = sqliteTableOf(BomHeader);
    const operation = sqliteTableOf(BomRoutingOperation);
    const split = sqliteTableOf(BomLineOperationSplit);
    const routingViolation =
      `NEW."operationSeq" IS NOT NULL AND EXISTS (` +
      `SELECT 1 FROM ${line} l JOIN ${header} h ON h."id" = l."headerId"` +
      ` WHERE l."id" = NEW."lineId" AND h."routingId" IS NOT NULL` +
      ` AND NOT EXISTS (SELECT 1 FROM ${operation} op WHERE op."routingId" = h."routingId" AND op."operationSeq" = NEW."operationSeq"))`;
    // 未挂路线的已发布头：INSERT 带工序即拒，UPDATE 只在改挂工序时拒（存量行的其余写入不被追溯拒绝）
    const body = (attachesSeq: string): string =>
      [
        raiseWhen(WRITE_PROTOCOL('bom_line_occurrence', '投料工序不属于头选定的路线'), routingViolation),
        raiseWhen(UNROUTED_OCCURRENCE, `${attachesSeq} AND ${releasedUnroutedHeader(sqliteTableOf, 'occurrence')}`),
        raiseWhen(
          WRITE_PROTOCOL('bom_line_occurrence', '行既有 operation_seq 又有分摊行（两种表达互斥）'),
          `NEW."operationSeq" IS NOT NULL AND EXISTS (SELECT 1 FROM ${split} s WHERE s."occurrenceId" = NEW."id")`
        )
      ].join('\n');
    statements.push(
      ...sqliteTrigger(
        tableRef,
        'bom_line_occurrence_operation_seq_i',
        'BEFORE INSERT',
        body(`NEW."operationSeq" IS NOT NULL`)
      ),
      ...sqliteTrigger(
        tableRef,
        'bom_line_occurrence_operation_seq_u',
        'BEFORE UPDATE',
        body(`NEW."operationSeq" IS NOT NULL AND NEW."operationSeq" IS NOT OLD."operationSeq"`)
      )
    );
  }
  if (isEntity(metadata, BomRoutingOperation)) {
    const tableRef = sqliteTableRef(metadata);
    const message = DECIMAL_FORMAT('operationScrap', '良率制损耗必须在 [0,1)（s = 1 拒绝）');
    const violation = `NEW."scrapConvention" = 'yield' AND NEW."operationScrap" <> '0' AND substr(NEW."operationScrap", 1, 2) <> '0.'`;
    const referenced = raiseWhen(OPERATION_REFERENCED, releasedOperationReferenced(sqliteTableOf));
    statements.push(
      ...sqliteTrigger(tableRef, 'bom_routing_operation_scrap_yield_i', 'BEFORE INSERT', raiseWhen(message, violation)),
      ...sqliteTrigger(tableRef, 'bom_routing_operation_scrap_yield_u', 'BEFORE UPDATE', raiseWhen(message, violation)),
      // 已发布头引用的工序键不可改号、移出路线或删除；非键列（损耗、工时等）照常可改
      ...sqliteTrigger(
        tableRef,
        'bom_routing_operation_referenced_u',
        'BEFORE UPDATE',
        referenced,
        `NEW."routingId" IS NOT OLD."routingId" OR NEW."operationSeq" IS NOT OLD."operationSeq"`
      ),
      ...sqliteTrigger(tableRef, 'bom_routing_operation_referenced_d', 'BEFORE DELETE', referenced)
    );
  }
  if (isEntity(metadata, BomHeader)) {
    const tableRef = sqliteTableRef(metadata);
    const occurrence = sqliteTableOf(BomLineOccurrence);
    const split = sqliteTableOf(BomLineOperationSplit);
    const line = sqliteTableOf(BomLine);
    // 投料工序与分摊行必须在路由序集内；头未挂路线却有二者同样拒绝
    const seqMessage = PUBLISH_VALIDATION('bom_header', '投料工序 / 分摊行不在路由工序序集内（挂了必须可解析）');
    const routing = headerRoutingViolations(sqliteTableOf);
    statements.push(
      ...sqliteTrigger(
        tableRef,
        'bom_header_routing_seqs_trg',
        'BEFORE UPDATE OF "state"',
        [
          raiseWhen(seqMessage, `${routing.seqUncovered} OR ${routing.splitUncovered}`),
          raiseWhen(UNROUTED_PUBLISH, routing.unrouted)
        ].join('\n'),
        `OLD."state" = 'draft' AND NEW."state" = 'released'`
      )
    );
    // 分摊合计 = 1（按发生项分组；定点整数 10⁹，报错按统一定点格式还原合计）
    const splitTotal = `SUM(CAST(substr(replace(s."ratio", '.', '') || '000000000', 1, 10) AS INTEGER))`;
    const totalSql =
      `SELECT occ."id" || ':' || ${sqliteFixedText(splitTotal)} AS "msg"` +
      ` FROM ${split} s JOIN ${occurrence} occ ON occ."id" = s."occurrenceId" JOIN ${line} l ON l."id" = occ."lineId"` +
      ` WHERE l."headerId" = NEW."id"` +
      ` GROUP BY s."occurrenceId"` +
      ` HAVING ${splitTotal} <> 1000000000` +
      ` LIMIT 1`;
    const totalMessage = `'${PUBLISH_VALIDATION('bom_header', '投料分摊合计 ≠ 1：')}' || (${totalSql})`;
    statements.push(
      ...sqliteTrigger(
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
/** 历史装载覆盖补丁（loadHistory 的 headerOverlays）对已发布头可写的列，及随任何写入刷新的审计列。 */
const HEADER_HISTORY_PATCH_FIELDS: ReadonlySet<string> = new Set(['costLotQty', 'routingId', 'updatedAt', 'updatedBy']);

/** 已发布头在开启态批次下仍锁定的列：除补丁列外的全部列（新增列默认锁定）。 */
const headerLockedColumns = (metadata: EntityMetadata): string[] =>
  [...metadata.propertyMap.keys(), ...metadata.foreignKeyRelationMap.keys()]
    .filter(field => !HEADER_HISTORY_PATCH_FIELDS.has(field))
    .map(field => column(metadata, field));

/**
 * 已发布头的字段全拒守卫（US-515 AC#22）：`bom_header` 一旦 released，任何列改动
 * （base_qty / base_uom / 装配损耗 / cost_lot_qty / routing_id 等）都拒绝——头字段要改
 * 须发布新修订；ECN 状态机的级联不碰头表，无放行形态。
 */
const sqliteReleasedHeaderGuard = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomHeader)) return [];
  // 历史装载通道：存在开启态批次时只放行覆盖补丁列（loadHistory 补 cost_lot_qty / routing_id；
  // 补丁不改头的批次号，只能按「通道开放」判定而非行级批次）——其余列与状态照旧锁定，
  // 悬空的开启态批次借不到整张已发布头的写权限
  const historical = `EXISTS (SELECT 1 FROM ${sqliteTableOf(BomHistoryBatch)} b WHERE b."state" = 'open')`;
  const lockedChanged = headerLockedColumns(metadata).map(sqliteColumnChanged).join(' OR ');
  // routing_id 补丁与发布门同一谓词重验：置空或改挂不含工序的路线都让已发布的投料工序无从解析
  const routing = headerRoutingViolations(sqliteTableOf);
  const rerouted = `NEW."routingId" IS NOT OLD."routingId"`;
  return sqliteTrigger(
    sqliteTableRef(metadata),
    'bom_header_released_fields_u',
    'BEFORE UPDATE',
    [
      raiseWhen(
        WRITE_PROTOCOL(metadata.tableName, '已发布头字段不可改（改头字段须发布新修订）'),
        `NOT (${historical}) OR ${lockedChanged}`
      ),
      raiseWhen(UNROUTED_DETACH, `${rerouted} AND ${routing.unrouted}`),
      raiseWhen(REROUTE_UNCOVERED, `${rerouted} AND (${routing.seqUncovered} OR ${routing.splitUncovered})`)
    ].join('\n'),
    `OLD."state" = 'released'`
  );
};

const sqliteHeaderEcnOwnershipGuard = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomHeader)) return [];
  const body = raiseWhen(
    PUBLISH_VALIDATION('bom_header', '逻辑行 / 替代组与发生项的 ECN 归属不一致'),
    `EXISTS (${headerEcnOwnershipViolation(sqliteTableOf, 'NEW."id"')})`
  );
  return [
    ...sqliteTrigger(
      sqliteTableRef(metadata),
      'bom_header_ecn_ownership_i',
      'BEFORE INSERT',
      body,
      `NEW."state" = 'released'`
    ),
    ...sqliteTrigger(
      sqliteTableRef(metadata),
      'bom_header_ecn_ownership_u',
      'BEFORE UPDATE OF "state"',
      body,
      `OLD."state" = 'draft' AND NEW."state" = 'released'`
    )
  ];
};

/**
 * ECN 状态机（US-515 存储层，SQLite）：三种转换——发布（draft → released，禁止追溯生效）、
 * 改期（released 且生效日变，未生效才可、不得越过同一逻辑行后继 ECN、级联先收窄后放宽）、
 * 取消 / 撤回（released → cancelled 未生效才可、draft → cancelled 即撤回；级联删除该 ECN
 * 引入的位号 / 分摊 / 发生项 / 逻辑行 / 替代组并清截止标记）。级联在触发器里执行
 * （级联 DML 照常触发成员表守卫——recursive_triggers 只禁同一触发器自递归——级联形态
 * 落在守卫放行面内：派生区间、draft / cancelled ECN 的删除）；
 * 任一校验失败 RAISE，级联随语句整体回滚（AC#4 不留半生效状态）。
 * 「当日」= 存储层 UTC：`date('now')`。投影校验见 {@link sqliteEcnProjectionChecks}。
 */
const sqliteEcnStateMachineTriggers = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomEcn)) return [];
  const tableRef = sqliteTableRef(metadata);
  const occurrence = sqliteTableOf(BomLineOccurrence);
  const line = sqliteTableOf(BomLine);
  const designator = sqliteTableOf(BomLineDesignator);
  const split = sqliteTableOf(BomLineOperationSplit);
  const group = sqliteTableOf(BomSubstituteGroup);
  const batch = sqliteTableOf(BomHistoryBatch);
  const ecn = tableRef;
  const dateOf = (row: string): string => `date(${row}."effectiveDate")`;
  const instantOf = (row: string): string => `julianday(${row}."effectiveDate")`;
  const historical = (row: string): string =>
    `EXISTS (SELECT 1 FROM ${batch} b WHERE b."batchNo" = ${row}."historyBatchNo" AND b."state" = 'open')`;

  // 直接写入已发布 / 已取消 ECN 也必须经过同一发布合同；历史批次保留迁入通道。
  const insert = [
    ...sqliteTrigger(
      tableRef,
      'ecn_insert_trg',
      'AFTER INSERT',
      [
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '普通写入不可直接创建 cancelled ECN，历史事实必须挂开启态批次'),
          `NEW."state" = 'cancelled' AND NOT ${historical('NEW')}`
        ),
        raiseWhen(
          PUBLISH_VALIDATION(metadata.tableName, '追溯生效被拒绝（生效日早于发布当日，AC#8）'),
          `NEW."state" = 'released' AND ${dateOf('NEW')} < date('now') AND NOT ${historical('NEW')}`
        ),
        ...sqliteEcnProjectionChecks(metadata, 'NEW."id"', 'NEW."effectiveDate"', 'NEW."historyBatchNo"')
      ].join('\n'),
      `NEW."state" IN ('released', 'cancelled')`
    )
  ];

  // 发布：禁止追溯生效（指向开启态历史批次的行跳过——历史装载通道）
  const publish = [
    ...sqliteTrigger(
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
    ` AND ${instantOf('e')} < ${instantOf('NEW')})`;
  const reschedule = [
    ...sqliteTrigger(
      tableRef,
      'ecn_reschedule_trg',
      'AFTER UPDATE',
      [
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '已生效的 ECN 不可改期，改走更正 ECN（AC#7）'),
          `${dateOf('OLD')} <= date('now')`
        ),
        raiseWhen(
          WRITE_PROTOCOL(metadata.tableName, '改期生效日不得早于当前 UTC 日期'),
          `${dateOf('NEW')} < date('now') AND NOT ${historical('OLD')}`
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
        `UPDATE ${occurrence} SET "effectiveFrom" = NEW."effectiveDate" WHERE "ecnInId" = OLD."id" AND ${instantOf('NEW')} > ${instantOf('OLD')};`,
        `UPDATE ${occurrence} SET "effectiveTo" = NEW."effectiveDate" WHERE "ecnOutId" = OLD."id" AND ${instantOf('NEW')} < ${instantOf('OLD')};`,
        `UPDATE ${occurrence} SET "effectiveFrom" = NEW."effectiveDate" WHERE "ecnInId" = OLD."id" AND ${instantOf('NEW')} < ${instantOf('OLD')};`,
        `UPDATE ${occurrence} SET "effectiveTo" = NEW."effectiveDate" WHERE "ecnOutId" = OLD."id" AND ${instantOf('NEW')} > ${instantOf('OLD')};`,
        ...sqliteEcnProjectionChecks(
          metadata,
          'OLD."id"',
          `CASE WHEN NEW."effectiveDate" < OLD."effectiveDate" THEN NEW."effectiveDate" ELSE OLD."effectiveDate" END`,
          'OLD."historyBatchNo"'
        )
      ].join('\n'),
      `OLD."state" = 'released' AND NEW."state" = 'released' AND ${instantOf('OLD')} <> ${instantOf('NEW')}`
    )
  ];

  // 草稿改期也要同步修正已挂发生项的派生区间；发布日期约束只属于 released 改期。
  const draftReschedule = [
    ...sqliteTrigger(
      tableRef,
      'ecn_draft_reschedule_trg',
      'AFTER UPDATE',
      [
        `UPDATE ${occurrence} SET "effectiveFrom" = NEW."effectiveDate" WHERE "ecnInId" = OLD."id" AND ${instantOf('NEW')} > ${instantOf('OLD')};`,
        `UPDATE ${occurrence} SET "effectiveTo" = NEW."effectiveDate" WHERE "ecnOutId" = OLD."id" AND ${instantOf('NEW')} < ${instantOf('OLD')};`,
        `UPDATE ${occurrence} SET "effectiveFrom" = NEW."effectiveDate" WHERE "ecnInId" = OLD."id" AND ${instantOf('NEW')} < ${instantOf('OLD')};`,
        `UPDATE ${occurrence} SET "effectiveTo" = NEW."effectiveDate" WHERE "ecnOutId" = OLD."id" AND ${instantOf('NEW')} > ${instantOf('OLD')};`
      ].join('\n'),
      `OLD."state" = 'draft' AND NEW."state" = 'draft' AND ${instantOf('OLD')} <> ${instantOf('NEW')}`
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
    ...sqliteTrigger(
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
        // 历史装载豁免与发布同口径：按目标 ECN 装载时的批次号判定（取消可能顺带改写批次号，取 OLD）
        ...sqliteEcnProjectionChecks(metadata, 'OLD."id"', 'OLD."effectiveDate"', 'OLD."historyBatchNo"')
      ].join('\n'),
      `(OLD."state" = 'released' OR OLD."state" = 'draft') AND NEW."state" = 'cancelled'`
    )
  ];

  // 其余转移拒绝：released → draft、cancelled → *、released 改其他列、任何状态改 ecnNo
  const guard = [
    ...sqliteTrigger(
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

  return [...insert, ...publish, ...reschedule, ...draftReschedule, ...cancel, ...guard];
};

/**
 * 转换后运行投影校验（US-515 AC#9/#23/#24/#25 + US-512 AC#6/#9/#14 + 阶梯 / 位号 / 分摊，
 * SQLite 侧）：ECN 的发布 / 改期 / 取消三种转换在「转换后运行投影」上对全部已发布头做
 * 跨行聚合校验——投影成员排除未发布 ECN 引入的发生项、未发布 ECN 的截止不采信（视为 +∞）；
 * 替代组按「检查点切片」聚合（与头发布同一口径，见 {@link sqliteSubstituteSliceChecks}）；
 * 位号计数与分摊合计对目标 ECN 引入的行逐行校验；阶梯按投影成员两两相交校验。
 * 历史装载的 ECN 转换暂缓投影校验，批次关闭时以空目标重验最终全时间轴投影。
 *
 * @param metadata - BomEcn 的实体元数据
 * @param target - 目标 ECN 的 id 表达式；空值检查全部已发布成员
 * @param startDate - 校验起点表达式；空值检查全时间轴
 * @param historyBatchNo - 目标 ECN 的批次号表达式（历史装载跳过用；运行时恒 NULL）
 */
const sqliteEcnProjectionChecks = (
  metadata: EntityMetadata,
  target: string | null,
  startDate: string | null,
  historyBatchNo: string,
  batchNo?: string
): string[] => {
  const occurrence = sqliteTableOf(BomLineOccurrence);
  const line = sqliteTableOf(BomLine);
  const header = sqliteTableOf(BomHeader);
  const ecn = sqliteTableOf(BomEcn);
  const designator = sqliteTableOf(BomLineDesignator);
  const split = sqliteTableOf(BomLineOperationSplit);
  const batch = sqliteTableOf(BomHistoryBatch);
  const targetId = target ?? 'NULL';
  const inScope = (owner: string): string =>
    batchNo === undefined ? '1 = 1' : historyAffectedHeader(sqliteTableOf, owner, batchNo);

  // 历史装载跳过：目标 ECN 的批次号指向开启态批次
  const historical =
    historyBatchNo !== 'NULL' ?
      `EXISTS (SELECT 1 FROM ${batch} b WHERE b."batchNo" = ${historyBatchNo} AND b."state" = 'open')`
    : '0';
  // 投影可见：未发布 ECN 引入的行排除；采信区间：未发布截止视为 +∞
  const visible = (alias: string): string =>
    `(${alias}."ecnInId" IS NULL OR ${alias}."ecnInId" = ${targetId} OR ` +
    `EXISTS (SELECT 1 FROM ${ecn} e WHERE e."id" = ${alias}."ecnInId" AND e."state" = 'released'))`;
  const trustedTo = (alias: string): string =>
    `CASE WHEN ${alias}."ecnOutId" IS NULL OR ${alias}."ecnOutId" = ${targetId} OR ` +
    `EXISTS (SELECT 1 FROM ${ecn} e WHERE e."id" = ${alias}."ecnOutId" AND e."state" = 'released') ` +
    `THEN ${alias}."effectiveTo" ELSE NULL END`;

  // 替代组成员（投影 + 采信区间 + 已发布头）
  const members =
    `SELECT m."substituteGroupId" AS "gid", m."effectiveFrom" AS "f", ${trustedTo('m')} AS "t",` +
    ` m."substituteRole" AS "role", m."substitutePriority" AS "prio", m."usageProbability" AS "prob"` +
    ` FROM ${occurrence} m JOIN ${line} l ON l."id" = m."lineId" JOIN ${header} h ON h."id" = l."headerId"` +
    ` WHERE h."state" = 'released' AND ${inScope('h')} AND m."substituteGroupId" IS NOT NULL AND ${visible('m')} AND ${visible('l')}`;

  const guards: string[] = buildSqliteCoproductProjectionChecks(
    metadata,
    targetId,
    startDate ?? "'0001-01-01T00:00:00.000Z'",
    historyBatchNo,
    inScope('h')
  );
  const occurrenceScope = (row: string): string => (target === null ? visible(row) : `${row}."ecnInId" = ${targetId}`);

  // 位号计数（目标 ECN 引入的 managed 行，发布时逐行；AC#9 错误点名头与发生项）
  const designatorCount = (row: string): string =>
    `(SELECT COUNT(*) FROM ${designator} d WHERE d."occurrenceId" = ${row}."id")`;
  const expectedQty = (row: string): string =>
    `CASE WHEN ${row}."qty" IS NULL OR instr(${row}."qty", '.') > 0 THEN -1 ELSE CAST(${row}."qty" AS INTEGER) END`;
  const designatorMessage =
    `'${PUBLISH_VALIDATION('ecn', '位号计数违约：')}'` +
    ` || occ."id" || ':位号数' || ${designatorCount('occ')} || ':qty' || COALESCE(occ."qty", 'NULL')`;
  guards.push(
    `SELECT RAISE(ABORT, ${designatorMessage}) FROM ${occurrence} occ` +
      ` JOIN ${line} l ON l."id" = occ."lineId" JOIN ${header} h ON h."id" = l."headerId"` +
      ` WHERE ${occurrenceScope('occ')} AND h."state" = 'released' AND ${inScope('h')} AND ${visible('l')}` +
      ` AND occ."designatorManaged" = true AND ${designatorCount('occ')} <> ${expectedQty('occ')}` +
      ` AND NOT (${historical}) LIMIT 1;`
  );

  // 分摊合计（目标 ECN 引入的发生项，逐发生项定点合计 = 1）
  const splitTotal = `SUM(CAST(substr(replace(s."ratio", '.', '') || '000000000', 1, 10) AS INTEGER))`;
  const splitMessage = `'${PUBLISH_VALIDATION('ecn', '投料分摊合计 ≠ 1：')}' || s."occurrenceId" || ':' || ${sqliteFixedText(splitTotal)}`;
  guards.push(
    `SELECT RAISE(ABORT, ${splitMessage}) FROM ${split} s JOIN ${occurrence} o ON o."id" = s."occurrenceId"` +
      ` JOIN ${line} l ON l."id" = o."lineId" JOIN ${header} h ON h."id" = l."headerId"` +
      ` WHERE ${occurrenceScope('o')} AND h."state" = 'released' AND ${inScope('h')} AND ${visible('l')} AND NOT (${historical})` +
      ` GROUP BY s."occurrenceId" HAVING ${splitTotal} <> 1000000000 LIMIT 1;`
  );

  // 替代组：检查点切片聚合（与头发布同一口径，空切片不校验，US-512 AC#6/#9/#14）
  guards.push(...sqliteSubstituteSliceChecks(members, startDate, 'ecn', historical));

  // 阶梯：投影成员两两「日期段与批量段同时相交」（同头同组；与头发布校验同谓词形态）
  const tierMessage =
    `'${PUBLISH_VALIDATION('ecn', '阶梯切片重叠：')}'` +
    ` || a."tierGroupNo" || ':' || a."id" || ':' || b."id" || ':日期段与批量段同时相交'`;
  const dateOverlap = (x: string, y: string): string =>
    `(${trustedTo(x)} IS NULL OR ${y}."effectiveFrom" < ${trustedTo(x)}) AND ` +
    `(${trustedTo(y)} IS NULL OR ${x}."effectiveFrom" < ${trustedTo(y)})`;
  const lotOverlap = (x: string, y: string, suffix: string): string =>
    `(${x}."${suffix}To" IS NULL OR CAST(${y}."${suffix}From" AS REAL) < CAST(${x}."${suffix}To" AS REAL)) AND ` +
    `(${y}."${suffix}To" IS NULL OR CAST(${x}."${suffix}From" AS REAL) < CAST(${y}."${suffix}To" AS REAL))`;
  guards.push(
    `SELECT RAISE(ABORT, ${tierMessage})` +
      ` FROM ${occurrence} a JOIN ${line} la ON la."id" = a."lineId" JOIN ${header} ha ON ha."id" = la."headerId"` +
      ` JOIN ${occurrence} b ON b."id" <> a."id" AND b."tierGroupNo" = a."tierGroupNo"` +
      ` JOIN ${line} lb ON lb."id" = b."lineId" JOIN ${header} hb ON hb."id" = lb."headerId"` +
      ` WHERE ha."id" = hb."id" AND ha."state" = 'released' AND ${inScope('ha')} AND a."tierGroupNo" IS NOT NULL` +
      ` AND ${visible('a')} AND ${visible('b')} AND ${visible('la')} AND ${visible('lb')}` +
      ` AND ${dateOverlap('a', 'b')} AND ${lotOverlap('a', 'b', 'lotsize')}` +
      ` AND NOT (${historical}) LIMIT 1;`
  );

  return guards;
};

/**
 * 行映射的 NULL 规则（US-516 AC#9，存储层）：added 只 source 空、removed 只 target 空、
 * 其余四态两侧必填、不允许双 NULL。
 */
const sqliteMapNullRuleTriggers = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomMap)) return [];
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
    ...sqliteTrigger(tableRef, 'bom_map_null_rule_i', 'BEFORE INSERT', raiseWhen(message, violation('NEW'))),
    ...sqliteTrigger(tableRef, 'bom_map_null_rule_u', 'BEFORE UPDATE', raiseWhen(message, violation('NEW')))
  ];
};

/** 实体全部 SQLite 触发器 DDL（单条语句数组）。 */

export const buildSqliteBomTriggerDdl = (
  metadata: EntityMetadata,
  options: BomTriggerDdlOptions = { historyProjection: true }
): string[] => [
  ...buildSqliteCoproductDdl(metadata),
  ...buildSqliteInstanceNodeDdl(metadata),
  ...buildSqliteInstanceSourceDdl(metadata),
  // 有效域三维重叠守卫创建最早 = 执行最晚（SQLite 同事件触发器逆创建序）：
  // 让 ECN 派生 / 行归属等更具体的违约先报，三维重叠作兜底
  ...buildUnitLotOverlapGuardSqlite(metadata),
  ...buildSqliteStructuralDdl(metadata),
  ...sqlitePublishedRevisionTrigger(metadata),
  ...sqlitePublishTransitionTrigger(metadata),
  ...sqliteHistoryBatchTriggers(metadata, options.historyProjection),
  ...sqliteEcnStateMachineTriggers(metadata),
  ...sqliteReleasedHeaderMembersGuard(metadata),
  ...sqliteEcnOccurrenceGuards(metadata),
  ...sqliteReleasedHeaderGuard(metadata),
  ...sqliteHeaderEcnOwnershipGuard(metadata),
  ...sqliteMapNullRuleTriggers(metadata),
  ...sqliteDecimalFormatTriggers(metadata),
  ...sqliteTierPublishGuard(metadata),
  ...sqliteDesignatorCountGuard(metadata),
  ...sqliteDesignatorReleasedGuard(metadata),
  ...sqliteByProductGuard(metadata),
  ...sqliteSubstituteGuards(metadata),
  ...sqliteSubstitutePublishGuard(metadata),
  ...sqliteRoutingGuards(metadata)
];

// -----------------------------------------------------[ PGlite ]

const pgPublishedRevisionFunction = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomItemRevision)) return [];
  const state = column(metadata, 'state');
  const changed = ['revisionNo', 'defaultPhantom', 'effectiveFrom']
    .map(field => `OLD.${column(metadata, field)} IS DISTINCT FROM NEW.${column(metadata, field)}`)
    .join(' OR ');
  const body =
    `  IF OLD.${state} = 'released' AND (NEW.${state} = 'draft' OR ${changed}) THEN\n` +
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('item_revision', '已发布修订除状态转移外不可改（改虚拟件标记须发布新修订）')}';\n  END IF;`;
  const tableRef = pgTableRef(metadata);
  return [
    pgTriggerFunction(metadata, 'item_revision__published_guard', body),
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
  if (!isEntity(metadata, BomItemRevision)) return [];
  const state = column(metadata, 'state');
  const effectiveFrom = column(metadata, 'effectiveFrom');
  const historyBatchNo = column(metadata, 'historyBatchNo');
  const batchTable = pgTableOf(BomHistoryBatch);
  const body =
    `  IF NEW.${state} = 'released' AND (TG_OP = 'INSERT' OR OLD.${state} = 'draft') THEN\n` +
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
    pgTriggerFunction(metadata, 'item_revision__publish_guard', body),
    pgCreateTrigger(
      metadata,
      tableRef,
      'item_revision__publish_trg',
      'BEFORE INSERT OR UPDATE',
      'item_revision__publish_guard'
    )
  ];
};

const pgHistoryBatchFunction = (metadata: EntityMetadata, historyProjection: boolean): string[] => {
  if (!isEntity(metadata, BomHistoryBatch)) return [];
  const state = column(metadata, 'state');
  const body =
    `  IF TG_OP = 'DELETE' THEN\n` +
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_history_batch', '批次表只追加，不允许删除')}';\n` +
    `  END IF;\n` +
    `  IF TG_OP = 'UPDATE' AND NOT (OLD.${state} = 'open' AND NEW.${state} = 'closed') THEN\n` +
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_history_batch', '批次行不可改写，只允许 open → closed 转移')}';\n` +
    `  END IF;\n` +
    (historyProjection ? pgEcnProjectionChecks(metadata, null, null, 'NULL', 'NEW."batchNo"') : []).join('\n') +
    '\n' +
    (historyProjection ? historyProjectionQueries(pgTableOf, 'NEW."batchNo"') : []).map(pgRaiseBlock).join('\n');
  const tableRef = pgTableRef(metadata);
  return [
    pgTriggerFunction(metadata, 'bom_history_batch__append_guard', body),
    pgCreateTrigger(
      metadata,
      tableRef,
      'bom_history_batch__append_trg',
      'BEFORE DELETE OR UPDATE',
      'bom_history_batch__append_guard'
    )
  ];
};

/** PG 侧 ECN 状态谓词（与 SQLite 侧同口径）。 */
const pgEcnStateIs = (idExpr: string, states: string): string =>
  `EXISTS (SELECT 1 FROM ${pgTableOf(BomEcn)} e WHERE e."id" = ${idExpr} AND e."state" IN (${states}))`;

/** PG 侧「运行时可挂」谓词：draft，或 released 且属于开启态历史批次。 */
const pgEcnAttachable = (idExpr: string): string =>
  `(${pgEcnStateIs(idExpr, "'draft'")} OR EXISTS (SELECT 1 FROM ${pgTableOf(BomEcn)} e JOIN ${pgTableOf(BomHistoryBatch)} b ON b."batchNo" = e."historyBatchNo" WHERE e."id" = ${idExpr} AND e."state" = 'released' AND b."state" = 'open'))`;

/**
 * 已发布头的行 / 发生项写入协议（PG 侧，与 SQLite 同口径的矩阵形态）。
 */
const pgReleasedHeaderMembersFunction = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomLine, BomLineOccurrence)) return [];
  const tableRef = pgTableRef(metadata);
  const headerRef = pgTableOf(BomHeader);
  const lineRef = pgTableOf(BomLine);
  const ownerColumn = column(metadata, isEntity(metadata, BomLine) ? 'headerId' : 'lineId');
  // plpgsql 不会给裸列名补行前缀：DELETE 触发器里 NEW 未赋值，按 TG_OP 选行
  const ownerRef = `CASE WHEN TG_OP = 'DELETE' THEN OLD.${ownerColumn} ELSE NEW.${ownerColumn} END`;
  const releasedJoin =
    isEntity(metadata, BomLine) ?
      `SELECT 1 FROM ${headerRef} WHERE "id" = ${ownerRef} AND "state" = 'released'`
    : `SELECT 1 FROM ${headerRef} h JOIN ${lineRef} l ON l."headerId" = h."id" WHERE l."id" = ${ownerRef} AND h."state" = 'released'`;
  const message = WRITE_PROTOCOL(metadata.tableName, '已发布头的成员写入超出写入协议矩阵（US-515）');

  if (isEntity(metadata, BomLine)) {
    const body =
      `  IF TG_OP = 'INSERT' AND EXISTS (${releasedJoin}) AND NOT (${pgEcnAttachable('NEW."ecnInId"')}) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n` +
      `  END IF;\n` +
      `  IF TG_OP = 'UPDATE' AND EXISTS (${releasedJoin}) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n` +
      `  END IF;\n` +
      `  IF TG_OP = 'DELETE' AND EXISTS (${releasedJoin}) AND NOT (` +
      `${pgEcnStateIs('OLD."ecnInId"', "'draft', 'cancelled'")} AND ` +
      `NOT EXISTS (SELECT 1 FROM ${pgTableOf(BomLineOccurrence)} occ WHERE occ."lineId" = OLD."id")) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n` +
      `  END IF;`;
    const functionName = `${metadata.tableName}__released_header_guard`;
    return [
      pgTriggerFunction(metadata, functionName, body),
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
  const derivedFrom = `(SELECT e."effectiveDate" FROM ${pgTableOf(BomEcn)} e WHERE e."id" = NEW."ecnInId")`;
  const derivedTo = `(SELECT e."effectiveDate" FROM ${pgTableOf(BomEcn)} e WHERE e."id" = NEW."ecnOutId")`;
  // 三值逻辑：IF 条件里的 `=` 在 NULL 比较下得到 NULL（不执行），violation 一律二元谓词
  const lineOwnerViolation =
    `EXISTS (SELECT 1 FROM ${lineRef} l WHERE l."id" = NEW."lineId" AND l."ecnInId" IS NOT NULL AND ` +
    `l."ecnInId" IS DISTINCT FROM NEW."ecnInId" AND NOT ${pgEcnStateIs('l."ecnInId"', "'released'")})`;
  const groupOwnerViolation =
    `EXISTS (SELECT 1 FROM ${pgTableOf(BomSubstituteGroup)} g WHERE g."id" = NEW."substituteGroupId" AND ` +
    `g."ecnInId" IS NOT NULL AND g."ecnInId" IS DISTINCT FROM NEW."ecnInId" AND NOT ${pgEcnStateIs('g."ecnInId"', "'released'")})`;
  const untouchedColumns = occurrenceColumnsChanged(metadata, pgColumnChanged, 'protocol');
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
  const draftEditColumns = occurrenceColumnsChanged(metadata, pgColumnChanged, 'draftEdit');
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
    pgTriggerFunction(metadata, functionName, body),
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
  if (!isEntity(metadata, BomLineOccurrence)) return [];
  const tableRef = pgTableRef(metadata);
  const derivedFrom = `(SELECT e."effectiveDate" FROM ${pgTableOf(BomEcn)} e WHERE e."id" = NEW."ecnInId")`;
  const derivedTo = `(SELECT e."effectiveDate" FROM ${pgTableOf(BomEcn)} e WHERE e."id" = NEW."ecnOutId")`;
  const body =
    `  IF TG_OP = 'INSERT' AND (` +
    `(NEW."ecnInId" IS NOT NULL AND (NOT ${pgEcnAttachable('NEW."ecnInId"')} OR NEW."effectiveFrom" IS DISTINCT FROM ${derivedFrom} OR ` +
    `(NEW."ecnOutId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${pgTableOf(BomLine)} l JOIN ${pgTableOf(BomHeader)} h ON h."id" = l."headerId" JOIN ${pgTableOf(BomHistoryBatch)} b ON b."batchNo" = h."historyBatchNo" WHERE l."id" = NEW."lineId" AND b."state" = 'open')) OR NEW."effectiveTo" IS NOT NULL)) OR ` +
    `(NEW."ecnInId" IS NULL AND NEW."ecnOutId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${pgTableOf(BomLine)} l JOIN ${pgTableOf(BomHeader)} h ON h."id" = l."headerId" JOIN ${pgTableOf(BomHistoryBatch)} b ON b."batchNo" = h."historyBatchNo" WHERE l."id" = NEW."lineId" AND b."state" = 'open'))) THEN\n` +
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
    pgTriggerFunction(metadata, 'bom_line_occurrence__ecn_derive_guard', body),
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
 * 已发布头的字段全拒守卫（PG 侧，US-515 AC#22；开启态批次只放行覆盖补丁列，与 SQLite 同口径）。
 */
const pgReleasedHeaderFunction = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomHeader)) return [];
  const state = column(metadata, 'state');
  const lockedChanged = headerLockedColumns(metadata).map(pgColumnChanged).join(' OR ');
  // routing_id 补丁与发布门同一谓词重验（与 SQLite 同口径、同序）
  const routing = headerRoutingViolations(pgTableOf);
  const body =
    `  IF TG_OP = 'UPDATE' AND OLD.${state} = 'released' AND (NOT EXISTS (` +
    `SELECT 1 FROM ${pgTableOf(BomHistoryBatch)} b WHERE b."state" = 'open') OR ${lockedChanged}) THEN\n` +
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_header', '已发布头字段不可改（改头字段须发布新修订）')}';\n` +
    `  END IF;\n` +
    `  IF TG_OP = 'UPDATE' AND OLD.${state} = 'released' AND NEW."routingId" IS DISTINCT FROM OLD."routingId" THEN\n` +
    `    IF ${routing.unrouted} THEN\n` +
    `      RAISE EXCEPTION '${UNROUTED_DETACH}';\n` +
    `    END IF;\n` +
    `    IF ${routing.seqUncovered} OR ${routing.splitUncovered} THEN\n` +
    `      RAISE EXCEPTION '${REROUTE_UNCOVERED}';\n` +
    `    END IF;\n` +
    `  END IF;`;
  return [
    pgTriggerFunction(metadata, 'bom_header__released_guard', body),
    pgCreateTrigger(
      metadata,
      pgTableRef(metadata),
      'bom_header__released_trg',
      'BEFORE UPDATE',
      'bom_header__released_guard'
    )
  ];
};

const pgHeaderEcnOwnershipFunction = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomHeader)) return [];
  const name = 'bom_header__ecn_ownership_guard';
  const body =
    `IF NEW."state" = 'released' AND (TG_OP = 'INSERT' OR OLD."state" = 'draft')` +
    ` AND EXISTS (${headerEcnOwnershipViolation(pgTableOf, 'NEW."id"')}) THEN` +
    ` RAISE EXCEPTION '${PUBLISH_VALIDATION('bom_header', '逻辑行 / 替代组与发生项的 ECN 归属不一致')}'; END IF;`;
  return [
    pgTriggerFunction(metadata, name, body),
    pgCreateTrigger(metadata, pgTableRef(metadata), 'bom_header__ecn_ownership_trg', 'BEFORE INSERT OR UPDATE', name)
  ];
};

/** 直接写入已发布 / 已取消 ECN 的发布合同（历史批次保留迁入通道）。 */
const pgEcnInsertFunction = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomEcn)) return [];
  const tableRef = pgTableRef(metadata);
  const batch = pgTableOf(BomHistoryBatch);
  const utcDateOf = (row: string): string => `(${row}."effectiveDate" AT TIME ZONE 'UTC')::date`;
  const historical = `EXISTS (SELECT 1 FROM ${batch} b WHERE b."batchNo" = NEW."historyBatchNo" AND b."state" = 'open')`;
  const body = [
    `  IF NEW."state" = 'cancelled' AND NOT ${historical} THEN`,
    `    RAISE EXCEPTION '${WRITE_PROTOCOL(metadata.tableName, '普通写入不可直接创建 cancelled ECN，历史事实必须挂开启态批次')}';`,
    `  END IF;`,
    `  IF NEW."state" = 'released' THEN`,
    `    IF ${utcDateOf('NEW')} < (now() AT TIME ZONE 'UTC')::date AND NOT ${historical} THEN`,
    `      RAISE EXCEPTION '${PUBLISH_VALIDATION(metadata.tableName, '追溯生效被拒绝（生效日早于发布当日，AC#8）')}';`,
    `    END IF;`,
    ...pgEcnProjectionChecks(metadata, 'NEW', 'NEW."effectiveDate"', 'NEW."historyBatchNo"'),
    `  END IF;`
  ].join('\n');
  return [
    pgTriggerFunction(metadata, 'ecn__insert_guard', body),
    pgCreateTrigger(metadata, tableRef, 'ecn__insert_trg', 'AFTER INSERT', 'ecn__insert_guard')
  ];
};

/**
 * ECN 状态机（US-515 存储层，PG 侧，与 SQLite 同口径）：发布 / 改期 / 取消三种转换，
 * 级联在触发器函数里执行（级联 DML 照常触发成员表守卫，PGlite 0.5.10 探针实证；
 * RAISE 后级联随语句回滚）。「当日」= `(now() AT TIME ZONE 'UTC')::date`。
 */
const pgEcnStateMachineFunction = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomEcn)) return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = pgTableOf(BomLineOccurrence);
  const line = pgTableOf(BomLine);
  const designator = pgTableOf(BomLineDesignator);
  const split = pgTableOf(BomLineOperationSplit);
  const group = pgTableOf(BomSubstituteGroup);
  const batch = pgTableOf(BomHistoryBatch);
  const ecn = tableRef;
  const utcDateOf = (row: string): string => `(${row}."effectiveDate" AT TIME ZONE 'UTC')::date`;
  const body = [
    `  IF NEW."ecnNo" IS DISTINCT FROM OLD."ecnNo" THEN`,
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', 'ecnNo 创建后不可改（结构归属列）')}';`,
    `  END IF;`,
    `  IF OLD."state" = 'draft' AND NEW."state" = 'draft' AND OLD."effectiveDate" <> NEW."effectiveDate" THEN`,
    // 草稿改期也要同步修正已挂发生项的派生区间。
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
    `    RETURN NEW;`,
    `  END IF;`,
    `  IF OLD."state" = 'draft' AND NEW."state" = 'released' THEN`,
    `    IF ${utcDateOf('NEW')} < (now() AT TIME ZONE 'UTC')::date AND NOT EXISTS (` +
      `SELECT 1 FROM ${batch} b WHERE b."batchNo" = NEW."historyBatchNo" AND b."state" = 'open') THEN`,
    `      RAISE EXCEPTION '${PUBLISH_VALIDATION('ecn', '追溯生效被拒绝（生效日早于发布当日，AC#8）')}';`,
    `    END IF;`,
    ...pgEcnProjectionChecks(metadata, 'NEW', 'NEW."effectiveDate"', 'NEW."historyBatchNo"'),
    `    RETURN NEW;`,
    `  END IF;`,
    `  IF OLD."state" = 'released' AND NEW."state" = 'released' AND OLD."effectiveDate" <> NEW."effectiveDate" THEN`,
    `    IF ${utcDateOf('OLD')} <= (now() AT TIME ZONE 'UTC')::date THEN`,
    `      RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '已生效的 ECN 不可改期，改走更正 ECN（AC#7）')}';`,
    `    END IF;`,
    `    IF ${utcDateOf('NEW')} < (now() AT TIME ZONE 'UTC')::date AND NOT EXISTS (`,
    `      SELECT 1 FROM ${batch} b WHERE b."batchNo" = OLD."historyBatchNo" AND b."state" = 'open'`,
    `    ) THEN`,
    `      RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '改期生效日不得早于当前 UTC 日期')}';`,
    `    END IF;`,
    `    IF NEW."reason" IS DISTINCT FROM OLD."reason" OR NEW."historyBatchNo" IS DISTINCT FROM OLD."historyBatchNo" THEN`,
    `      RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '已发布 ECN 改期不得顺带改写其他列')}';`,
    `    END IF;`,
    `    DECLARE successor text;`,
    `    BEGIN`,
    `      SELECT e."ecnNo" INTO successor FROM ${occurrence} o JOIN ${ecn} e ON e."id" = o."ecnOutId"` +
      ` WHERE o."ecnInId" = OLD."id" AND o."ecnOutId" IS NOT NULL AND o."ecnOutId" <> OLD."id"` +
      ` AND e."effectiveDate" < NEW."effectiveDate" LIMIT 1;`,
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
      'OLD."historyBatchNo"'
    ),
    `    RETURN NEW;`,
    `  END IF;`,
    `  IF (OLD."state" = 'released' OR OLD."state" = 'draft') AND NEW."state" = 'cancelled' THEN`,
    `    IF OLD."state" = 'released' AND ${utcDateOf('OLD')} <= (now() AT TIME ZONE 'UTC')::date THEN`,
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
    // 历史装载豁免与发布同口径：按目标 ECN 装载时的批次号判定
    ...pgEcnProjectionChecks(metadata, 'OLD', 'OLD."effectiveDate"', 'OLD."historyBatchNo"'),
    `    RETURN NEW;`,
    `  END IF;`,
    `  IF (OLD."state" = 'released' AND NEW."state" = 'draft') OR OLD."state" = 'cancelled' THEN`,
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', 'ECN 状态转移不合法：released 不可退回 draft，cancelled 是终态')}';`,
    `  END IF;`,
    `  IF OLD."state" = 'released' AND NEW."state" = 'released' AND OLD."effectiveDate" = NEW."effectiveDate" AND (` +
      `NEW."reason" IS DISTINCT FROM OLD."reason" OR NEW."historyBatchNo" IS DISTINCT FROM OLD."historyBatchNo") THEN`,
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('ecn', '已发布 ECN 除改期与取消外不可改写')}';`,
    `  END IF;`
  ].join('\n');
  return [
    pgTriggerFunction(metadata, 'ecn__state_machine', body),
    pgCreateTrigger(metadata, tableRef, 'ecn__state_machine_trg', 'AFTER UPDATE', 'ecn__state_machine')
  ];
};

/** 定点整数（10⁹ 为 1）还原规范串（PG 侧，与 {@link sqliteFixedText} 同口径）。 */
const pgFixedText = (total: string): string =>
  `CASE WHEN length(${total}::text) > 9` +
  ` THEN left(${total}::text, length(${total}::text) - 9) || '.' || right(${total}::text, 9)` +
  ` ELSE '0.' || right('000000000' || ${total}::text, 9) END`;

/** 一个校验一个 DECLARE 块：`SELECT ... INTO msg` 命中即 `RAISE EXCEPTION '%', msg`。 */
const pgRaiseBlock = (violation: string): string =>
  `    DECLARE msg text;\n    BEGIN\n      ${violation} INTO msg;\n      IF FOUND THEN\n        RAISE EXCEPTION '%', msg;\n      END IF;\n    END;`;

const PG_SLICE: SliceDialect = {
  name: column => column,
  integer: expression => `(${expression})::bigint`,
  text: expression => `${expression}::text`,
  fixedText: total => pgFixedText(total)
};

/**
 * 替代组切片校验的 PG 组装（{@link substituteSliceQueries}，与 SQLite 同一份切片与 HAVING 体）：
 * 违约行查进变量后 RAISE。
 *
 * @param metadata - 任一 BOM 实体元数据（取命名空间）
 * @param skip - 整体跳过条件（历史装载；无则 `'FALSE'`）
 * @returns plpgsql 语句，依次校验 primary / priority / proportional
 */
const pgSubstituteSliceChecks = (
  metadata: EntityMetadata,
  members: string,
  startDate: string | null,
  subject: string,
  skip: string
): string[] => {
  const group = pgTableOf(BomSubstituteGroup);
  const { cte, checks } = substituteSliceQueries(PG_SLICE, group, members, startDate);
  return [
    `    IF NOT (${skip}) THEN`,
    ...checks.map(({ detail, suffix, violations }) =>
      pgRaiseBlock(
        `${cte} SELECT '${PUBLISH_VALIDATION(subject, detail)}' || g."code" || ':' || bad.p::text${suffix}` +
          ` FROM (${violations} LIMIT 1) bad JOIN ${group} g ON g."id" = bad.gid`
      )
    ),
    `    END IF;`
  ];
};

/**
 * 转换后运行投影校验（PG 侧，与 SQLite 同口径的检查点切片聚合）。
 *
 * @param metadata - BomEcn 的实体元数据
 * @param target - 目标 ECN 行引用（`OLD` / `NEW`）；空值检查全部已发布成员
 * @param startDate - 校验起点表达式；空值检查全时间轴
 * @param historyBatchNo - 目标 ECN 的批次号表达式（历史装载跳过；运行时恒 `NULL`）
 */
const pgEcnProjectionChecks = (
  metadata: EntityMetadata,
  target: string | null,
  startDate: string | null,
  historyBatchNo: string,
  batchNo?: string
): string[] => {
  const occurrence = pgTableOf(BomLineOccurrence);
  const line = pgTableOf(BomLine);
  const header = pgTableOf(BomHeader);
  const ecn = pgTableOf(BomEcn);
  const designator = pgTableOf(BomLineDesignator);
  const split = pgTableOf(BomLineOperationSplit);
  const batch = pgTableOf(BomHistoryBatch);
  const targetId = target === null ? 'NULL' : `${target}."id"`;
  const inScope = (owner: string): string =>
    batchNo === undefined ? '1 = 1' : historyAffectedHeader(pgTableOf, owner, batchNo);

  const historical =
    historyBatchNo !== 'NULL' ?
      `EXISTS (SELECT 1 FROM ${batch} b WHERE b."batchNo" = ${historyBatchNo} AND b."state" = 'open')`
    : 'FALSE';
  const visible = (alias: string): string =>
    `(${alias}."ecnInId" IS NULL OR ${alias}."ecnInId" = ${targetId} OR ` +
    `EXISTS (SELECT 1 FROM ${ecn} e WHERE e."id" = ${alias}."ecnInId" AND e."state" = 'released'))`;
  const trustedTo = (alias: string): string =>
    `CASE WHEN ${alias}."ecnOutId" IS NULL OR ${alias}."ecnOutId" = ${targetId} OR ` +
    `EXISTS (SELECT 1 FROM ${ecn} e WHERE e."id" = ${alias}."ecnOutId" AND e."state" = 'released') ` +
    `THEN ${alias}."effectiveTo" ELSE NULL END`;
  // 替代组成员（投影 + 采信区间 + 已发布头）
  const members =
    `SELECT m."substituteGroupId" AS gid, m."effectiveFrom" AS f, ${trustedTo('m')} AS t,` +
    ` m."substituteRole" AS role, m."substitutePriority" AS prio, m."usageProbability" AS prob` +
    ` FROM ${occurrence} m JOIN ${line} l ON l."id" = m."lineId" JOIN ${header} h ON h."id" = l."headerId"` +
    ` WHERE h."state" = 'released' AND ${inScope('h')} AND m."substituteGroupId" IS NOT NULL AND ${visible('m')} AND ${visible('l')}`;

  const checks: string[] = buildPgCoproductProjectionChecks(
    metadata,
    target,
    startDate ?? "'0001-01-01T00:00:00.000Z'",
    historyBatchNo,
    inScope('h')
  );
  const occurrenceScope = (row: string): string => (target === null ? visible(row) : `${row}."ecnInId" = ${targetId}`);

  // 位号计数（目标 ECN 引入的 managed 行）
  checks.push(
    `    IF NOT (${historical}) THEN`,
    pgRaiseBlock(
      `SELECT '${PUBLISH_VALIDATION('ecn', '位号计数违约：')}' || occ."id" || ':位号数' || ` +
        `(SELECT COUNT(*) FROM ${designator} d WHERE d."occurrenceId" = occ."id") || ':qty' || COALESCE(occ."qty", 'NULL')` +
        ` FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId" JOIN ${header} h ON h."id" = l."headerId"` +
        ` WHERE ${occurrenceScope('occ')} AND h."state" = 'released' AND ${inScope('h')} AND ${visible('l')} AND occ."designatorManaged" = true` +
        ` AND (SELECT COUNT(*) FROM ${designator} d WHERE d."occurrenceId" = occ."id") <> ` +
        `CASE WHEN occ."qty" IS NULL OR strpos(occ."qty", '.') > 0 THEN -1 ELSE occ."qty"::integer END LIMIT 1`
    ),
    `    END IF;`
  );

  // 分摊合计（目标 ECN 引入的发生项；合计还原走统一定点格式）
  const splitTotal = `SUM((substr(replace(s."ratio", '.', '') || '000000000', 1, 10))::bigint)`;
  checks.push(
    `    IF NOT (${historical}) THEN`,
    pgRaiseBlock(
      `SELECT '${PUBLISH_VALIDATION('ecn', '投料分摊合计 ≠ 1：')}' || s."occurrenceId" || ':' || ${pgFixedText(splitTotal)}` +
        ` FROM ${split} s JOIN ${occurrence} o ON o."id" = s."occurrenceId"` +
        ` JOIN ${line} l ON l."id" = o."lineId" JOIN ${header} h ON h."id" = l."headerId"` +
        ` WHERE ${occurrenceScope('o')} AND h."state" = 'released' AND ${inScope('h')} AND ${visible('l')}` +
        ` GROUP BY s."occurrenceId" HAVING ${splitTotal} <> 1000000000 LIMIT 1`
    ),
    `    END IF;`
  );

  // 替代组：检查点切片聚合（与头发布同一口径）
  checks.push(...pgSubstituteSliceChecks(metadata, members, startDate, 'ecn', historical));

  // 阶梯：投影成员两两相交
  checks.push(
    `    IF NOT (${historical}) THEN`,
    pgRaiseBlock(
      `SELECT '${PUBLISH_VALIDATION('ecn', '阶梯切片重叠：')}' || a."tierGroupNo" || ':' || a."id" || ':' || b."id" || ':日期段与批量段同时相交'` +
        ` FROM ${occurrence} a JOIN ${line} la ON la."id" = a."lineId" JOIN ${header} ha ON ha."id" = la."headerId"` +
        ` JOIN ${occurrence} b ON b."id" <> a."id" AND b."tierGroupNo" = a."tierGroupNo"` +
        ` JOIN ${line} lb ON lb."id" = b."lineId" JOIN ${header} hb ON hb."id" = lb."headerId"` +
        ` WHERE ha."id" = hb."id" AND ha."state" = 'released' AND ${inScope('ha')} AND a."tierGroupNo" IS NOT NULL` +
        ` AND ${visible('a')} AND ${visible('b')} AND ${visible('la')} AND ${visible('lb')}` +
        ` AND (${trustedTo('a')} IS NULL OR b."effectiveFrom" < ${trustedTo('a')})` +
        ` AND (${trustedTo('b')} IS NULL OR a."effectiveFrom" < ${trustedTo('b')})` +
        ` AND (a."lotsizeTo" IS NULL OR b."lotsizeFrom"::numeric < a."lotsizeTo"::numeric) AND (b."lotsizeTo" IS NULL OR a."lotsizeFrom"::numeric < b."lotsizeTo"::numeric)` +
        ` LIMIT 1`
    ),
    `    END IF;`
  );

  return checks;
};

const PG_CANONICAL_RE = `'${DECIMAL_CANONICAL_PATTERN}'`;

const pgDecimalFormatFunction = (metadata: EntityMetadata): string[] => {
  const tableRef = pgTableRef(metadata);
  const guards: string[] = [];
  for (const { field, nullable } of decimalFormatColumns(metadata)) {
    const violation =
      nullable ?
        `NEW."${field}" IS NOT NULL AND NEW."${field}" !~ ${PG_CANONICAL_RE}`
      : `NEW."${field}" !~ ${PG_CANONICAL_RE}`;
    guards.push(`  IF ${violation} THEN\n    RAISE EXCEPTION '${DECIMAL_FORMAT(field)}';\n  END IF;`);
  }
  for (const { field, message } of positiveColumns(metadata)) {
    guards.push(`  IF NEW."${field}" = '0' THEN\n    RAISE EXCEPTION '${message}';\n  END IF;`);
  }
  if (isEntity(metadata, BomHeader)) {
    guards.push(
      `  IF NEW."assemblyScrapConvention" = 'yield' AND NEW."assemblyScrap" <> '0' AND left(NEW."assemblyScrap", 2) <> '0.' THEN`
    );
    guards.push(
      `    RAISE EXCEPTION '${DECIMAL_FORMAT('assemblyScrap', '良率制损耗必须在 [0,1)（s = 1 拒绝）')}';\n  END IF;`
    );
  }
  if (isEntity(metadata, BomLineOccurrence)) {
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
    pgTriggerFunction(metadata, `${metadata.tableName}__decimal_guard`, body),
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
  if (!isEntity(metadata, BomHeader)) return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = pgTableOf(BomLineOccurrence);
  const line = pgTableOf(BomLine);
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
    pgTriggerFunction(metadata, 'bom_header__tier_publish_guard', body),
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
  if (!isEntity(metadata, BomLineDesignator)) return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = pgTableOf(BomLineOccurrence);
  const line = pgTableOf(BomLine);
  const header = pgTableOf(BomHeader);
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
    pgTriggerFunction(metadata, 'bom_line_designator__released_guard', body),
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
  if (!isEntity(metadata, BomHeader)) return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = pgTableOf(BomLineOccurrence);
  const designator = pgTableOf(BomLineDesignator);
  const line = pgTableOf(BomLine);
  const count = `(SELECT COUNT(*) FROM ${designator} d WHERE d."occurrenceId" = occ."id")`;
  const expected = `CASE WHEN occ."qty" IS NULL OR strpos(occ."qty", '.') > 0 THEN -1 ELSE occ."qty"::integer END`;
  const violation =
    `SELECT '${PUBLISH_VALIDATION('bom_header', '位号计数违约：')}' || occ."id" || ':位号数' || ${count} || ':qty' || COALESCE(occ."qty", 'NULL')` +
    ` FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId"` +
    ` WHERE l."headerId" = NEW."id" AND occ."designatorManaged" = true` +
    ` AND ${count} <> ${expected} LIMIT 1`;
  const body =
    `  IF OLD."state" = 'draft' AND NEW."state" = 'released' THEN\n` +
    `    DECLARE violation text;\n    BEGIN\n` +
    `      ${violation} INTO violation;\n` +
    `      IF FOUND THEN\n        RAISE EXCEPTION '%', violation;\n      END IF;\n` +
    `    END;\n  END IF;`;
  return [
    pgTriggerFunction(metadata, 'bom_header__designator_publish_guard', body),
    pgCreateTrigger(
      metadata,
      tableRef,
      'bom_header__designator_publish_trg',
      'BEFORE UPDATE OF "state"',
      'bom_header__designator_publish_guard'
    )
  ];
};
// 位号 / 分摊行随发生项删除：两后端都由实体声明的外键 ON DELETE CASCADE 完成（PGlite 0.5.10
// 探针实证生效；SQLite 各适配器连接即 foreign_keys = ON），不另装级联触发器
/**
 * by_product 子件不得是头父件（PG 侧，同 SQLite 口径）。
 */
const pgByProductFunction = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomHeader)) return [];
  const tableRef = pgTableRef(metadata);
  const occurrence = pgTableOf(BomLineOccurrence);
  const line = pgTableOf(BomLine);
  const header = pgTableOf(BomHeader);
  const revision = pgTableOf(BomItemRevision);
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
    pgTriggerFunction(metadata, 'bom_header__by_product_guard', body),
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
  if (isEntity(metadata, BomLineOccurrence)) {
    const tableRef = pgTableRef(metadata);
    const group = pgTableOf(BomSubstituteGroup);
    const line = pgTableOf(BomLine);
    const probabilityMessage = DECIMAL_FORMAT('usageProbability', '替代概率限 [0,1]、小数至多 9 位');
    const body =
      `  IF NEW."usageProbability" IS NOT NULL AND NOT (` +
      `NEW."usageProbability" = '0' OR NEW."usageProbability" = '1' OR ` +
      `(left(NEW."usageProbability", 2) = '0.' AND length(NEW."usageProbability") <= 11)) THEN\n` +
      `    RAISE EXCEPTION '${probabilityMessage}';\n  END IF;\n` +
      `  IF EXISTS (SELECT 1 FROM ${group} g JOIN ${line} l ON l."id" = NEW."lineId" WHERE g."id" = NEW."substituteGroupId" AND g."headerId" <> l."headerId") THEN\n` +
      `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_line_occurrence', '替代组成员必须与组同属一张头')}';\n  END IF;`;
    statements.push(
      pgTriggerFunction(metadata, 'bom_line_occurrence__substitute_guard', body),
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_line_occurrence__substitute_trg',
        'BEFORE INSERT OR UPDATE',
        'bom_line_occurrence__substitute_guard'
      )
    );
  }
  if (isEntity(metadata, BomSubstituteGroup)) {
    const tableRef = pgTableRef(metadata);
    const header = pgTableOf(BomHeader);
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
      pgTriggerFunction(metadata, 'bom_substitute_group__released_guard', body),
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
 * 替代组发布转移聚合校验（PG 侧，与 SQLite 同口径）：零成员或从无 primary 的组拒绝，
 * 其余按原子切片校验（{@link pgSubstituteSliceChecks}，与 ECN 投影同一口径）。
 */
const pgSubstitutePublishFunction = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomHeader)) return [];
  const tableRef = pgTableRef(metadata);
  const group = pgTableOf(BomSubstituteGroup);
  const member = pgTableOf(BomLineOccurrence);
  const hasMember = (condition: string): string =>
    `EXISTS (SELECT 1 FROM ${member} m WHERE m."substituteGroupId" = g."id"${condition})`;
  const members =
    `SELECT m."substituteGroupId" AS gid, m."effectiveFrom" AS f, m."effectiveTo" AS t,` +
    ` m."substituteRole" AS role, m."substitutePriority" AS prio, m."usageProbability" AS prob` +
    ` FROM ${member} m JOIN ${group} g ON g."id" = m."substituteGroupId" WHERE g."headerId" = NEW."id"`;
  const body = [
    `  IF OLD."state" = 'draft' AND NEW."state" = 'released' THEN`,
    `    IF EXISTS (SELECT 1 FROM ${group} g WHERE g."headerId" = NEW."id" AND ` +
      `(NOT ${hasMember('')} OR NOT ${hasMember(` AND m."substituteRole" = 'primary'`)})) THEN`,
    `      RAISE EXCEPTION '${PUBLISH_VALIDATION('bom_header', '替代组零成员或缺 primary')}';`,
    `    END IF;`,
    ...pgSubstituteSliceChecks(metadata, members, null, 'bom_header', 'FALSE'),
    `  END IF;`
  ].join('\n');
  return [
    pgTriggerFunction(metadata, 'bom_header__substitute_publish_guard', body),
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
  if (isEntity(metadata, BomLineOperationSplit)) {
    const tableRef = pgTableRef(metadata);
    const message = DECIMAL_FORMAT('ratio', '分摊比例限 [0,1]、小数至多 9 位');
    const occurrence = pgTableOf(BomLineOccurrence);
    const body =
      `  IF NOT (NEW."ratio" = '0' OR NEW."ratio" = '1' OR (left(NEW."ratio", 2) = '0.' AND length(NEW."ratio") <= 11)) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n  END IF;\n` +
      // US-520 AC#6：行既有 operation_seq 又有分摊行——两种表达互斥
      `  IF EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = NEW."occurrenceId" AND occ."operationSeq" IS NOT NULL) THEN\n` +
      `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_line_operation_split', '行既有 operation_seq 又有分摊行（两种表达互斥）')}';\n  END IF;`;
    statements.push(
      pgTriggerFunction(metadata, 'bom_line_operation_split__ratio_guard', body),
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_line_operation_split__ratio_trg',
        'BEFORE INSERT OR UPDATE',
        'bom_line_operation_split__ratio_guard'
      )
    );
    // US-515 矩阵：已发布头的分摊行仅放行所属发生项挂 draft（DELETE 另含 cancelled）ECN 的增删
    const line = pgTableOf(BomLine);
    const header = pgTableOf(BomHeader);
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
      `  IF TG_OP = 'INSERT' AND ${releasedUnroutedHeader(pgTableOf, 'split')} THEN\n` +
      `    RAISE EXCEPTION '${UNROUTED_SPLIT}';\n` +
      `  END IF;\n` +
      `  IF TG_OP = 'UPDATE' AND ${releasedJoin} THEN\n` +
      `    RAISE EXCEPTION '${protocolMessage}';\n` +
      `  END IF;\n` +
      `  IF TG_OP = 'DELETE' AND ${releasedJoin} AND NOT (` +
      `EXISTS (SELECT 1 FROM ${occurrence} occ WHERE occ."id" = OLD."occurrenceId" AND (${pgEcnAttachable('occ."ecnInId"')} OR ${pgEcnStateIs('occ."ecnInId"', "'cancelled'")}))) THEN\n` +
      `    RAISE EXCEPTION '${protocolMessage}';\n` +
      `  END IF;`;
    statements.push(
      pgTriggerFunction(metadata, 'bom_line_operation_split__released_guard', protocolBody),
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
  if (isEntity(metadata, BomLineOccurrence)) {
    const tableRef = pgTableRef(metadata);
    const line = pgTableOf(BomLine);
    const header = pgTableOf(BomHeader);
    const operation = pgTableOf(BomRoutingOperation);
    const split = pgTableOf(BomLineOperationSplit);
    const message = WRITE_PROTOCOL('bom_line_occurrence', '投料工序不属于头选定的路线');
    // 未挂路线的已发布头：INSERT 带工序即拒，UPDATE 只在改挂工序时拒（与 SQLite 同口径）；
    // AC#6 互斥的发生项一侧：已有分摊行时不得再挂 operation_seq（与 SQLite 同口径）
    const attachesSeq = `NEW."operationSeq" IS NOT NULL AND (CASE WHEN TG_OP = 'INSERT' THEN TRUE ELSE NEW."operationSeq" IS DISTINCT FROM OLD."operationSeq" END)`;
    const body =
      `  IF NEW."operationSeq" IS NOT NULL AND EXISTS (` +
      `SELECT 1 FROM ${line} l JOIN ${header} h ON h."id" = l."headerId"` +
      ` WHERE l."id" = NEW."lineId" AND h."routingId" IS NOT NULL` +
      ` AND NOT EXISTS (SELECT 1 FROM ${operation} op WHERE op."routingId" = h."routingId" AND op."operationSeq" = NEW."operationSeq")) THEN\n` +
      `    RAISE EXCEPTION '${message}';\n  END IF;\n` +
      `  IF ${attachesSeq} AND ${releasedUnroutedHeader(pgTableOf, 'occurrence')} THEN\n` +
      `    RAISE EXCEPTION '${UNROUTED_OCCURRENCE}';\n  END IF;\n` +
      `  IF NEW."operationSeq" IS NOT NULL AND EXISTS (SELECT 1 FROM ${split} s WHERE s."occurrenceId" = NEW."id") THEN\n` +
      `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_line_occurrence', '行既有 operation_seq 又有分摊行（两种表达互斥）')}';\n  END IF;`;
    statements.push(
      pgTriggerFunction(metadata, 'bom_line_occurrence__operation_seq_guard', body),
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_line_occurrence__operation_seq_trg',
        'BEFORE INSERT OR UPDATE',
        'bom_line_occurrence__operation_seq_guard'
      )
    );
  }
  if (isEntity(metadata, BomRoutingOperation)) {
    const tableRef = pgTableRef(metadata);
    const message = DECIMAL_FORMAT('operationScrap', '良率制损耗必须在 [0,1)（s = 1 拒绝）');
    const body =
      `  IF NEW."scrapConvention" = 'yield' AND NEW."operationScrap" <> '0' AND left(NEW."operationScrap", 2) <> '0.' THEN\n` +
      `    RAISE EXCEPTION '${message}';\n  END IF;`;
    // 已发布头引用的工序键不可改号、移出路线或删除（与 SQLite 同口径）
    const keyChanged = `(CASE WHEN TG_OP = 'DELETE' THEN TRUE ELSE NEW."routingId" IS DISTINCT FROM OLD."routingId" OR NEW."operationSeq" IS DISTINCT FROM OLD."operationSeq" END)`;
    const referencedBody =
      `  IF ${keyChanged} AND (${releasedOperationReferenced(pgTableOf)}) THEN\n` +
      `    RAISE EXCEPTION '${OPERATION_REFERENCED}';\n  END IF;`;
    statements.push(
      pgTriggerFunction(metadata, 'bom_routing_operation__scrap_guard', body),
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_routing_operation__scrap_trg',
        'BEFORE INSERT OR UPDATE',
        'bom_routing_operation__scrap_guard'
      ),
      pgTriggerFunction(metadata, 'bom_routing_operation__referenced_guard', referencedBody),
      pgCreateTrigger(
        metadata,
        tableRef,
        'bom_routing_operation__referenced_trg',
        'BEFORE UPDATE OR DELETE',
        'bom_routing_operation__referenced_guard'
      )
    );
  }
  if (isEntity(metadata, BomHeader)) {
    const tableRef = pgTableRef(metadata);
    const occurrence = pgTableOf(BomLineOccurrence);
    const split = pgTableOf(BomLineOperationSplit);
    const line = pgTableOf(BomLine);
    const routing = headerRoutingViolations(pgTableOf);
    const seqMessage = PUBLISH_VALIDATION('bom_header', '投料工序 / 分摊行不在路由工序序集内（挂了必须可解析）');
    // 违约消息点名发生项并按统一定点格式还原合计（与 SQLite 同口径）
    const splitTotal = `SUM((substr(replace(s."ratio", '.', '') || '000000000', 1, 10))::bigint)`;
    const totalExpr =
      `(SELECT s."occurrenceId" || ':' || ${pgFixedText(splitTotal)}` +
      ` FROM ${split} s JOIN ${occurrence} occ ON occ."id" = s."occurrenceId" JOIN ${line} l ON l."id" = occ."lineId"` +
      ` WHERE l."headerId" = NEW."id"` +
      ` GROUP BY s."occurrenceId"` +
      ` HAVING ${splitTotal} <> 1000000000` +
      ` LIMIT 1)`;
    // 校验序：序集覆盖 → 分摊合计 → 未挂路线（SQLite 侧合计触发器先于序集触发器执行，
    // 未挂路线排在合计之后两后端报同一条）
    const body =
      `  IF OLD."state" = 'draft' AND NEW."state" = 'released' THEN\n` +
      `    DECLARE violation text;\n    BEGIN\n` +
      `      SELECT '${seqMessage}' INTO violation WHERE ${routing.seqUncovered};\n` +
      `      IF violation IS NULL THEN\n` +
      `        SELECT '${seqMessage}' INTO violation WHERE ${routing.splitUncovered};\n` +
      `      END IF;\n` +
      `      IF violation IS NULL THEN\n` +
      `        SELECT '${PUBLISH_VALIDATION('bom_header', '投料分摊合计 ≠ 1：')}' || ${totalExpr} INTO violation;\n` +
      `      END IF;\n` +
      `      IF violation IS NULL THEN\n` +
      `        SELECT '${UNROUTED_PUBLISH}' INTO violation WHERE ${routing.unrouted};\n` +
      `      END IF;\n` +
      `      IF violation IS NOT NULL THEN\n        RAISE EXCEPTION '%', violation;\n      END IF;\n` +
      `    END;\n  END IF;`;
    statements.push(
      pgTriggerFunction(metadata, 'bom_header__routing_guard', body),
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
  if (!isEntity(metadata, BomMap)) return [];
  const body =
    `  IF (NEW."relation" = 'added' AND (NEW."sourceLineId" IS NOT NULL OR NEW."targetLineId" IS NULL)) OR ` +
    `(NEW."relation" = 'removed' AND (NEW."targetLineId" IS NOT NULL OR NEW."sourceLineId" IS NULL)) OR ` +
    `(NEW."relation" NOT IN ('added', 'removed') AND (NEW."sourceLineId" IS NULL OR NEW."targetLineId" IS NULL)) THEN\n` +
    `    RAISE EXCEPTION '${WRITE_PROTOCOL('bom_map', 'NULL 规则违约：added 只 source 空、removed 只 target 空、其余四态两侧必填、不允许双 NULL')}';\n  END IF;`;
  return [
    pgTriggerFunction(metadata, 'bom_map__null_rule_guard', body),
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

export const buildPgBomTriggerDdl = (
  metadata: EntityMetadata,
  options: BomTriggerDdlOptions = { historyProjection: true }
): string[] => [
  ...buildPgCoproductDdl(metadata),
  ...buildPgInstanceNodeDdl(metadata),
  ...buildPgInstanceSourceDdl(metadata),
  ...buildUnitLotOverlapGuardPg(metadata),
  ...buildPgStructuralDdl(metadata),
  ...pgPublishedRevisionFunction(metadata),
  ...pgPublishTransitionFunction(metadata),
  ...pgHistoryBatchFunction(metadata, options.historyProjection),
  ...pgEcnInsertFunction(metadata),
  ...pgEcnStateMachineFunction(metadata),
  ...pgEcnOccurrenceFunction(metadata),
  ...pgReleasedHeaderMembersFunction(metadata),
  ...pgReleasedHeaderFunction(metadata),
  ...pgHeaderEcnOwnershipFunction(metadata),
  ...pgMapNullRuleFunction(metadata),
  ...pgDecimalFormatFunction(metadata),
  ...pgTierPublishFunction(metadata),
  ...pgDesignatorCountFunction(metadata),
  ...pgDesignatorReleasedFunction(metadata),
  ...pgByProductFunction(metadata),
  ...pgSubstituteGuards(metadata),
  ...pgSubstitutePublishFunction(metadata),
  ...pgRoutingGuards(metadata)
];
