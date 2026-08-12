import {
  EntityData,
  EntityMetadata,
  EntityPropertyMetadata,
  EntityRelationMetadata,
  EntityType,
  getEntityMetadata,
  KeyValuePropertyMetadata,
  PropertyType,
  type RxDBEntityId
} from '@aiao/rxdb';
import { EncryptedDecryptError, EncryptedLockedError, type Keyring } from '@aiao/rxdb-adapter-encrypted';
import { isNil, isString } from '@aiao/utils';
import type { SQLiteCompatibleType, SqliteDataType, SqliteResult } from './sqlite-core.interface.js';

export { normalizeUpdateEntity } from '@aiao/rxdb';
export { deserializeFromEnvelope, serializeForEnvelope } from '@aiao/rxdb-adapter-encrypted';

/**
 * 加密上下文：密钥环、命名空间与实体元数据解析器。
 */
export interface EncryptionContext {
  keyring: Keyring | null;
  namespace: string;
  resolveEntityMetadata?: (entity: string, namespace: string) => EntityMetadata | undefined;
}

/**
 * 一行实体的原始数据：列名到 SQLite 兼容值的映射。
 */
export type SQLiteEntityData = Record<string, SQLiteCompatibleType | undefined>;

const SIGNED_64_MIN = -(1n << 63n);
const SIGNED_64_MAX = (1n << 63n) - 1n;

const assertSigned64BitBigInt = (value: unknown, fieldName: string): bigint => {
  if (typeof value !== 'bigint' || value < SIGNED_64_MIN || value > SIGNED_64_MAX) {
    throw new TypeError(`${fieldName} must be a signed 64-bit bigint`);
  }
  return value;
};

