/**
 * @fileoverview ERP/MRP 同快照导出与整批草稿导入。
 */

import { getEntityMetadata, type EntityType, type TransactionExecutor } from '@aiao/rxdb';
import {
  BomHeader,
  BomItem,
  BomItemRevision,
  BomLine,
  BomLineDesignator,
  BomLineOccurrence,
  BomLineOperationSplit,
  BomSubstituteGroup
} from '../entities.js';
import { explodeBom, type ExplosionOptions } from '../quantity/explosion.js';
import { validateBomWrite } from '../repository.js';
import { BomCycleError, normalizeBomError } from '../types.js';
import type { BomLocalAdapter } from './bom-adapter.js';
import { bomSqlDialectFor } from './bom-sql.js';
import {
  BomExportRejectedError,
  EXPORT_TABLE_COLUMNS,
  isDecimalString,
  serializeExportRows,
  validateExportReady,
  type BomExportPayload,
  type ExportRowBatch,
  type ExportTable
} from './export-contract.js';
import {
  BomImportContractError,
  DECIMAL_FIELDS,
  IMPORT_KINDS,
  naturalKeyFor,
  parseImportPayload,
  validateImportRecords,
  type ExistingBomKeySets,
  type ImportDiagnostic,
  type ImportKind,
  type ImportRecord
} from './import-contract.js';
import type { ResolutionContext } from './resolution.js';
import { resolveBom, type ResolveTarget } from './resolver.js';

/** 整批导入结果：失败已回滚，成功头保持草稿，发布由调用方显式执行。 */
export interface BomImportResult {
  committed: boolean;
  diagnostics: ImportDiagnostic[];
  headerIds: string[];
}

type Row = Record<string, unknown>;
type Snapshot = Record<ImportKind, Row[]>;

const ENTITY_OF: Record<ImportKind, EntityType> = {
  item: BomItem,
  revision: BomItemRevision,
  header: BomHeader,
  line: BomLine,
  substitute_group: BomSubstituteGroup,
  occurrence: BomLineOccurrence,
  designator: BomLineDesignator,
  operation_split: BomLineOperationSplit
};

const BOOLEAN_FIELDS = new Set([
  'serialized',
  'defaultPhantom',
  'isFixedQty',
  'designatorManaged',
  'supplyToVendor',
  'allowMix',
  'phantomOverride'
]);
const DATE_FIELDS = new Set(['effectiveFrom', 'effectiveTo']);
const textOrder = (left: string, right: string): number =>
  left < right ? -1
  : left > right ? 1
  : 0;
const asText = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));
const byId = (rows: Row[]): Map<string, Row> => new Map(rows.map(row => [String(row['id']), row]));
const requiredRow = (rows: Map<string, Row>, id: unknown, subject: string): Row => {
  const row = rows.get(String(id));
  if (row === undefined) throw new BomImportContractError(subject, `依赖缺失：${String(id)}`);
  return row;
};

const readTable = async (executor: TransactionExecutor, kind: ImportKind): Promise<Row[]> => {
  const result = await executor.query(`SELECT * FROM ${executor.tableRef(ENTITY_OF[kind])}`);
  return result.rows.map(row => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])));
};

