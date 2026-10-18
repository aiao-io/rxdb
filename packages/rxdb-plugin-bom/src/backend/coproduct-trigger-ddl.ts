import { EntityMetadata, quoteSqlIdentifier } from '@aiao/rxdb';

type Backend = 'sqlite' | 'pg';
type Guard = readonly [field: string, violation: string];

interface Projection {
  headerId?: string;
  targetEcnId?: string;
  startDate?: string;
  historical?: string;
}

const table = (metadata: EntityMetadata, backend: Backend, name: string): string =>
  backend === 'sqlite' ?
    quoteSqlIdentifier(`${metadata.namespace}$${name}`)
  : `${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(name)}`;

const publishError = (detail: string): string => `rxdb:bom_publish_validation:联产:${detail}`;
const fieldError = (field: string): string =>
  field === 'jointCostShare' ?
    `rxdb:bom_decimal_format:${field}:produce 联产输出字段违约`
  : `rxdb:bom_write_protocol:${field}:produce 联产输出字段违约`;

const shareValid = (backend: Backend): string =>
  backend === 'sqlite' ?
    `(NEW."jointCostShare" IN ('0', '1') OR (` +
    `substr(NEW."jointCostShare", 1, 2) = '0.' AND length(NEW."jointCostShare") BETWEEN 3 AND 11 AND ` +
    `substr(NEW."jointCostShare", 3) NOT GLOB '*[^0-9]*' AND substr(NEW."jointCostShare", -1) BETWEEN '1' AND '9'))`
  : `NEW."jointCostShare" ~ '^(0|1|0\\.[0-9]{0,8}[1-9])$'`;

const sqliteTrigger = (tableRef: string, name: string, event: string, body: string, when?: string): string[] => [
  `DROP TRIGGER IF EXISTS ${quoteSqlIdentifier(name)};`,
  `CREATE TRIGGER ${quoteSqlIdentifier(name)} ${event} ON ${tableRef}` +
    `${when ? ` WHEN ${when}` : ''} BEGIN\n${body}\nEND;`
];

const pgTrigger = (metadata: EntityMetadata, name: string, event: string, body: string): string[] => [
  `CREATE OR REPLACE FUNCTION ${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(name)}() RETURNS trigger AS $$\nBEGIN\n${body}\nRETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;`,
  `DO $$ BEGIN DROP TRIGGER IF EXISTS ${quoteSqlIdentifier(name)} ON ${table(metadata, 'pg', metadata.tableName)}; ` +
    `CREATE TRIGGER ${quoteSqlIdentifier(name)} ${event} ON ${table(metadata, 'pg', metadata.tableName)} ` +
    `FOR EACH ROW EXECUTE FUNCTION ${metadata.namespace}.${name}(); END $$;`
];

const unitRoot = (value: string): string =>
  `CASE WHEN ${value} IN ('mg', 'g', 'kg', 't') THEN 'mass' ` +
  `WHEN ${value} IN ('mm', 'cm', 'm', 'km') THEN 'length' ` +
  `WHEN ${value} IN ('ml', 'l') THEN 'volume' ` +
  `WHEN ${value} IN ('s', 'min', 'h') THEN 'time' ELSE ${value} END`;

