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

const auditTable = async (
  executor: TransactionExecutor,
  metadata: EntityMetadata,
  dialect: StorageDialect
): Promise<void> => {
  const table = executor.tableRef(scopeEntities.get(metadata.tableName as ExtAttrScope)!);
  const fields = generatedColumnsOf(metadata).filter(column => column.expression.property === 'ext');
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
        fields.map(field => field.expression.key)
      );
      for (const field of fields)
        validateStoredValue(table, rowId, document, field.expression.key, field.expression.dataType);
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

const installDeclarations = async (
  executor: TransactionExecutor,
  entity: EntityType,
  metadata: EntityMetadata,
  dialect: StorageDialect
): Promise<void> => {
  const table = executor.tableRef(entity);
  for (const declaration of generatedColumnsOf(metadata)) {
    const column = compileGeneratedColumn(metadata, declaration, dialect);
    await executor.query(
      `ALTER TABLE ${table} ADD COLUMN ${quoteSqlIdentifier(column.columnName)} ${column.sqlType}` +
        ` GENERATED ALWAYS AS (${column.expression}) ${column.storage.toUpperCase()}`
    );
  }
  for (const statement of advancedIndexStatements(metadata, dialect, table)) {
    await executor.query(statement);
  }
};

/** 先审计原始 JSON 与热键类型，再在既有用户迁移事务内安装声明。 */
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
      for (const { metadata } of plan) await auditTable(executor, metadata, dialect);
      for (const { entity, metadata } of plan) await installDeclarations(executor, entity, metadata, dialect);
    },
    async down() {
      throw new BomExtAttrError(name, '迁移接口不提供反向事务执行器；请用新 up 迁移显式移除存储声明');
    }
  };
};