const flattenSnapshot = (stored: Snapshot): Snapshot => {
  const itemMap = byId(stored.item);
  const revisionMap = byId(stored.revision);
  const headerMap = byId(stored.header);
  const lineMap = byId(stored.line);
  const occurrenceMap = byId(stored.occurrence);
  const groupMap = byId(stored.substitute_group);
  const revisionIdentity = (revision: Row): Row => ({
    itemNo: requiredRow(itemMap, revision['itemId'], 'revision.itemId')['itemNo'],
    revisionNo: revision['revisionNo']
  });
  const headerIdentity = (header: Row): Row => ({
    ...revisionIdentity(requiredRow(revisionMap, header['parentRevisionId'], 'header.parentRevisionId')),
    bomType: header['bomType'],
    orgId: header['orgId'],
    alternativeNo: header['alternativeNo']
  });
  const lineIdentity = (line: Row): Row => ({
    ...headerIdentity(requiredRow(headerMap, line['headerId'], 'line.headerId')),
    lineNo: line['lineNo']
  });
  const occurrenceIdentity = (occurrence: Row): Row => ({
    ...lineIdentity(requiredRow(lineMap, occurrence['lineId'], 'occurrence.lineId')),
    effectiveFrom: occurrence['effectiveFrom'],
    childItemNo: requiredRow(itemMap, occurrence['childItemId'], 'occurrence.childItemId')['itemNo'],
    unitFrom: occurrence['unitFrom'],
    lotCodes: occurrence['lotCodes']
  });
  return {
    item: stored.item,
    revision: stored.revision.map(row => ({ ...row, ...revisionIdentity(row) })),
    header: stored.header.map(row => ({ ...row, ...headerIdentity(row) })),
    line: stored.line.map(row => ({ ...row, ...lineIdentity(row) })),
    substitute_group: stored.substitute_group.map(row => ({
      ...row,
      ...headerIdentity(requiredRow(headerMap, row['headerId'], 'group.headerId')),
      groupCode: row['code']
    })),
    occurrence: stored.occurrence.map(row => ({
      ...row,
      ...occurrenceIdentity(row),
      childRevisionNo:
        row['childRevisionId'] == null ?
          null
        : requiredRow(revisionMap, row['childRevisionId'], 'occurrence.childRevisionId')['revisionNo'],
      substituteGroupCode:
        row['substituteGroupId'] == null ?
          null
        : requiredRow(groupMap, row['substituteGroupId'], 'occurrence.substituteGroupId')['code']
    })),
    designator: stored.designator.map(row => ({
      ...row,
      ...occurrenceIdentity(requiredRow(occurrenceMap, row['occurrenceId'], 'designator.occurrenceId'))
    })),
    operation_split: stored.operation_split.map(row => ({
      ...row,
      ...occurrenceIdentity(requiredRow(occurrenceMap, row['occurrenceId'], 'split.occurrenceId'))
    }))
  };
};

const readSnapshot = async (executor: TransactionExecutor): Promise<Snapshot> => {
  const snapshot: Snapshot = {
    item: [],
    revision: [],
    header: [],
    line: [],
    substitute_group: [],
    occurrence: [],
    designator: [],
    operation_split: []
  };
  for (const kind of IMPORT_KINDS) snapshot[kind] = await readTable(executor, kind);
  return flattenSnapshot(snapshot);
};

const scopedAdapter = (adapter: BomLocalAdapter, executor: TransactionExecutor): BomLocalAdapter => ({
  name: adapter.name,
  rxdb: adapter.rxdb,
  transaction: <T extends import('@aiao/rxdb').TransactionFun>(fun: T) =>
    executor.run(fun) as Promise<Awaited<ReturnType<T>>>
});

const canonicalCell = (column: string, value: unknown): unknown => {
  if (value == null) return null;
  if (BOOLEAN_FIELDS.has(column)) return Boolean(value);
  if (DATE_FIELDS.has(column)) return new Date(asText(value)).toISOString();
  if (column === 'ext' && typeof value === 'object') return JSON.stringify(value);
  return value;
};

const retainGroupMembers = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  snapshot: Snapshot,
  headerIds: Set<string>,
  occurrenceIds: Set<string>
): Promise<Map<string, string>> => {
  const initialOccurrences = snapshot.occurrence.filter(row => occurrenceIds.has(String(row['id'])));
  const selectedGroupIds = new Set(
    initialOccurrences.filter(row => row['substituteGroupId'] != null).map(row => String(row['substituteGroupId']))
  );
  const resolvedChildIds = new Map<string, string>();
  if (selectedGroupIds.size === 0) return resolvedChildIds;
  const parentRevisionIds = new Set(
    snapshot.header.filter(row => headerIds.has(String(row['id']))).map(row => String(row['parentRevisionId']))
  );
  for (const parentRevisionId of parentRevisionIds) {
    const members = await resolveBom(adapter, context, { parentRevisionId });
    validateExportReady(
      { truncated: null },
      members.manifest.unresolved.map(row => ({ lineId: row.parentRevisionId, candidates: row.candidates }))
    );
    const active = new Set(members.occurrences.map(row => row.occurrenceId));
    for (const child of members.manifest.childRevisions) resolvedChildIds.set(child.occurrenceId, child.revisionId);
    for (const row of snapshot.occurrence) {
      if (selectedGroupIds.has(String(row['substituteGroupId'])) && active.has(String(row['id'])))
        occurrenceIds.add(String(row['id']));
    }
  }
  return resolvedChildIds;
};