const assertBinary = (value: unknown, fieldName: string): Uint8Array => {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${fieldName} must be a Uint8Array`);
  }
  return new Uint8Array(value);
};

const toSQLiteCompatibleValue = (value: unknown, fieldName: string): SQLiteCompatibleType | undefined => {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value;
  if (value instanceof Uint8Array) return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value) && value.every(item => typeof item === 'number')) return value;
  throw new TypeError(`Unsupported SQLite value for ${fieldName}`);
};

/**
 * 检查 sqlite 表是否存在
 * @param tableName 表名
 * @returns 参数化 SQL 语句和参数
 */
export const isTableExistedSql = (tableName: string) => ({
  sql: `SELECT * FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;`,
  params: [tableName] as [string]
});

/**
 * 检查 sqlite 结果是否为空
 * @param result SQLite 查询结果
 * @returns 是否为空结果
 */
export const isSqlResultEmpty = (result: SqliteResult) =>
  !!result.sql && (result.results.length === 0 || result.results[0].rows.length === 0);

/**
 * sqlite 行 id 列名
 */
export const ROWID = '__rowid' as const;

/** 递归树查询在 CTE 里注入的层级列（见 `query/query_tree_sql.ts`） */
export const TREE_LEVEL_COLUMN = '__level' as const;

/**
 * 结果集里由适配器自己注入、不属于实体的内部列。
 *
 * @remarks
 * 必须是**精确白名单**：用 `startsWith('__')` 判断会把用户实体上任何以 `__` 开头的合法物理列
 * 一并丢掉，实体水合后那些字段静默变成 undefined（SQLC-031）。
 */
const INTERNAL_RESULT_COLUMNS: ReadonlySet<string> = new Set([ROWID, TREE_LEVEL_COLUMN]);

export const SQLITE_MAX_BIND_VARIABLES = 999;

export const getSqliteBindChunkSize = (variablesPerItem = 1): number => {
  if (!Number.isFinite(variablesPerItem) || variablesPerItem <= 0) {
    return SQLITE_MAX_BIND_VARIABLES;
  }

  return Math.max(1, Math.floor(SQLITE_MAX_BIND_VARIABLES / variablesPerItem));
};

export const chunkBySqliteBindLimit = <T>(items: readonly T[], variablesPerItem = 1): T[][] => {
  if (items.length === 0) {
    return [];
  }

  const chunkSize = getSqliteBindChunkSize(variablesPerItem);
  if (items.length <= chunkSize) {
    return [items.slice()];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
};

/**
 * 将 RxDB 属性类型转换为 SQLite 数据类型
 */
export const rxDBColumnTypeToSqliteType = (property: {
  readonly type: string;
  readonly encrypted?: boolean;
}): SqliteDataType => {
  let type: SqliteDataType;
  switch (property.type) {
    case PropertyType.uuid:
    case PropertyType.string:
    case PropertyType.enum:
    case PropertyType.json:
    case PropertyType.keyValue:
    case PropertyType.stringArray:
    case PropertyType.numberArray:
    case PropertyType.date:
      type = 'TEXT';
      break;
    case PropertyType.number:
      type = 'REAL';
      break;
    case PropertyType.integer:
    case PropertyType.boolean:
    case PropertyType.bigint:
      type = 'INTEGER';
      break;
    case PropertyType.binary:
      type = 'BLOB';
      break;
    default:
      throw new RxDBAdapterSqliteError(`Unsupported property type: ${String(property.type)}`);
  }
  return property.encrypted === true ? 'TEXT' : type;
};

/**
 * 将 JS 类型值转换为 SQLite 兼容类型
 * @param value JS 值
 * @param property 属性元数据
 * @returns SQLite 兼容的值
 */
export const transformValueJsToSqlite = (
  value: unknown,
  property: EntityPropertyMetadata | KeyValuePropertyMetadata
): SQLiteCompatibleType | undefined => {
  if (value === null && property.nullable) return null;
  if (value === undefined) return undefined;
  switch (property.type) {
    case PropertyType.bigint:
      return assertSigned64BitBigInt(value, property.name);
    case PropertyType.binary:
      return assertBinary(value, property.name);
    case PropertyType.boolean:
      return value ? 1 : 0;
    case PropertyType.date:
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
      if (value === '') return null;
      return toSQLiteCompatibleValue(value, property.name);
    case PropertyType.keyValue: {
      if (!value) return null;
      if (property.properties && typeof value === 'object' && !Array.isArray(value)) {
        const converted: Record<string, unknown> = { ...value };
        property.properties.forEach(nestedProp => {
          if (nestedProp.name in converted) {
            converted[nestedProp.name] = transformValueJsToSqlite(converted[nestedProp.name], nestedProp);
          }
        });
        return JSON.stringify(converted);
      }
      return JSON.stringify(value);
    }
    case PropertyType.stringArray:
    case PropertyType.numberArray:
    case PropertyType.json:
      return JSON.stringify(value);
    default:
      return toSQLiteCompatibleValue(value, property.name);
  }
};

/**
 * 将 SQLite 类型值转换为 JS 类型
 * @param value SQLite 类型的值
 * @param property 实体属性元数据
 * @returns JS 类型的值
 */
export const transformValueSqliteToJs = (
  value: unknown,
  property: EntityPropertyMetadata | KeyValuePropertyMetadata
) => {
  if (value === null && property.nullable) return null;
  if (value === void 0) return void 0;
  switch (property.type) {
    case PropertyType.bigint:
      if (typeof value === 'bigint') return assertSigned64BitBigInt(value, property.name);
      if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
      throw new TypeError(`${property.name} did not read as a lossless signed 64-bit bigint`);
    case PropertyType.binary:
      if (value instanceof Uint8Array) return new Uint8Array(value);
      if (Array.isArray(value) && value.every(item => Number.isInteger(item) && item >= 0 && item <= 255)) {
        return new Uint8Array(value);
      }
      throw new TypeError(`${property.name} did not read as binary data`);
    case PropertyType.boolean:
      return Boolean(value);
    case PropertyType.date: {
      if (value === '') return null; // 空字符串不应产生 Invalid Date
      if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
      if (typeof value === 'string') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
      }
      return value;
    }
    case PropertyType.keyValue: {
      if (!value) return null;
      const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return parsed;
      const converted: Record<string, unknown> = { ...parsed };
      property.properties?.forEach(nestedProp => {
        if (nestedProp.name in converted) {
          converted[nestedProp.name] = transformValueSqliteToJs(converted[nestedProp.name], nestedProp);
        }
      });
      return converted;
    }
    case PropertyType.stringArray:
    case PropertyType.numberArray: {
      if (Array.isArray(value)) return value;
      if (typeof value !== 'string') return value ? value : null;
      const parsed: unknown = JSON.parse(value);
      return parsed;
    }
    case PropertyType.json:
      if (value === null) return null;
      if (typeof value !== 'string') return value;
      if (value === '') return null;
      try {
        const parsed: unknown = JSON.parse(value);
        return parsed;
      } catch {
        return value;
      }
    default:
      return value;
  }
};

/**
 * 获取表名
 * @param name 表名
 * @param namespace 命名空间
 * @returns 完整的表名
 */
export const get_table_name = (name: string, namespace: string) => `${namespace}$${name}`;

/**
 * 解析表名信息
 * @param tableName 完整表名
 * @returns [命名空间, 表名] 元组
 */
export const get_table_name_info = (tableName: string): [string, string] => {
  const index = tableName.indexOf('$');
  if (index === -1) {
    return ['', tableName];
  }
  return [tableName.substring(0, index), tableName.substring(index + 1)];
};

/**
 * 通过元数据获取表名
 * @param metadata 实体元数据
 * @returns 完整的表名
 */
export const get_table_name_by_metadata = (metadata: EntityMetadata) =>
  get_table_name(metadata.tableName, metadata.namespace);

/**
 * 通过实体类型获取表名
 * @param EntityType 实体类型
 * @returns 完整的表名
 */
export const get_table_name_by_entity_type = (EntityType: EntityType) =>
  get_table_name_by_metadata(getEntityMetadata(EntityType));

/**
 * 获取主键的物理列名
 *
 * @remarks
 * 主键的 JS 属性名恒为 `id`，但 `columnName` 是 `EntityMetadataOptions` 上的公开选项，
 * 允许把主键映射到别的物理列。凡是要拼进 SQL 的主键列名都必须走这里解析，
 * 直接写字面量 `id` 会在自定义主键列上报 no such column（SQLC-014）。
 * 未声明 columnName 时元数据归一化会回填成属性名，这里的 `?? 'id'` 只覆盖 propertyMap 缺失的桩元数据。
 *
 * @param metadata 实体元数据
 * @returns 主键物理列名
 */
export const get_primary_key_column = (metadata: EntityMetadata): string =>
  metadata.propertyMap?.get('id')?.columnName ?? 'id';

/**
 * 获取表列索引名称
 * @param metadata 实体元数据
 * @param property 属性或关系元数据
 * @returns 索引名称
 */
export const getTableColumnIndexName = (
  metadata: EntityMetadata,
  property: EntityPropertyMetadata | EntityRelationMetadata
) => `idx_${get_table_name_by_metadata(metadata)}_${property.name}`;

/**
 * RxDB SQLite 适配器错误类
 */
export class RxDBAdapterSqliteError extends Error {
  readonly code?: 'adapter_disconnected';

  constructor(message: string, options?: ErrorOptions & { code?: 'adapter_disconnected' }) {
    super(message, options);
    this.name = 'RxDBAdapterSqliteError';
    this.code = options?.code;
    Object.setPrototypeOf(this, RxDBAdapterSqliteError.prototype);
  }
}

import { deserializeFromEnvelope, serializeForEnvelope } from '@aiao/rxdb-adapter-encrypted';

/**
 * 将实体值转换为 SQLite 格式
 * @param metadata 实体元数据
 * @param entity 实体对象
 * @param opts 可选加密上下文；当包含 keyring 时，会自动加密 `property.encrypted === true` 的列
 * @returns 转换后的实体对象，键为数据库列名
 */
export const transformEntityValueToSql = async (
  metadata: EntityMetadata,
  entity: EntityData,
  opts?: EncryptionContext & { primaryKey?: RxDBEntityId }
): Promise<SQLiteEntityData> => {
  const needSave: SQLiteEntityData = {};
  const keys = Object.keys(entity);

  // 兼容没有 foreignKeyNames 的情况
  const foreignKeyNames = metadata.foreignKeyNames || [];
  const foreignKeyColumnNames = metadata.foreignKeyColumnNames || foreignKeyNames;
  const { propertyMap, columnNameToPropertyName, encryptedPropertyMap } = metadata;
  const hasForeignKeys = foreignKeyNames.length > 0;
  const hasEncryption = encryptedPropertyMap && encryptedPropertyMap.size > 0;
  const primaryKeyValue = opts?.primaryKey ?? (entity['id'] as RxDBEntityId | null | undefined) ?? '';
  const transformForeignKey = (foreignKeyName: string, value: unknown): SQLiteCompatibleType | undefined => {
    const relation = metadata.foreignKeyRelationMap?.get(foreignKeyName);
    if (!relation || !opts?.resolveEntityMetadata) return toSQLiteCompatibleValue(value, foreignKeyName);
    const mappedMetadata = opts.resolveEntityMetadata(relation.mappedEntity, relation.mappedNamespace);
    const primaryProperty = Array.from(mappedMetadata?.propertyMap.values() ?? []).find(
      property => Reflect.get(property, 'primary') === true
    );
    return primaryProperty ?
        transformValueJsToSqlite(value, primaryProperty)
      : toSQLiteCompatibleValue(value, foreignKeyName);
  };

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    // 检查是否是外键 JS 属性名（如 departmentId）
    const fkIndex = foreignKeyNames.indexOf(key);
    if (fkIndex !== -1) {
      needSave[foreignKeyColumnNames[fkIndex]] = transformForeignKey(key, entity[key]);
      continue;
    }

    // 检查是否是外键的数据库列名（如 dept_id）
    const fkColIndex = foreignKeyColumnNames.indexOf(key);
    if (fkColIndex !== -1) {
      needSave[key] = transformForeignKey(foreignKeyNames[fkColIndex], entity[key]);
      continue;
    }

    if (!hasForeignKeys && key.endsWith('Id')) {
      needSave[key] = toSQLiteCompatibleValue(entity[key], key);
      continue;
    }

    // JS 属性名查找
    const property = propertyMap.get(key);
    if (property) {
      if (hasEncryption && property.encrypted === true) {
        const raw = entity[key];
        if (raw === null || raw === undefined) {
          needSave[property.columnName] = raw === null ? null : undefined;
          continue;
        }
        if (!opts?.keyring || opts.keyring.isLocked) {
          throw new EncryptedLockedError({
            message: `keyring is locked while writing encrypted column ${metadata.tableName}.${property.columnName}`
          });
        }
        const plaintext = serializeForEnvelope(raw, property);
        needSave[property.columnName] = await opts.keyring.encrypt({
          plaintext,
          entityNamespace: metadata.namespace,
          tableName: metadata.tableName,
          columnName: property.columnName,
          primaryKey: primaryKeyValue
        });
        continue;
      }
      needSave[property.columnName] = transformValueJsToSqlite(entity[key], property);
      continue;
    }

    // columnName 查找
    const propertyName = columnNameToPropertyName?.get(key);
    if (propertyName) {
      const prop = propertyMap.get(propertyName);
      if (prop) {
        if (hasEncryption && prop.encrypted === true) {
          const raw = entity[key];
          if (raw === null || raw === undefined) {
            needSave[key] = raw === null ? null : undefined;
            continue;
          }
          if (!opts?.keyring || opts.keyring.isLocked) {
            throw new EncryptedLockedError({
              message: `keyring is locked while writing encrypted column ${metadata.tableName}.${prop.columnName}`
            });
          }
          const plaintext = serializeForEnvelope(raw, prop);
          needSave[key] = await opts.keyring.encrypt({
            plaintext,
            entityNamespace: metadata.namespace,
            tableName: metadata.tableName,
            columnName: prop.columnName,
            primaryKey: primaryKeyValue
          });
          continue;
        }
        needSave[key] = transformValueJsToSqlite(entity[key], prop);
      }
    }
  }

  return needSave;
};

/**
 * 规范化创建时的实体数据
 * @param metadata 实体元数据
 * @param entity 实体对象
 * @returns 过滤后的实体对象，键为数据库列名
 */
export const normalizeCreateEntity = (metadata: EntityMetadata, entity: EntityData): EntityData => {
  const result: EntityData = {};

  // 处理属性
  for (const [key, property] of metadata.propertyMap) {
    if (key in entity) {
      result[property.columnName] = entity[key];
    }
  }

  // 处理外键 - 兼容没有 foreignKeyColumnNames 的情况
  const foreignKeyNames = metadata.foreignKeyNames || [];
  const foreignKeyColumnNames = metadata.foreignKeyColumnNames || foreignKeyNames;
  for (let i = 0; i < foreignKeyNames.length; i++) {
    const key = foreignKeyNames[i];
    if (key in entity) {
      result[foreignKeyColumnNames[i]] = entity[key];
    }
  }

  return result;
};

/** 把 Date / ISO 字符串 / 毫秒数归一成时间戳；无法解析时返回 undefined。 */
const toTimestamp = (value: unknown): number | undefined => {
  const date =
    value instanceof Date ? value
    : typeof value === 'string' || typeof value === 'number' ? new Date(value)
    : undefined;
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return date.getTime();
};

/**
 * 计算单调递增的 updatedAt：返回 max(preferred ?? now, current + 1ms)，
 * 保证同一实体连续更新时 updatedAt 严格递增。
 * @param entity 含 updatedAt 字段的实体
 * @param preferred 期望的更新时间，缺省为当前时间
 */
export const getMonotonicUpdatedAt = (entity: { updatedAt?: unknown }, preferred?: Date): Date => {
  const candidate = preferred ? new Date(preferred) : new Date();
  const current = toTimestamp(entity.updatedAt);

  if (current === undefined || candidate.getTime() > current) {
    return candidate;
  }
  return new Date(current + 1);
};

/** 分支切换写入 updatedAt 的进程内水位，用于打破「连续两次切换落在同一毫秒」的平局。 */
let switchUpdatedAtWatermark = 0;

/**
 * 计算分支切换（undo / redo）UPDATE 应写入的 `updatedAt`。
 *
 * undo/redo 本身**就是一次写入**，`updatedAt` 记录的是写入时刻而非用户的逻辑状态，
 * 因此不能沿用历史 patch 里的旧值：一旦倒退，LWW 同步会把 undo 判成旧写而丢弃，
 * 依赖 `id@updatedAt` 指纹去重的查询缓存也会把本次发射吞掉。
 *
 * 返回 `max(now, ...known + 1ms, watermark + 1ms)`：
 * - `known` 取自本次 change 的 patch / inversePatch，覆盖「上一次写入是普通 save」的情形
 *   （`getMonotonicUpdatedAt` 允许 `updatedAt` 领先墙上时钟，所以只取 `now` 不够）；
 * - `watermark` 覆盖「上一次写入正是前一步 undo/redo」的情形——那次写入没有进历史，
 *   只有进程内水位知道它。
 *
 * @param known 历史记录中已知的该行 `updatedAt` 候选值（Date / ISO 字符串 / 毫秒数）
 */
export const getSwitchUpdatedAt = (known: readonly unknown[]): Date => {
  let next = Date.now();
  for (const value of known) {
    const time = toTimestamp(value);
    if (time !== undefined && time >= next) next = time + 1;
  }
  if (switchUpdatedAtWatermark >= next) next = switchUpdatedAtWatermark + 1;
  switchUpdatedAtWatermark = next;
  return new Date(next);
};

/**
 * 将标识符（表名、列名、触发器名等）转义为双引号引用的 SQL 标识符。
 * 内部双引号使用 "" 转义，防止 SQL 注入。
 * @param name 标识符字符串
 * @returns 双引号引用的 SQL 标识符
 */
export const quote_sql_identifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/**
 * 构建覆盖写 `sqlite_sequence` 某表序列值的参数化语句序列。
 *
 * `sqlite_sequence` 在 name 上没有 UNIQUE 约束，`ON CONFLICT(name)` 会被拒绝；
 * DELETE + INSERT 在同一执行通道内达到等价 upsert 语义。两条语句必须按序执行。
 *
 * @param table 目标表名（sqlite_sequence.name）
 * @param seq 要写入的序列值
 * @returns 依序执行的 `{sql, params}` 列表
 */
export const build_set_sequence_statements = (
  table: string,
  seq: number
): { sql: string; params: SQLiteCompatibleType[] }[] => [
  { sql: 'DELETE FROM sqlite_sequence WHERE name = ?', params: [table] },
  { sql: 'INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)', params: [table, seq] }
];

/**
 * 获取 SQL 值表示
 * @param value 要转换的值
 * @returns SQL 字面量字符串
 */
export const get_sql_value = (value: unknown): string | number | Uint8Array | number[] | bigint | boolean | Date => {
  if (isString(value)) {
    const escaped = value.replaceAll('\0', '').replaceAll("'", "''");
    return `'${escaped}'`;
  }
  if (isNil(value)) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return value;
  if (value instanceof Uint8Array || value instanceof Date) return value;
  if (Array.isArray(value) && value.every(item => typeof item === 'number')) return value;
  throw new TypeError('Unsupported SQL literal value');
};

/**
 * 将 SQL 模板和参数合并为完整 SQL
 * @param sql SQL 模板字符串
 * @param params 参数数组
 * @returns 完整的 SQL 字符串
 */
export const get_sql_with_params = /*@__PURE__*/ (sql: string, params: readonly unknown[] = []): string => {
  let i = 0;
  return sql.replace(/\?/g, () => String(get_sql_value(params[i++])));
};

// 缓存 metadata 列名与属性名的转换映射，提升大批量检索时的字段映射性能
const metadataFkCache = new WeakMap<
  EntityMetadata,
  {
    fkMap: Map<string, string>;
  }
>();

/**
 * 从查询结果行创建实体对象
 * @param metadata 实体元数据
 * @param columns 列名数组
 * @param rows 行数据数组
 * @returns 实体对象，键为 JS 属性名
 */
export const getEntityObjectFromResult = async <T extends object = EntityData>(
  metadata: EntityMetadata,
  columns: string[],
  rows: SQLiteCompatibleType[],
  opts?: EncryptionContext
): Promise<T> => {
  const obj: EntityData = {};

  // 检查是否已有缓存的 FK 映射
  let cached = metadataFkCache.get(metadata);
  if (!cached) {
    const fkMap = new Map<string, string>();
    const foreignKeyNames = metadata.foreignKeyNames || [];
    const foreignKeyColumnNames = metadata.foreignKeyColumnNames || foreignKeyNames;
    for (let i = 0; i < foreignKeyColumnNames.length; i++) {
      fkMap.set(foreignKeyColumnNames[i], foreignKeyNames[i]);
    }
    cached = { fkMap };
    metadataFkCache.set(metadata, cached);
  }

  const { propertyMap, columnNameToPropertyName, computedPropertyMap, encryptedPropertyMap, name: metaName } = metadata;
  const hasEncryption = encryptedPropertyMap && encryptedPropertyMap.size > 0;

  const decryptJobs: Array<{
    propertyName: string;
    property: EntityPropertyMetadata;
    rawCell: string;
  }> = [];

  for (let index = 0; index < rows.length; index++) {
    const columnName = columns[index];
    // 精确白名单而非 `startsWith('__')`：后者会连用户实体上合法的 `__` 前缀列一起丢掉（SQLC-031）
    if (columnName.charCodeAt(0) === 95 /* '_' */ && INTERNAL_RESULT_COLUMNS.has(columnName)) continue;

    const value = rows[index];

    const fkPropName = cached.fkMap.get(columnName);
    if (fkPropName !== undefined) {
      obj[fkPropName] = value;
      continue;
    }

    const propertyName = columnNameToPropertyName?.get(columnName);
    if (propertyName) {
      const property = propertyMap.get(propertyName);
      if (property) {
        if (hasEncryption && property.encrypted === true) {
          if (value === null || value === undefined) {
            obj[propertyName] = null;
            continue;
          }
          if (!opts?.keyring || opts.keyring.isLocked) {
            throw new EncryptedLockedError({
              message: `keyring is locked while reading encrypted column ${metadata.tableName}.${property.columnName}`
            });
          }
          if (!isString(value)) {
            throw new EncryptedDecryptError({
              code: 'malformed_envelope',
              message: `column ${metadata.tableName}.${property.columnName} is not a string envelope`
            });
          }
          decryptJobs.push({ propertyName, property, rawCell: value });
          continue;
        }
        obj[propertyName] = transformValueSqliteToJs(value, property);
      } else {
        console.warn(`Property ${propertyName} not found in metadata ${metaName}`);
      }
      continue;
    }

    const computedProperty = computedPropertyMap?.get(columnName);
    if (computedProperty) {
      obj[columnName] = transformValueSqliteToJs(value, computedProperty);
      continue;
    }

    if (!columnNameToPropertyName) {
      const property = propertyMap.get(columnName);
      if (property) {
        obj[columnName] = transformValueSqliteToJs(value, property);
        continue;
      }
    }

    console.warn(`Column ${columnName}=${value} not found in metadata ${metaName}`);
  }

  if (decryptJobs.length === 0) return obj as T;

  const primaryKeyValue = (obj['id'] as RxDBEntityId | null | undefined) ?? '';
  const keyring = opts?.keyring;
  if (!keyring) {
    throw new EncryptedLockedError({ message: `keyring is locked while reading ${metadata.tableName}` });
  }
  const results = await Promise.allSettled(
    decryptJobs.map(async job => {
      const plain = await keyring.decrypt({
        envelope: job.rawCell,
        entityNamespace: metadata.namespace,
        tableName: metadata.tableName,
        columnName: job.property.columnName,
        primaryKey: primaryKeyValue
      });
      return { propertyName: job.propertyName, property: job.property, plaintext: plain };
    })
  );
  // 部分失败策略：任一失败 → 整行明文全部作废，整行拒绝。
  const hasRejection = results.some(r => r.status === 'rejected');
  if (hasRejection) {
    for (const r of results) {
      if (r.status === 'fulfilled') r.value.plaintext.fill(0);
    }
    for (const r of results) {
      if (r.status === 'rejected') throw r.reason;
    }
  }
  // 全部成功 → 反序列化后尽力清理明文。
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      obj[r.value.propertyName] = deserializeFromEnvelope(r.value.plaintext, r.value.property);
      r.value.plaintext.fill(0);
    }
  }
  return obj as T;
};

/**
 * 将 SQLite 实体值转换为 JS 对象值
 * @param metadata 实体元数据
 * @param entity 实体对象，键为数据库列名
 * @returns 转换后的实体对象，键为 JS 属性名
 */
export const transformEntityValueSqliteToJs = <T extends object = EntityData>(
  metadata: EntityMetadata,
  entity: EntityData
): T => {
  const result: EntityData = {};

  // 检查是否已有缓存的 FK 映射
  let cached = metadataFkCache.get(metadata);
  if (!cached) {
    const fkMap = new Map<string, string>();
    const foreignKeyNames = metadata.foreignKeyNames || [];
    const foreignKeyColumnNames = metadata.foreignKeyColumnNames || foreignKeyNames;
    for (let i = 0; i < foreignKeyColumnNames.length; i++) {
      fkMap.set(foreignKeyColumnNames[i], foreignKeyNames[i]);
    }
    cached = { fkMap };
    metadataFkCache.set(metadata, cached);
  }

  const { propertyMap, columnNameToPropertyName, computedPropertyMap } = metadata;

  const columnNames = Object.keys(entity);
  for (let i = 0; i < columnNames.length; i++) {
    const columnName = columnNames[i];
    const value = entity[columnName];

    // 查找是否是外键列名 (从 O(N) 的 indexOf 优化为 O(1) 的 Map 检索)
    const fkPropName = cached.fkMap.get(columnName);
    if (fkPropName !== undefined) {
      result[fkPropName] = value;
      continue;
    }

    // 查找是否是属性列名
    const propertyName = columnNameToPropertyName?.get(columnName);
    if (propertyName) {
      const property = propertyMap.get(propertyName);
      if (property) {
        result[propertyName] = transformValueSqliteToJs(value, property);
      }
      continue;
    }

    // 检查是否是计算属性
    const computedProperty = computedPropertyMap.get(columnName);
    if (computedProperty) {
      result[columnName] = transformValueSqliteToJs(value, computedProperty);
      continue;
    }
  }

  return result as T;
};