const occurrenceGuards = (metadata: EntityMetadata, backend: Backend): Guard[] => {
  const revision = table(metadata, backend, 'item_revision');
  const line = table(metadata, backend, 'bom_line');
  const header = table(metadata, backend, 'bom_header');
  const item = table(metadata, backend, 'item');
  const guards: Guard[] = [
    ['qty', `NEW."qty" IS NULL OR NEW."qty" = '0'`],
    [
      'childRevisionId',
      `NOT EXISTS (SELECT 1 FROM ${revision} r WHERE r."id" = NEW."childRevisionId" AND ` +
        `r."itemId" = NEW."childItemId" AND r."state" = 'released' AND r."effectiveFrom" IS NOT NULL AND r."defaultPhantom" = false)`
    ],
    [
      'childItemId',
      `EXISTS (SELECT 1 FROM ${line} l JOIN ${header} h ON h."id" = l."headerId" ` +
        `JOIN ${revision} r ON r."id" = h."parentRevisionId" WHERE l."id" = NEW."lineId" AND r."itemId" = NEW."childItemId")`
    ],
    [
      'uom',
      `EXISTS (SELECT 1 FROM ${item} i WHERE i."id" = NEW."childItemId" AND NEW."uom" <> i."stockUom" AND (` +
        `(${unitRoot('NEW."uom"')} = 'time') <> (${unitRoot('i."stockUom"')} = 'time') OR (` +
        `${unitRoot('NEW."uom"')} <> ${unitRoot('i."stockUom"')} AND COALESCE(NEW."uomConversion", i."uomConversion") IS NULL)))`
    ],
    ['uomConversion', `NEW."uomConversion" = '0'`],
    ['isFixedQty', 'NEW."isFixedQty" = true'],
    ['componentScrap', 'NEW."componentScrap" <> \'0\''],
    ['componentScrapConvention', 'NEW."componentScrapConvention" <> \'additive\''],
    ['componentScrapFixed', 'NEW."componentScrapFixed" <> \'0\''],
    ['designatorManaged', 'NEW."designatorManaged" = true']
  ];
  const nullable = [
    'qtyFormula',
    'formulaGrammarVersion',
    'tierGroupNo',
    'lotsizeFrom',
    'lotsizeTo',
    'phantomOverride',
    'substituteGroupId',
    'substituteRole',
    'substitutePriority',
    'usageProbability',
    'equivQty',
    'operationSeq',
    'unitFrom',
    'unitTo',
    'lotCodes',
    'selectionConditionId'
  ];
  guards.push(...nullable.map(field => [field, `NEW."${field}" IS NOT NULL`] as const));
  for (const [name, field] of [
    ['bom_line_designator', 'designators'],
    ['bom_line_operation_split', 'operationSplits']
  ] as const) {
    guards.push([
      field,
      `EXISTS (SELECT 1 FROM ${table(metadata, backend, name)} s WHERE s."occurrenceId" = NEW."id")`
    ]);
  }
  return [
    ['jointCostShare', `NEW."flowDirection" <> 'produce' AND NEW."jointCostShare" IS NOT NULL`],
    ['jointCostShare', `NEW."flowDirection" = 'produce' AND NEW."jointCostShare" IS NULL`],
    ...guards.map(([field, violation]) => [field, `NEW."flowDirection" = 'produce' AND (${violation})`] as const)
  ];
};

const rowGuards = (metadata: EntityMetadata, backend: Backend): Guard[] => {
  if (metadata.name === 'BomHeader' || metadata.name === 'BomLineOccurrence') {
    const guards: Guard[] = [['jointCostShare', `NEW."jointCostShare" IS NOT NULL AND NOT (${shareValid(backend)})`]];
    return metadata.name === 'BomLineOccurrence' ? [...guards, ...occurrenceGuards(metadata, backend)] : guards;
  }
  if (!['BomLineDesignator', 'BomLineOperationSplit'].includes(metadata.name)) return [];
  return [
    [
      metadata.name === 'BomLineDesignator' ? 'designators' : 'operationSplits',
      `EXISTS (SELECT 1 FROM ${table(metadata, backend, 'bom_line_occurrence')} o ` +
        `WHERE o."id" = NEW."occurrenceId" AND o."flowDirection" = 'produce')`
    ]
  ];
};

const fixedShare = (backend: Backend, expression: string): string => {
  const digits = `substr(${expression} || '000000000', 3, 9)`;
  return (
    `CASE WHEN ${expression} = '1' THEN 1000000000 ELSE ` +
    `${backend === 'sqlite' ? `CAST(${digits} AS INTEGER)` : `(${digits})::bigint`} END`
  );
};