/** 同一次事务内展开并读取涉及主数据，拒绝任何截断或未解析结构。 */
export const exportBom = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  target: ResolveTarget,
  options?: ExplosionOptions
): Promise<BomExportPayload> =>
  adapter.transaction(async executor => {
    const scoped = scopedAdapter(adapter, executor);
    const resolved = await resolveBom(scoped, context, target);
    validateExportReady(
      { truncated: null },
      resolved.manifest.unresolved.map(row => ({ lineId: row.parentRevisionId, candidates: row.candidates }))
    );
    const snapshot = await readSnapshot(executor);
    const rootHeader = snapshot.header.find(row => resolved.manifest.headerIds.includes(String(row['id'])));
    if (rootHeader === undefined) throw new BomExportRejectedError('上下文下没有已发布 BOM 头');
    const explosion = await explodeBom(
      scoped,
      context,
      target,
      options ?? { plannedQty: { value: '1', uom: String(rootHeader['baseUom']) } }
    );
    validateExportReady(explosion, [
      ...explosion.unresolved.map(group => ({ lineId: group.groupCode, candidates: group.candidates })),
      ...explosion.manifest.unresolved.map(row => ({ lineId: row.parentRevisionId, candidates: row.candidates }))
    ]);
    const headerIds = new Set(explosion.manifest.headerIds);
    const occurrenceIds = new Set(explosion.manifest.occurrenceIds);
    const resolvedChildIds = await retainGroupMembers(scoped, context, snapshot, headerIds, occurrenceIds);
    const occurrences = snapshot.occurrence.filter(row => occurrenceIds.has(String(row['id'])));
    const lineIds = new Set(occurrences.map(row => String(row['lineId'])));
    const groupIds = new Set(
      occurrences.filter(row => row['substituteGroupId'] != null).map(row => String(row['substituteGroupId']))
    );
    const headers = snapshot.header.filter(row => headerIds.has(String(row['id'])) && row['orgId'] === context.orgId);
    const revisionIds = new Set(headers.map(row => String(row['parentRevisionId'])));
    for (const occurrence of occurrences) {
      if (occurrence['childRevisionId'] != null) revisionIds.add(String(occurrence['childRevisionId']));
      const resolvedChild = resolvedChildIds.get(String(occurrence['id']));
      if (resolvedChild !== undefined) revisionIds.add(resolvedChild);
    }
    for (const line of explosion.requirementLines) if (line.revisionId != null) revisionIds.add(line.revisionId);
    const revisions = snapshot.revision.filter(row => revisionIds.has(String(row['id'])));
    const itemIds = new Set(revisions.map(row => String(row['itemId'])));
    for (const occurrence of occurrences) itemIds.add(String(occurrence['childItemId']));
    const selected: Snapshot = {
      item: snapshot.item.filter(row => itemIds.has(String(row['id']))),
      revision: revisions,
      header: headers,
      line: snapshot.line.filter(row => lineIds.has(String(row['id']))),
      occurrence: occurrences,
      substitute_group: snapshot.substitute_group.filter(row => groupIds.has(String(row['id']))),
      designator: snapshot.designator.filter(row => occurrenceIds.has(String(row['occurrenceId']))),
      operation_split: snapshot.operation_split.filter(row => occurrenceIds.has(String(row['occurrenceId'])))
    };
    const batches: ExportRowBatch[] = IMPORT_KINDS.map(kind => ({
      table: kind as ExportTable,
      values: selected[kind]
        .slice()
        .sort((left, right) => textOrder(naturalKeyFor(kind, left), naturalKeyFor(kind, right)))
        .map(row => EXPORT_TABLE_COLUMNS[kind].map(column => canonicalCell(column, row[column])))
    }));
    const payload = serializeExportRows(batches, {
      orgId: context.orgId,
      exportedAt: context.asOfDate.toISOString(),
      manifest: { ...explosion.manifest, resolution: resolved.manifest }
    });
    payload.requirementLines = explosion.requirementLines;
    payload.outputs = explosion.outputs;
    payload.penetrations = explosion.penetrations;
    return payload;
  });

