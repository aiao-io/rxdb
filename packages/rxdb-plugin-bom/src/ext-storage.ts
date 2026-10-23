import {
  advancedIndexesOf,
  advancedIndexStatements,
  compileAdvancedIndex,
  compileGeneratedColumn,
  generatedColumnsOf,
  getEntityStorageMetadata,
  hashConstraintDefinition,
  quoteSqlIdentifier,
  snapshotEntityStorage,
  type EntityMetadata,
  type EntityStorageOverride,
  type EntityType,
  type JsonScalarDataType,
  type MigrationType,
  type StorageDialect,
  type TransactionExecutor
} from '@aiao/rxdb';
import { BOM_ENTITIES, BomHeader, BomItem, BomLineOccurrence } from './entities.js';
import { BomExtAttrError, type ExtAttrScope } from './resolve/ext-attr.js';
import { readTableCatalog } from './storage-catalog.js';

/** 单个作用域内需要透明提升的 JSON 标量属性。 */
export interface BomHotField {
  readonly scope: ExtAttrScope;
  readonly code: string;
  readonly dataType: JsonScalarDataType;
}

/** 纯 BOM 存储配置；GIN 只声明给 PostgreSQL，默认不启用。 */
export interface BomExtStorageOptions {
  readonly hotFields: readonly BomHotField[];
  readonly gin?: boolean;
}

const scopeEntities = new Map<ExtAttrScope, EntityType>([
  ['item', BomItem],
  ['bom_header', BomHeader],
  ['bom_line_occurrence', BomLineOccurrence]
]);

const validateHotFields = (options: BomExtStorageOptions): void => {
  if (options === null || typeof options !== 'object' || Array.isArray(options))
    throw new BomExtAttrError('storage', '必须是声明对象');
  if (!Array.isArray(options.hotFields)) throw new BomExtAttrError('hotFields', '必须是数组');
  if (options.gin !== undefined && typeof options.gin !== 'boolean') throw new BomExtAttrError('gin', '必须是布尔值');
  const keys = new Set<string>();
  for (const field of options.hotFields) {
    if (field === null || typeof field !== 'object' || Array.isArray(field))
      throw new BomExtAttrError('hotFields', '每项必须是字段声明对象');
    if (!scopeEntities.has(field.scope)) throw new BomExtAttrError('scope', `未知作用域 ${String(field.scope)}`);
    if (typeof field.code !== 'string' || field.code.includes('\u0000'))
      throw new BomExtAttrError('code', '必须是不含 NUL 的字面键');
    if (!['string', 'number', 'boolean'].includes(field.dataType))
      throw new BomExtAttrError(field.code, `不支持热字段类型 ${String(field.dataType)}`);
    const key = JSON.stringify([field.scope, field.code]);
    if (keys.has(key)) throw new BomExtAttrError(field.code, `作用域 ${field.scope} 重复声明`);
    keys.add(key);
  }
};

/** 构造独立、冻结的三作用域存储声明，不修改 BOM 实体类。 */
export const createBomExtStorage = (options: BomExtStorageOptions): readonly EntityStorageOverride[] => {
  validateHotFields(options);
  const declarations: EntityStorageOverride[] = [];
  for (const [scope, entity] of scopeEntities) {
    const fields = options.hotFields.filter(field => field.scope === scope);
    if (fields.length === 0 && options.gin !== true) continue;
    const generatedColumns = fields.map(field => ({
      name: `hot_${hashConstraintDefinition(JSON.stringify([field.code, field.dataType]))}`,
      expression: {
        kind: 'jsonScalar' as const,
        property: 'ext',
        key: field.code,
        dataType: field.dataType,
        jsonText: true as const
      }
    }));
    declarations.push({
      entity,
      generatedColumns,
      indexes: [
        ...generatedColumns.map(column => ({ name: `lookup_${column.name}` as const, properties: [column.name] })),
        ...(options.gin === true ?
          [
            {
              name: 'ext_gin' as const,
              method: 'gin' as const,
              dialects: ['postgres' as const],
              expression: { kind: 'jsonDocument' as const, property: 'ext', jsonText: true as const }
            }
          ]
        : [])
      ]
    });
  }
  return snapshotEntityStorage(declarations, BOM_ENTITIES, () => false);
};