const projectionQuery = (metadata: EntityMetadata, backend: Backend, options: Projection): string => {
  const header = table(metadata, backend, 'bom_header');
  const revision = table(metadata, backend, 'item_revision');
  const line = table(metadata, backend, 'bom_line');
  const occurrence = table(metadata, backend, 'bom_line_occurrence');
  const ecn = table(metadata, backend, 'ecn');
  const target = options.targetEcnId;
  const visible = (alias: string): string =>
    `(${alias}."ecnInId" IS NULL OR ` +
    `${target ? `${alias}."ecnInId" = ${target} OR ` : ''}` +
    `EXISTS (SELECT 1 FROM ${ecn} e WHERE e."id" = ${alias}."ecnInId" AND e."state" = 'released'))`;
  const trustedTo =
    `CASE WHEN o."ecnOutId" IS NULL OR ` +
    `${target ? `o."ecnOutId" = ${target} OR ` : ''}` +
    `EXISTS (SELECT 1 FROM ${ecn} e WHERE e."id" = o."ecnOutId" AND e."state" = 'released') THEN o."effectiveTo" ELSE NULL END`;
  const start =
    options.startDate ?
      `CASE WHEN r."effectiveFrom" > ${options.startDate} ` + `THEN r."effectiveFrom" ELSE ${options.startDate} END`
    : 'r."effectiveFrom"';
  const scope = options.headerId ? `h."id" = ${options.headerId}` : `h."state" = 'released'`;
  const message =
    `'${publishError('')}' || bad.hid || ':' || bad.p || ':' || ` +
    `CASE WHEN bad.main_share IS NULL THEN '缺主产物 jointCostShare' ` +
    `WHEN bad.output_count = 0 THEN '无有效 produce 联产输出' ` +
    `WHEN bad.output_count <> bad.revision_count THEN '输出修订重复' ELSE 'jointCostShare 份额合计必须精确等于 1' END`;
  return (
    `WITH heads AS (` +
    `SELECT h."id" AS hid, h."jointCostShare" AS main_share, ${start} AS start_at ` +
    `FROM ${header} h JOIN ${revision} r ON r."id" = h."parentRevisionId" WHERE ${scope} AND (` +
    `h."jointCostShare" IS NOT NULL OR EXISTS (SELECT 1 FROM ${line} l JOIN ${occurrence} o ON o."lineId" = l."id" ` +
    `WHERE l."headerId" = h."id" AND o."flowDirection" = 'produce' AND ${visible('l')} AND ${visible('o')}))` +
    `), members AS (` +
    `SELECT h.hid, o."id" AS mid, o."childRevisionId" AS revision_id, o."jointCostShare" AS share, ` +
    `o."effectiveFrom" AS f, ${trustedTo} AS t FROM heads h JOIN ${line} l ON l."headerId" = h.hid ` +
    `JOIN ${occurrence} o ON o."lineId" = l."id" WHERE o."flowDirection" = 'produce' AND ${visible('l')} AND ${visible('o')}` +
    `), points AS (` +
    `SELECT hid, start_at AS p FROM heads UNION SELECT m.hid, m.f FROM members m JOIN heads h ON h.hid = m.hid WHERE m.f > h.start_at ` +
    `UNION SELECT m.hid, m.t FROM members m JOIN heads h ON h.hid = m.hid WHERE m.t > h.start_at` +
    `), active AS (` +
    `SELECT h.hid, p.p, h.main_share, m.mid, m.revision_id, m.share FROM heads h JOIN points p ON p.hid = h.hid ` +
    `LEFT JOIN members m ON m.hid = h.hid AND m.f <= p.p AND (m.t IS NULL OR m.t > p.p)` +
    `) SELECT ${message} AS message FROM (` +
    `SELECT a.hid, a.p, a.main_share, COUNT(a.mid) AS output_count, COUNT(DISTINCT a.revision_id) AS revision_count ` +
    `FROM active a GROUP BY a.hid, a.p, a.main_share HAVING a.main_share IS NULL OR COUNT(a.mid) = 0 ` +
    `OR COUNT(a.mid) <> COUNT(DISTINCT a.revision_id) OR COALESCE(SUM(${fixedShare(backend, 'a.share')}), 0) + ` +
    `${fixedShare(backend, 'a.main_share')} <> 1000000000) bad ` +
    `WHERE NOT (${options.historical ?? (backend === 'sqlite' ? '0' : 'FALSE')}) LIMIT 1`
  );
};

const sqliteProjectionCheck = (query: string): string =>
  `SELECT RAISE(ABORT, violation.message) FROM (${query}) violation;`;

const pgProjectionCheck = (query: string): string =>
  `DECLARE violation text; BEGIN\n${query} INTO violation;\n` +
  `IF violation IS NOT NULL THEN RAISE EXCEPTION '%', violation; END IF;\nEND;`;

/** ECN 级联完成后校验运行投影，未发布候选不能补齐联产份额。 */
export const buildSqliteCoproductProjectionChecks = (
  metadata: EntityMetadata,
  targetEcnId: string,
  startDate: string,
  historyBatchNo: string
): string[] => {
  const historical =
    historyBatchNo === 'NULL' ? '0' : (
      `EXISTS (SELECT 1 FROM ${table(metadata, 'sqlite', 'bom_history_batch')} b WHERE b."batchNo" = ${historyBatchNo} AND b."state" = 'open')`
    );
  return [sqliteProjectionCheck(projectionQuery(metadata, 'sqlite', { targetEcnId, startDate, historical }))];
};