const recordsFromPayload = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload === null || typeof payload !== 'object')
    throw new BomImportContractError('payload', '必须是记录数组或 BOM 导出体');
  const source = payload as Row;
  const buckets: Record<ImportKind, string> = {
    item: 'items',
    revision: 'revisions',
    header: 'headers',
    line: 'lines',
    substitute_group: 'substituteGroups',
    occurrence: 'occurrences',
    designator: 'designators',
    operation_split: 'operationSplits'
  };
  return IMPORT_KINDS.flatMap(kind => {
    const rows = source[buckets[kind]];
    if (!Array.isArray(rows)) throw new BomImportContractError(buckets[kind], '必须是行数组');
    return rows.map(row => {
      if (!Array.isArray(row) || row.length !== EXPORT_TABLE_COLUMNS[kind].length)
        throw new BomImportContractError(buckets[kind], '行宽与导出契约不符');
      const data = Object.fromEntries(EXPORT_TABLE_COLUMNS[kind].map((column, offset) => [column, row[offset]]));
      if ('historyBatchNo' in data) data['historyBatchNo'] = null;
      return { kind, source_ref: naturalKeyFor(kind, data), ...data };
    });
  });
};

const diagnosticFor = (raw: unknown, cause: unknown): ImportDiagnostic => {
  const data: Row = typeof raw === 'object' && raw !== null ? (raw as Row) : {};
  const sourceRef = typeof data['source_ref'] === 'string' ? data['source_ref'] : JSON.stringify(raw);
  const kind = IMPORT_KINDS.includes(data['kind'] as ImportKind) ? (data['kind'] as ImportKind) : 'item';
  let naturalKey = JSON.stringify([kind, sourceRef]);
  try {
    naturalKey = naturalKeyFor(kind, data);
  } catch {
    /* 缺键时以稳定源标识点名。 */
  }
  const error = normalizeBomError(cause) ?? cause;
  const detail = error instanceof Error ? error.message : String(error);
  const message =
    /foreign key|外键/i.test(detail) ? `依赖缺失（外键引用不存在）：${detail}`
    : /unique constraint|duplicate key|唯一/i.test(detail) ? `duplicate_key：${detail}`
    : detail;
  return { kind, naturalKey, message: `source_ref ${sourceRef}：${message.replace(/records\[\d+\]/g, 'record')}` };
};

const parseBatch = (rawRows: unknown[]): { records: ImportRecord[]; diagnostics: ImportDiagnostic[] } => {
  const records: ImportRecord[] = [];
  const diagnostics: ImportDiagnostic[] = [];
  for (const raw of rawRows) {
    try {
      const record = parseImportPayload([raw])[0];
      for (const field of ['ecnInId', 'ecnOutId', 'historyBatchNo']) {
        if (record.data[field] != null) throw new BomImportContractError(field, 'ECN / 历史装载不经草稿导入契约');
      }
      for (const field of DECIMAL_FIELDS) {
        const value = record.data[field];
        if (value != null && !isDecimalString(value)) throw new BomImportContractError(field, '必须是规范十进制字符串');
      }
      records.push(record);
    } catch (cause) {
      diagnostics.push(diagnosticFor(raw, cause));
      if (raw === null || typeof raw !== 'object') continue;
      const data = raw as Row;
      const identity = Object.fromEntries(
        Object.entries(data).filter(([field]) => !(DECIMAL_FIELDS as readonly string[]).includes(field))
      );
      try {
        const record = parseImportPayload([identity])[0];
        records.push({ ...record, data });
      } catch {
        continue;
      }
    }
  }
  return { records, diagnostics };
};

const existingKeys = (snapshot: Snapshot): ExistingBomKeySets => ({
  items: new Set(snapshot.item.map(row => naturalKeyFor('item', row))),
  revisions: new Set(snapshot.revision.map(row => naturalKeyFor('revision', row))),
  headers: new Set(snapshot.header.map(row => naturalKeyFor('header', row))),
  lines: new Set(snapshot.line.map(row => naturalKeyFor('line', row))),
  occurrences: new Set(snapshot.occurrence.map(row => naturalKeyFor('occurrence', row))),
  consumeOccurrences: new Set(
    snapshot.occurrence.filter(row => row['flowDirection'] === 'consume').map(row => naturalKeyFor('occurrence', row))
  )
});