const auditedDocument = (
  table: string,
  rowId: unknown,
  raw: unknown,
  keys: readonly string[]
): Record<string, unknown> => {
  const subject = `${table}/${String(rowId)}/${keys.length === 0 ? 'ext' : keys.join(',')}`;
  let value: unknown;
  try {
    value = JSON.parse(String(raw));
  } catch {
    throw new BomExtAttrError(subject, '存量 ext 不是合法 JSON');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new BomExtAttrError(subject, '存量 ext 必须是 JSON 对象');
  return value as Record<string, unknown>;
};

/** 一个作用域待补的热字段列：审计用键与类型，安装用 DDL。 */
interface PendingColumn {
  readonly key: string;
  readonly dataType: JsonScalarDataType;
  readonly ddl: string;
}

/** 一张表待补的托管对象；目录里已有的同名列 / 索引不重复下发。 */
interface PendingStorage {
  readonly table: string;
  readonly columns: readonly PendingColumn[];
  readonly indexes: readonly string[];
}

/**
 * 按目录算出一张表还缺的生成列与索引。
 *
 * @remarks
 * 托管对象名内嵌声明定义哈希：同名即同一声明，只补缺失对象，「新增热字段 + 声明全集 +
 * 新迁移名」不再撞重复列。同名对象的实际定义由同一次连接紧随迁移的漂移检查逐项核对，
 * 被改形的对象以 Changed definitions 拒绝连接，不会静默接受。表还不存在时返回 undefined：
 * 同一版本首次引入的实体随后由缺表补建按声明建出，自带生成列与索引。
 */
const pendingStorage = async (
  executor: TransactionExecutor,
  entity: EntityType,
  metadata: EntityMetadata,
  dialect: StorageDialect
): Promise<PendingStorage | undefined> => {
  const table = executor.tableRef(entity);
  const catalog = await readTableCatalog(executor, dialect === 'postgres', table);
  if (catalog.columns.size === 0) return undefined;
  const columns = generatedColumnsOf(metadata).flatMap(declaration => {
    const column = compileGeneratedColumn(metadata, declaration, dialect);
    if (catalog.columns.has(column.columnName)) return [];
    const ddl =
      `ALTER TABLE ${table} ADD COLUMN ${quoteSqlIdentifier(column.columnName)} ${column.sqlType}` +
      ` GENERATED ALWAYS AS (${column.expression}) ${column.storage.toUpperCase()}`;
    return [{ key: declaration.expression.key, dataType: declaration.expression.dataType, ddl }];
  });
  const existingIndexes = [...catalog.indexes].map(name => `INDEX ${quoteSqlIdentifier(name)} ON `);
  const indexes = advancedIndexStatements(metadata, dialect, table).filter(
    statement => !existingIndexes.some(prefix => statement.includes(prefix))
  );
  return columns.length + indexes.length === 0 ? undefined : { table, columns, indexes };
};

const auditTable = async (
  executor: TransactionExecutor,
  { table, columns }: PendingStorage,
  dialect: StorageDialect
): Promise<void> => {
  let after: unknown;
  let hasAfter = false;
  let remaining = true;
  while (remaining) {
    const rows = await executor.query(
      `SELECT "id", "ext" FROM ${table} WHERE "ext" IS NOT NULL` +
        `${hasAfter ? ` AND "id" > ${dialect === 'postgres' ? '$1' : '?'}` : ''} ORDER BY "id" LIMIT 1000`,
      hasAfter ? [after] : []
    );
    for (const [rowId, raw] of rows.rows) {
      const document = auditedDocument(
        table,
        rowId,
        raw,
        columns.map(column => column.key)
      );
      for (const column of columns) validateStoredValue(table, rowId, document, column.key, column.dataType);
    }
    remaining = rows.rows.length === 1000;
    after = rows.rows.at(-1)?.[0];
    hasAfter = true;
  }
};

const validateStoredValue = (
  table: string,
  rowId: unknown,
  document: Record<string, unknown>,
  key: string,
  dataType: JsonScalarDataType
): void => {
  const value = document[key];
  if (value === undefined || value === null) return;
  if (typeof value === dataType && (dataType !== 'number' || Number.isFinite(value))) return;
  throw new BomExtAttrError(`${table}/${String(rowId)}/${key}`, `存量热字段类型必须为 ${dataType}`);
};

const installPending = async (executor: TransactionExecutor, { columns, indexes }: PendingStorage): Promise<void> => {
  for (const column of columns) await executor.query(column.ddl);
  for (const statement of indexes) await executor.query(statement);
};

/**
 * 先审计原始 JSON 与待补热键的类型，再在既有用户迁移事务内补齐缺失的存储声明。
 *
 * @remarks
 * 只下发目录中缺失的托管列与索引：声明可增量演进（新迁移名 + 声明全集）；尚无表的实体
 * 跳过审计与 DDL，由缺表补建按声明建表。
 */
export const createBomExtStorageMigration = (
  name: string,
  dialect: StorageDialect,
  declarations: readonly EntityStorageOverride[]
): MigrationType => {
  if (typeof name !== 'string' || name.trim().length === 0)
    throw new BomExtAttrError('migration', '必须声明稳定的迁移名');
  if (dialect !== 'sqlite' && dialect !== 'postgres') throw new BomExtAttrError('dialect', '仅支持 sqlite/postgres');
  const snapshots = snapshotEntityStorage(declarations, [...scopeEntities.values()], () => false);
  const plan = snapshots.map(declaration => ({
    entity: declaration.entity,
    metadata: getEntityStorageMetadata({ config: { entityStorage: snapshots } }, declaration.entity)
  }));
  for (const { metadata } of plan) {
    for (const column of generatedColumnsOf(metadata)) compileGeneratedColumn(metadata, column, dialect);
    for (const index of advancedIndexesOf(metadata)) compileAdvancedIndex(metadata, index, dialect);
  }
  return {
    name,
    async up(executor) {
      const pending: PendingStorage[] = [];
      for (const { entity, metadata } of plan) {
        const work = await pendingStorage(executor, entity, metadata, dialect);
        if (work !== undefined) pending.push(work);
      }
      for (const work of pending) await auditTable(executor, work, dialect);
      for (const work of pending) await installPending(executor, work);
    },
    async down() {
      throw new BomExtAttrError(name, '迁移接口不提供反向事务执行器；请用新 up 迁移显式移除存储声明');
    }
  };
};