/** ECN 级联完成后以十亿分之一整数校验联合输出。 */
export const buildPgCoproductProjectionChecks = (
  metadata: EntityMetadata,
  target: string,
  startDate: string,
  historyBatchNo: string
): string[] => {
  const historical =
    historyBatchNo === 'NULL' ? 'FALSE' : (
      `EXISTS (SELECT 1 FROM ${table(metadata, 'pg', 'bom_history_batch')} b WHERE b."batchNo" = ${historyBatchNo} AND b."state" = 'open')`
    );
  return [pgProjectionCheck(projectionQuery(metadata, 'pg', { targetEcnId: `${target}."id"`, startDate, historical }))];
};

/** 联产保存期约束及头发布聚合；旧单产头保持可空份额合同。 */
export const buildSqliteCoproductDdl = (metadata: EntityMetadata): string[] => {
  const guards = rowGuards(metadata, 'sqlite');
  if (guards.length === 0) return [];
  const tableRef = table(metadata, 'sqlite', metadata.tableName);
  const body = guards
    .map(([field, violation]) => `SELECT RAISE(ABORT, '${fieldError(field)}') WHERE ${violation};`)
    .join('\n');
  const statements = ['INSERT', 'UPDATE'].flatMap(event =>
    sqliteTrigger(tableRef, `${metadata.tableName}_coproduct_${event.toLowerCase()}`, `BEFORE ${event}`, body)
  );
  if (metadata.name !== 'BomHeader') return statements;
  const check = sqliteProjectionCheck(projectionQuery(metadata, 'sqlite', { headerId: 'NEW."id"' }));
  statements.push(
    ...sqliteTrigger(
      tableRef,
      'bom_header_coproduct_publish',
      'AFTER UPDATE',
      check,
      `OLD."state" = 'draft' AND NEW."state" = 'released'`
    ),
    ...sqliteTrigger(
      tableRef,
      'bom_header_coproduct_released_insert',
      'AFTER INSERT',
      check,
      `NEW."state" = 'released'`
    ),
    ...sqliteTrigger(
      tableRef,
      'bom_header_coproduct_immutable',
      'BEFORE UPDATE',
      `SELECT RAISE(ABORT, 'rxdb:bom_write_protocol:bom_header:已发布头 jointCostShare 不可改');`,
      `OLD."state" = 'released' AND NEW."jointCostShare" IS NOT OLD."jointCostShare"`
    )
  );
  return statements;
};

/** 联产 PostgreSQL 触发器与 SQLite 使用相同的保存和切片合同。 */
export const buildPgCoproductDdl = (metadata: EntityMetadata): string[] => {
  const guards = rowGuards(metadata, 'pg');
  if (guards.length === 0) return [];
  const body = guards
    .map(([field, violation]) => `IF ${violation} THEN RAISE EXCEPTION '${fieldError(field)}'; END IF;`)
    .join('\n');
  const statements = pgTrigger(metadata, `${metadata.tableName}__coproduct_guard`, 'BEFORE INSERT OR UPDATE', body);
  if (metadata.name !== 'BomHeader') return statements;
  const check = pgProjectionCheck(projectionQuery(metadata, 'pg', { headerId: 'NEW."id"' }));
  statements.push(
    ...pgTrigger(
      metadata,
      'bom_header__coproduct_publish',
      'AFTER INSERT OR UPDATE',
      `IF TG_OP = 'INSERT' THEN IF NEW."state" = 'released' THEN ${check} END IF; ` +
        `ELSIF OLD."state" = 'draft' AND NEW."state" = 'released' THEN ${check} END IF;`
    )
  );
  statements.push(
    ...pgTrigger(
      metadata,
      'bom_header__coproduct_immutable',
      'BEFORE UPDATE',
      `IF OLD."state" = 'released' AND NEW."jointCostShare" IS DISTINCT FROM OLD."jointCostShare" THEN ` +
        `RAISE EXCEPTION 'rxdb:bom_write_protocol:bom_header:已发布头 jointCostShare 不可改'; END IF;`
    )
  );
  return statements;
};