const indexSnapshot = (snapshot: Snapshot): Record<ImportKind, Map<string, Row>> =>
  Object.fromEntries(
    IMPORT_KINDS.map(kind => [kind, new Map(snapshot[kind].map(row => [naturalKeyFor(kind, row), row]))])
  ) as Record<ImportKind, Map<string, Row>>;

const importEntityData = (record: ImportRecord, indexes: Record<ImportKind, Map<string, Row>>): Row => {
  const data = { ...record.data };
  const dependency = (kind: ImportKind, identity: Row = data): Row =>
    requiredRow(indexes[kind], naturalKeyFor(kind, identity), kind);
  if (!['item', 'revision', 'header'].includes(record.kind) && dependency('header')['state'] !== 'draft')
    throw new BomImportContractError('header', '导入只能写入草稿头，已发布头禁止经本契约修改');
  if (record.kind === 'revision') data['itemId'] = dependency('item')['id'];
  if (record.kind === 'header') data['parentRevisionId'] = dependency('revision')['id'];
  if (record.kind === 'line' || record.kind === 'substitute_group') data['headerId'] = dependency('header')['id'];
  if (record.kind === 'substitute_group') data['code'] = data['groupCode'];
  if (record.kind === 'occurrence') {
    data['lineId'] = dependency('line')['id'];
    data['childItemId'] = dependency('item', { itemNo: data['childItemNo'] })['id'];
    data['childRevisionId'] =
      data['childRevisionNo'] == null ?
        null
      : dependency('revision', { itemNo: data['childItemNo'], revisionNo: data['childRevisionNo'] })['id'];
    data['substituteGroupId'] =
      data['substituteGroupCode'] == null ?
        null
      : dependency('substitute_group', { ...data, groupCode: data['substituteGroupCode'] })['id'];
  }
  if (record.kind === 'designator' || record.kind === 'operation_split')
    data['occurrenceId'] = dependency('occurrence')['id'];
  if (record.kind === 'header' || record.kind === 'revision') {
    data['state'] = 'draft';
    data['historyBatchNo'] = null;
  }
  for (const field of DATE_FIELDS) if (data[field] != null) data[field] = new Date(asText(data[field]));
  if (Array.isArray(data['lotCodes']))
    data['lotCodes'] = JSON.stringify([...new Set(data['lotCodes'] as string[])].sort());
  return data;
};

class ImportRollback extends Error {
  constructor(readonly result: BomImportResult) {
    super('BOM 整批导入回滚');
  }
}

interface ImportExecutionState {
  indexes: Record<ImportKind, Map<string, Row>>;
  identities: Map<string, string>;
  existing: ExistingBomKeySets;
  diagnostics: ImportDiagnostic[];
  headerIds: string[];
  successfulRecords: ImportRecord[];
}

const IMPORT_REFERENCE_FIELDS = [
  'itemId',
  'parentRevisionId',
  'headerId',
  'lineId',
  'occurrenceId',
  'childItemId',
  'childRevisionId',
  'substituteGroupId'
] as const;

const constructImportEntity = (adapter: BomLocalAdapter, Entity: EntityType, data: Row): InstanceType<EntityType> => {
  const entity = adapter.rxdb?.entityManager.instantiate(Entity);
  if (entity === undefined) throw new BomImportContractError('adapter', '导入需要实体构造门面');
  const values = entity as unknown as Row;
  for (const property of getEntityMetadata(Entity).propertyMap.values()) {
    if (property.name in data) values[property.name] = data[property.name];
  }
  for (const field of IMPORT_REFERENCE_FIELDS) {
    if (field in data) values[field] = data[field];
  }
  return entity;
};

const writeImportRecord = async (
  adapter: BomLocalAdapter,
  executor: TransactionExecutor,
  record: ImportRecord,
  state: ImportExecutionState
): Promise<void> => {
  const data = importEntityData(record, state.indexes);
  const Entity = ENTITY_OF[record.kind];
  await validateBomWrite(
    executor.query.bind(executor),
    bomSqlDialectFor(adapter.name),
    getEntityMetadata(Entity).name,
    data,
    'create'
  );
  const entity = constructImportEntity(adapter, Entity, data);
  const id = (entity as unknown as Row)['id'];
  state.identities.set(String(id), `source_ref ${String(record.data['source_ref'])}`);
  await executor.getRepository(Entity).create(entity);
  state.indexes[record.kind].set(record.naturalKey, { ...record.data, state: data['state'], id });
  if (record.kind === 'header') state.headerIds.push(String(id));
};

const importWriteDiagnostic = (record: ImportRecord, cause: unknown, state: ImportExecutionState): ImportDiagnostic => {
  const cycle =
    normalizeBomError(cause) instanceof BomCycleError ?
      validateImportRecords([...state.successfulRecords, record], state.existing).diagnostics.find(
        row => row.naturalKey === record.naturalKey && row.message.includes('环违约')
      )
    : undefined;
  const diagnostic = cycle ?? diagnosticFor(record.data, cause);
  diagnostic.message = diagnostic.message.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    id => state.identities.get(id) ?? id
  );
  return diagnostic;
};

const writeImportSavepoint = async (
  adapter: BomLocalAdapter,
  executor: TransactionExecutor,
  record: ImportRecord,
  state: ImportExecutionState
): Promise<void> => {
  await executor.query('SAVEPOINT bom_import_row');
  try {
    await writeImportRecord(adapter, executor, record, state);
    await executor.query('RELEASE SAVEPOINT bom_import_row');
    state.successfulRecords.push(record);
  } catch (cause) {
    await executor.query('ROLLBACK TO SAVEPOINT bom_import_row');
    await executor.query('RELEASE SAVEPOINT bom_import_row');
    state.diagnostics.push(importWriteDiagnostic(record, cause, state));
  }
};

const createImportExecutionState = (
  snapshot: Snapshot,
  parsed: ReturnType<typeof parseBatch>
): ImportExecutionState => {
  const existing = existingKeys(snapshot);
  const duplicates = validateImportRecords(parsed.records, existing).diagnostics.filter(row =>
    row.message.includes('duplicate_key')
  );
  return {
    indexes: indexSnapshot(snapshot),
    identities: new Map(
      IMPORT_KINDS.flatMap(kind => snapshot[kind].map(row => [String(row['id']), naturalKeyFor(kind, row)] as const))
    ),
    existing,
    diagnostics: [...parsed.diagnostics, ...duplicates],
    headerIds: [],
    successfulRecords: []
  };
};

const importDraftInTransaction = async (
  adapter: BomLocalAdapter,
  executor: TransactionExecutor,
  parsed: ReturnType<typeof parseBatch>
): Promise<BomImportResult> => {
  if (adapter.name === 'pglite') await executor.query('SET CONSTRAINTS ALL IMMEDIATE');
  else await executor.query('PRAGMA defer_foreign_keys = OFF');
  const state = createImportExecutionState(await readSnapshot(executor), parsed);
  const rejected = new Set(state.diagnostics.map(row => row.naturalKey));
  const ordered = parsed.records
    .slice()
    .sort(
      (left, right) =>
        IMPORT_KINDS.indexOf(left.kind) - IMPORT_KINDS.indexOf(right.kind) ||
        textOrder(left.naturalKey, right.naturalKey)
    );
  for (const record of ordered) {
    if (rejected.has(record.naturalKey)) continue;
    await writeImportSavepoint(adapter, executor, record, state);
  }
  state.diagnostics.sort(
    (left, right) => textOrder(left.naturalKey, right.naturalKey) || textOrder(left.message, right.message)
  );
  if (state.diagnostics.length > 0) {
    throw new ImportRollback({ committed: false, diagnostics: state.diagnostics, headerIds: [] });
  }
  return { committed: true, diagnostics: [], headerIds: state.headerIds };
};

/** 逐行 SAVEPOINT 收集全部诊断，任一失败回滚整批；成功数据仅进入草稿。 */
export const importBomDraft = async (adapter: BomLocalAdapter, payload: unknown): Promise<BomImportResult> => {
  const parsed = parseBatch(recordsFromPayload(payload));
  try {
    return await adapter.transaction(executor => importDraftInTransaction(adapter, executor, parsed));
  } catch (cause) {
    if (cause instanceof ImportRollback) return cause.result;
    throw cause;
  }
};
