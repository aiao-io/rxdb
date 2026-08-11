import {
  EntityMetadata,
  EntityPropertyMetadata,
  EntityRelationMetadata,
  EntityType,
  KeyValuePropertyMetadata,
  PropertyType,
  type RxDBEntityId
} from '@aiao/rxdb';
import {
  deserializeFromEnvelope,
  EncryptedDecryptError,
  EncryptedLockedError,
  serializeForEnvelope,
  type Keyring
} from '@aiao/rxdb-adapter-encrypted';

/**
 * 加密上下文，贯穿所有可能接触加密列的 PGlite 辅助函数。
 * 当数据库没有加密列时 keyring 为 `null`，辅助函数走明文分支。
 * 与 sqlite-core 的 `EncryptionContext` 结构保持一致。
 */
export interface EncryptionContext {
  keyring: Keyring | null;
  namespace: string;
  resolveEntityMetadata?: (entity: string, namespace: string) => EntityMetadata | undefined;
}

/**
 * 保证 updatedAt 单调递增：
 * 同一毫秒内多次 update 时递增 1ms，避免同步端按 updatedAt 比较失效。
 */
export const getMonotonicUpdatedAt = <T extends EntityType>(entity: InstanceType<T>, preferred?: Date): Date => {
  const candidate = preferred ? new Date(preferred) : new Date();
  const currentRaw = entity.updatedAt;
  const current = currentRaw ? new Date(currentRaw as unknown as string | number | Date) : undefined;

  if (!current || Number.isNaN(current.getTime()) || candidate.getTime() > current.getTime()) {
    return candidate;
  }

  return new Date(current.getTime() + 1);
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
 * 与 `@aiao/rxdb-adapter-sqlite-core` 的同名函数保持对称。
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
 * PGlite 适配器错误类
 *
 * 扩展标准 Error，添加错误码和原始错误引用
 */
export class RxdbAdapterPGliteError extends Error {
  /**
   * 错误代码（例如：DUPLICATE_ENTITY, INVALID_SQL）
   */
  public readonly code?: string;

  /**
   * 原始错误对象（如果是从其他错误转换而来）
   */
  public readonly originalError?: Error;

  /**
   * @param message - 人类可读的错误描述
   * @param code - 可选错误码（如 `DUPLICATE_ENTITY`、`INVALID_SQL`），便于上层分支处理
   * @param originalError - 可选底层错误（如 PGlite 抛出的原始 Error），保留 stack
   */
  constructor(message: string, code?: string, originalError?: Error) {
    super(message, originalError ? { cause: originalError } : undefined);
    this.name = 'RxdbAdapterPGliteError';
    this.code = code;
    this.originalError = originalError;
    Object.setPrototypeOf(this, RxdbAdapterPGliteError.prototype);
  }
}

export const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

export const quoteLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/**
 * 拼出形如 `"public"."users"` 的完全限定表名（带双引号转义）。
 *
 * @param entityName - 表名
 * @param namespace - schema 名，默认 `public`
 * @returns 双引号包裹的 `"schema"."table"` 字符串，可直接插入 SQL
 */
export const getTableName = (entityName: string, namespace: string = 'public') =>
  `${quoteIdentifier(namespace)}.${quoteIdentifier(entityName)}`;

/**
 * 根据 EntityMetadata 得到完全限定表名，等价于 `getTableName(metadata.tableName, metadata.namespace)`。
 */
export const getTableNameByMetadata = (metadata: EntityMetadata) =>
  getTableName(metadata.tableName, metadata.namespace);

/**
 * PostgreSQL 协议单次查询最大参数数量（int16）。
 * 按列数将大批量数据切片，避免 INSERT ... VALUES (...) 超限。
 */
export const PG_MAX_PARAMS = 65535;

/**
 * 按参数数量上限把批量数据分片。
 * @param rows 数据行
 * @param paramsPerRow 每行占用的参数个数
 */
export const chunkByPgParamLimit = <T>(rows: T[], paramsPerRow: number): T[][] => {
  if (rows.length === 0 || paramsPerRow <= 0) return rows.length === 0 ? [] : [rows];
  const rowsPerChunk = Math.max(1, Math.floor(PG_MAX_PARAMS / paramsPerRow));
  if (rows.length <= rowsPerChunk) return [rows];
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    chunks.push(rows.slice(i, i + rowsPerChunk));
  }
  return chunks;
};

// http://www.postgres.cn/docs/17/datatype.html
type PGliteDataType =
  | 'uuid'
  | 'varchar'
  | 'jsonb'
  | 'double precision'
  | 'integer'
  | 'bigint'
  | 'bytea'
  | 'boolean'
  | 'timestamptz'
  | 'text[]'
  | 'double precision[]'
  | 'text';

/**
 * 将 RxDB 属性类型转换为 PGlite 数据类型
 *
 * 加密列无论声明的是哪种 `PropertyType`，实际都物化为 `text`——落盘的是不透明的信封字符串。
 */
export const rxDBColumnTypeToPGliteType = (property: EntityPropertyMetadata): PGliteDataType => {
  const propertyType = property.type as string;
  const storageType = (type: PGliteDataType): PGliteDataType => (property.encrypted === true ? 'text' : type);

  switch (propertyType) {
    case PropertyType.uuid:
      return storageType('uuid');
    case PropertyType.string:
    case PropertyType.enum:
      return storageType('varchar');
    case PropertyType.json:
    case PropertyType.keyValue:
      return storageType('jsonb');
    case PropertyType.number:
      // double precision 与 PropertyType.number 的运行时表示（JS number / IEEE 754）一一对应。
      // 用任意精度的 numeric 是类型撒谎：写入侧 Number(value) 早已把值截断到双精度，
      // numeric 买不到任何真实精度，却让列类型看起来能承载更多。
      return storageType('double precision');
    case PropertyType.integer:
      return storageType('integer');
    case PropertyType.bigint:
      return storageType('bigint');
    case PropertyType.binary:
      return storageType('bytea');
    case PropertyType.boolean:
      return storageType('boolean');
    case PropertyType.date:
      return storageType('timestamptz');
    case PropertyType.stringArray:
      return storageType('text[]');
    case PropertyType.numberArray:
      return storageType('double precision[]');
  }
  throw new RxdbAdapterPGliteError("rxDBColumnTypeToPGliteType: type '" + propertyType + "' not support");
};

/**
 * 获取属性的索引操作符
 * http://www.postgres.cn/docs/current/indexes-opclass.html
 */
export const rxDBColumnTypeToPGliteTypeIndexName = (property: EntityPropertyMetadata): string => {
  switch (property.type) {
    case PropertyType.uuid:
      return 'uuid_ops';
    case PropertyType.string:
    case PropertyType.enum:
      return 'bpchar_ops';
    case PropertyType.json:
      return 'jsonb_ops';
    case PropertyType.number:
      // float8_ops 对应 double precision；numeric_ops 只适用于 numeric/decimal
      return 'float8_ops';
    case PropertyType.integer:
      return 'int4_ops';
    case PropertyType.bigint:
      return 'int8_ops';
    case PropertyType.binary:
      return 'bytea_ops';
    default:
      throw new RxdbAdapterPGliteError(`rxDBColumnTypeToPGliteTypeIndexName: type '${property.type}' not support`);
  }
};

/**
 * 获取表列索引名称
 */
export const getTableColumnIndexName = (
  metadata: EntityMetadata,
  property: EntityPropertyMetadata | EntityRelationMetadata
) => `idx_${metadata.namespace}_${metadata.tableName}_${property.name}`;

/**
 * 将 JavaScript 值转换为 PostgreSQL 兼容的值
 */
/**
 * 把数值型输入转成有限数，非有限即抛。
 *
 * @param value - 待写入的值
 * @param property - 目标属性元数据（用于错误信息定位）
 * @returns 有限的 JS number
 * @throws {RxdbAdapterPGliteError} 输入无法转成有限数（`NaN` / `Infinity`）时
 *
 * @remarks
 * 裸 `Number(value)` 会把 `'abc'`、`undefined`、`{}` 静默变成 `NaN` 并落库 ——
 * PostgreSQL 的 `double precision` 同样接受 `'NaN'`，于是脏值在库里长期存活，读回时也不会报错。
 * 与「无 fallback 兜底」铁律一致，这里 fail-fast。
 *
 * **精度边界**：`PropertyType.number` 的运行时表示是 JS number（IEEE 754 双精度），
 * 有效位约 15–17 位；列类型对应 `double precision`，两侧语义一一对应，不存在
 * 「列能装下但读回丢精度」的错位。需要任意精度请改用 `PropertyType.string` 自行承载。
 */
const assertFiniteNumber = (value: unknown, property: EntityPropertyMetadata): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RxdbAdapterPGliteError(
      `Property "${property.name}" expects a finite number, received ${JSON.stringify(value)}.`
    );
  }
  return parsed;
};

const PGLITE_BIGINT_MIN = -(1n << 63n);
const PGLITE_BIGINT_MAX = (1n << 63n) - 1n;

const assertSignedBigInt = (value: unknown, property: EntityPropertyMetadata): bigint => {
  if (typeof value !== 'bigint' || value < PGLITE_BIGINT_MIN || value > PGLITE_BIGINT_MAX) {
    throw new TypeError(`Property "${property.name}" expects a signed 64-bit bigint.`);
  }
  return value;
};

const readSignedBigInt = (value: unknown, property: EntityPropertyMetadata): bigint => {
  if (typeof value === 'bigint') return assertSignedBigInt(value, property);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError(`Property "${property.name}" expects a signed 64-bit bigint.`);
};

const copyBinary = (value: unknown, property: EntityPropertyMetadata): Uint8Array => {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`Property "${property.name}" expects a Uint8Array.`);
  }
  return new Uint8Array(value);
};

export const transformValueJsToPGlite = (value: unknown, property: EntityPropertyMetadata): unknown => {
  if (value === null || value === undefined) {
    return null;
  }

  const propertyType = property.type as string;
  switch (propertyType) {
    case PropertyType.json:
    case PropertyType.keyValue:
      // PostgreSQL JSONB 原生处理 JSON
      return JSON.stringify(value);
    case PropertyType.stringArray:
      // 原生 PostgreSQL text[] 数组
      return Array.isArray(value) ? value : JSON.parse(String(value));
    case PropertyType.numberArray:
      // 原生 PostgreSQL numeric[] 数组
      return (Array.isArray(value) ? value : JSON.parse(String(value))).map(Number);
    case PropertyType.date:
      // PostgreSQL TIMESTAMPTZ 原生处理 Date 对象
      return value instanceof Date ? value.toISOString() : value;
    case PropertyType.boolean:
      return Boolean(value);
    case PropertyType.number:
    case PropertyType.integer:
      return assertFiniteNumber(value, property);
    case PropertyType.bigint:
      return assertSignedBigInt(value, property);
    case PropertyType.binary:
      return copyBinary(value, property);
    case PropertyType.enum:
    case PropertyType.string:
    case PropertyType.uuid:
      return String(value);
  }
  throw new RxdbAdapterPGliteError(`transformValueJsToPGlite: type '${propertyType}' not support`);
};

export { deserializeFromEnvelope, serializeForEnvelope } from '@aiao/rxdb-adapter-encrypted';

/**
 * 将实体值转换为 SQL 兼容格式
 *
 * @param opts 可选加密上下文；当包含 keyring 时，会自动加密 `property.encrypted === true` 的列
 */
export const transformEntityValueToSql = async (
  metadata: EntityMetadata,
  entity: object,
  opts?: EncryptionContext & { primaryKey?: RxDBEntityId }
): Promise<Record<string, unknown>> => {
  const needSave: Record<string, unknown> = {};
  const keys = Object.keys(entity);
  const { encryptedPropertyMap } = metadata;
  const hasEncryption = encryptedPropertyMap && encryptedPropertyMap.size > 0;
  const entityId = Reflect.get(entity, 'id');
  const primaryKeyValue = opts?.primaryKey ?? (entityId as RxDBEntityId | null | undefined) ?? '';

  // 兼容没有 foreignKeyNames 的情况
  const foreignKeyNames = metadata.foreignKeyNames || [];
  const foreignKeyColumnNames = metadata.foreignKeyColumnNames || foreignKeyNames;
  const transformForeignKey = (foreignKeyName: string, value: unknown): unknown => {
    const relation = metadata.foreignKeyRelationMap?.get(foreignKeyName);
    if (!relation || !opts?.resolveEntityMetadata) return value;
    const mappedMetadata = opts.resolveEntityMetadata(relation.mappedEntity, relation.mappedNamespace);
    const primaryProperty = Array.from(mappedMetadata?.propertyMap.values() ?? []).find(
      property => Reflect.get(property, 'primary') === true
    );
    return primaryProperty ? transformValueJsToPGlite(value, primaryProperty) : value;
  };

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    // 检查是否是外键 JS 属性名（如 departmentId）
    const fkIndex = foreignKeyNames.indexOf(key);
    if (fkIndex !== -1) {
      needSave[foreignKeyColumnNames[fkIndex]] = transformForeignKey(key, Reflect.get(entity, key));
      continue;
    }

    // 检查是否是外键的数据库列名（如 dept_id，已经过 normalizeCreateEntity 转换）
    const fkColIndex = foreignKeyColumnNames.indexOf(key);
    if (fkColIndex !== -1) {
      needSave[key] = transformForeignKey(foreignKeyNames[fkColIndex], Reflect.get(entity, key));
      continue;
    }

    // 先尝试用 JS 属性名查找
    const property = metadata.propertyMap.get(key);
    if (property) {
      if (hasEncryption && property.encrypted === true) {
        const raw = Reflect.get(entity, key);
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
      needSave[property.columnName] = transformValueJsToPGlite(Reflect.get(entity, key), property);
      continue;
    }

    // 再尝试用 columnName 查找（已经过 normalizeCreateEntity 转换的数据）
    const propertyName = metadata.columnNameToPropertyName?.get(key);
    if (propertyName) {
      const prop = metadata.propertyMap.get(propertyName);
      if (prop) {
        if (hasEncryption && prop.encrypted === true) {
          const raw = Reflect.get(entity, key);
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
        needSave[key] = transformValueJsToPGlite(Reflect.get(entity, key), prop);
      }
    }
  }

  return needSave;
};

/**
 * 规范化创建实体的字段（过滤可写字段）
 */
export const normalizeCreateEntity = (metadata: EntityMetadata, entity: object): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  // 处理属性
  for (const [key, property] of metadata.propertyMap) {
    if (key in entity) {
      result[property.columnName] = Reflect.get(entity, key);
    }
  }

  // 处理外键 - 兼容没有 foreignKeyColumnNames 的情况
  const foreignKeyNames = metadata.foreignKeyNames || [];
  const foreignKeyColumnNames = metadata.foreignKeyColumnNames || foreignKeyNames;
  for (let i = 0; i < foreignKeyNames.length; i++) {
    const key = foreignKeyNames[i];
    if (key in entity) {
      result[foreignKeyColumnNames[i]] = Reflect.get(entity, key);
    }
  }

  return result;
};

/**
 * 规范化实体数据，过滤掉只读字段
 */
export const normalizeEntity = (metadata: EntityMetadata, entity: object): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  for (const [key, property] of metadata.propertyMap) {
    if (key in entity && property.readonly !== true) {
      result[property.columnName] = Reflect.get(entity, key);
    }
  }

  // 处理外键 - 兼容没有 foreignKeyColumnNames 的情况
  const foreignKeyNames = metadata.foreignKeyNames || [];
  const foreignKeyColumnNames = metadata.foreignKeyColumnNames || foreignKeyNames;
  for (let i = 0; i < foreignKeyNames.length; i++) {
    const key = foreignKeyNames[i];
    if (key in entity) {
      result[foreignKeyColumnNames[i]] = Reflect.get(entity, key);
    }
  }

  return result;
};

/**
 * 将值转换为 SQL 字面量表示，用于内联查询
 * 用于批量操作中不适合使用参数化查询的情况
 * @param value - 要转换的值
 * @returns SQL 字面量字符串
 */
/**
 * PostgreSQL E'...' 转义字符串：
 * - 单引号 '' 转义
 * - 反斜线 \\ 转义
 * - NUL \0 用 \u0000 替换（PostgreSQL 不允许 text 含 NUL）
 *
 * 优先使用参数化查询；本函数仅用于必须内联字面量的批量构造场景。
 *
 * 使用单次 `replace` + 回调合并原来的三次 `replaceAll`，避免为每个字面量生成两份中间字符串。
 */
const escapePgString = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll("'", "''").replaceAll('\u0000', '\\u0000');

export const getSqlValue = (value: unknown): string => {
  if (typeof value === 'string') {
    // 使用 E'...' 前缀以显式启用反斜线转义（避免 standard_conforming_strings 变动时行为差异）
    //
    // **不按值的形状加类型标注**：此前「长得像 UUID」就补 `::uuid`，
    // 而目标列可能是 varchar —— 写入因赋值转换侥幸通过，等值比较却报
    // `operator does not exist: character varying = uuid`（42883，PGL-011）。
    // 不带标注的字面量是 `unknown` 类型，由**目标列**推导，两种列都正确。
    // 同文件的空数组字面量早就是这个口径（见下方 `'{}'` 的注释）。
    return `E'${escapePgString(value)}'`;
  }
  if (value === undefined || value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (value instanceof Uint8Array) {
    const hex = Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
    return `decode('${hex}', 'hex')`;
  }
  if (Array.isArray(value)) {
    // 空数组：`ARRAY[]` 在 PG 里是语法错误（`42601 syntax error at or near "]"`），
    // 空数组字面量必须带类型标注。用 `'{}'` 这一通用形式，由目标列的类型推导元素类型。
    if (value.length === 0) return `'{}'`;
    // PostgreSQL 数组字面量：ARRAY['val1', 'val2', ...]
    const elements = value.map(v => getSqlValue(v)).join(', ');
    return `ARRAY[${elements}]`;
  }
  if (typeof value === 'object') {
    // JSON/JSONB 值
    const escaped = escapePgString(JSON.stringify(value));
    return `E'${escaped}'::jsonb`;
  }
  return String(value);
};

/**
 * 将 PostgreSQL 参数占位符（$1、$2 等）替换为实际值
 * 用于批量操作中无法使用参数化查询的情况
 */
export const getSqlWithParams = (sql: string, params: unknown[] = []): string => {
  if (!params || params.length === 0) return sql;

  // 把 $1、$2、$3 等占位符替换成实际值
  return sql.replace(/\$(\d+)/g, (match, index) => {
    const paramIndex = parseInt(index, 10) - 1; // $1 对应 params[0]
    if (paramIndex < 0 || paramIndex >= params.length) {
      throw new RxdbAdapterPGliteError(`Parameter index ${index} out of range (have ${params.length} params)`);
    }
    return getSqlValue(params[paramIndex]);
  });
};

const requireEncryptedCellText = (value: unknown, tableName: string, columnName: string): string => {
  if (typeof value === 'string') return value;

  throw new EncryptedDecryptError({
    code: 'malformed_envelope',
    message: `column ${tableName}.${columnName} is not an envelope string`
  });
};

/**
 * 从 PGlite 结果行获取实体对象数据
 * PGlite 返回行作为对象，主要用于类型转换
 *
 * @param opts 可选加密上下文；当包含 keyring 时，自动解密 envelope 字符串列。
 *   任一列解密失败时，整行拒绝并清空已成功解密的明文（partial-failure policy）。
 */
export const getEntityObjectFromResult = async (
  metadata: EntityMetadata,
  row: Readonly<Record<string, unknown>>,
  opts?: EncryptionContext
): Promise<Record<string, unknown>> => {
  const obj: Record<string, unknown> = {};

  // 兼容没有 foreignKeyColumnNames 的情况
  const foreignKeyNames = metadata.foreignKeyNames || [];
  const foreignKeyColumnNames = metadata.foreignKeyColumnNames || foreignKeyNames;
  const columnNameToPropertyName = metadata.columnNameToPropertyName;
  const { encryptedPropertyMap } = metadata;
  const hasEncryption = encryptedPropertyMap && encryptedPropertyMap.size > 0;
  const decryptJobs: Array<{
    propertyName: string;
    property: EntityPropertyMetadata;
    rawCell: string;
  }> = [];

  const transformForeignKey = (foreignKeyName: string, value: unknown): unknown => {
    const relation = metadata.foreignKeyRelationMap?.get(foreignKeyName);
    if (!relation || !opts?.resolveEntityMetadata) return value;
    const mappedMetadata = opts.resolveEntityMetadata(relation.mappedEntity, relation.mappedNamespace);
    const primaryProperty = Array.from(mappedMetadata?.propertyMap.values() ?? []).find(
      property => Reflect.get(property, 'primary') === true
    );
    return primaryProperty ? transformValuePGliteToJs(value, primaryProperty) : value;
  };

  Object.keys(row).forEach(key => {
    const value = row[key];

    // 查找是否是外键列名
    const fkIndex = foreignKeyColumnNames.indexOf(key);
    if (fkIndex !== -1) {
      // 使用 JS 属性名
      const foreignKeyName = foreignKeyNames[fkIndex];
      obj[foreignKeyName] = transformForeignKey(foreignKeyName, value);
      return;
    }

    // 查找是否是属性列名 - 使用 columnNameToPropertyName 反向映射
    const propertyName = columnNameToPropertyName?.get(key);
    if (propertyName) {
      const property = metadata.propertyMap.get(propertyName);
      if (property) {
        if (hasEncryption && property.encrypted === true) {
          if (value === null || value === undefined) {
            obj[propertyName] = null;
            return;
          }
          if (!opts?.keyring || opts.keyring.isLocked) {
            throw new EncryptedLockedError({
              message: `keyring is locked while reading encrypted column ${metadata.tableName}.${property.columnName}`
            });
          }
          decryptJobs.push({
            propertyName,
            property,
            rawCell: requireEncryptedCellText(value, metadata.tableName, property.columnName)
          });
          return;
        }
        // PostgreSQL numeric 类型返回字符串，需要转换
        if (property.type === PropertyType.bigint || property.type === PropertyType.binary) {
          obj[propertyName] = transformValuePGliteToJs(value, property);
        } else if (property.type === PropertyType.number && typeof value === 'string') {
          obj[propertyName] = parseFloat(value);
        } else if (property.type === PropertyType.integer && typeof value === 'string') {
          obj[propertyName] = parseInt(value, 10);
        } else if (property.type === PropertyType.numberArray && Array.isArray(value)) {
          obj[propertyName] = value.map((v: unknown) => (typeof v === 'string' ? parseFloat(v) : Number(v)));
        } else if (property.type === PropertyType.keyValue) {
          obj[propertyName] = transformValuePGliteToJs(value, property);
        } else {
          obj[propertyName] = value;
        }
      }
      return;
    }

    // 如果没有 columnNameToPropertyName 映射，尝试直接使用列名作为属性名
    if (!columnNameToPropertyName) {
      const property = metadata.propertyMap.get(key);
      if (property) {
        if (hasEncryption && property.encrypted === true) {
          if (value === null || value === undefined) {
            obj[key] = null;
            return;
          }
          if (!opts?.keyring || opts.keyring.isLocked) {
            throw new EncryptedLockedError({
              message: `keyring is locked while reading encrypted column ${metadata.tableName}.${property.columnName}`
            });
          }
          decryptJobs.push({
            propertyName: key,
            property,
            rawCell: requireEncryptedCellText(value, metadata.tableName, property.columnName)
          });
          return;
        }
        if (property.type === PropertyType.bigint || property.type === PropertyType.binary) {
          obj[key] = transformValuePGliteToJs(value, property);
        } else if (property.type === PropertyType.number && typeof value === 'string') {
          obj[key] = parseFloat(value);
        } else if (property.type === PropertyType.integer && typeof value === 'string') {
          obj[key] = parseInt(value, 10);
        } else if (property.type === PropertyType.numberArray && Array.isArray(value)) {
          obj[key] = value.map((v: unknown) => (typeof v === 'string' ? parseFloat(v) : Number(v)));
        } else if (property.type === PropertyType.keyValue) {
          obj[key] = transformValuePGliteToJs(value, property);
        } else {
          obj[key] = value;
        }
        return;
      }
    }

    // 兼容直接使用列名作为外键（旧版回退：key.endsWith('Id')）
    if (metadata.isForeignKey(key)) {
      obj[key] = value;
    } else {
      // 未知属性，保持原样
      obj[key] = value;
    }
  });

  if (decryptJobs.length === 0) return obj;

  const primaryKeyValue = (obj['id'] as RxDBEntityId | null | undefined) ?? '';
  const keyring = opts!.keyring!;
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
  return obj;
};

/**
 * 将 PGlite 存储的值转换为 JS 类型
 * PostgreSQL 的 JSONB 字段已经是对象，不需要 JSON.parse
 *
 * @param value - 数据库值
 * @param property - 属性元数据
 * @returns 转换后的 JS 值
 */
type ValuePropertyMetadata = EntityPropertyMetadata | KeyValuePropertyMetadata;

export const transformValuePGliteToJs = (value: unknown, property: ValuePropertyMetadata): unknown => {
  if (value === null || value === undefined) return value;

  switch (property.type) {
    case PropertyType.date:
      // PostgreSQL timestamptz 返回 Date 对象
      if (value instanceof Date) return value;
      return typeof value === 'number' ? new Date(value) : new Date(String(value));
    case PropertyType.keyValue: {
      // PostgreSQL JSONB 已经是对象，但需要递归转换嵌套的日期等属性
      if (!value || typeof value !== 'object') return value;
      const nestedProps = property.properties;
      if (nestedProps && nestedProps.length > 0) {
        const result: Record<string, unknown> = { ...value };
        for (const nestedProp of nestedProps) {
          if (nestedProp.name in result) {
            result[nestedProp.name] = transformValuePGliteToJs(result[nestedProp.name], nestedProp);
          }
        }
        return result;
      }
      return value;
    }
    case PropertyType.json:
    case PropertyType.stringArray:
    case PropertyType.numberArray:
      // PostgreSQL JSONB 已经是对象，直接返回
      return value;
    case PropertyType.boolean:
      // PostgreSQL boolean 已经是布尔值
      return Boolean(value);
    case PropertyType.bigint:
      return readSignedBigInt(value, property);
    case PropertyType.binary:
      return copyBinary(value, property);
    default:
      return value;
  }
};

/**
 * 将实体对象中的所有值从 PGlite 格式转换为 JS 类型
 * 主要用于 RxDBChange 表的 patch/inversePatch 字段
 *
 * @param metadata - 实体元数据
 * @param entity - 实体对象
 * @returns 转换后的实体对象
 */
export const transformEntityValuePGliteToJs = (
  metadata: EntityMetadata,
  entity: Record<string, unknown>
): Record<string, unknown> => {
  Object.keys(entity).forEach(key => {
    const value = entity[key];
    const property = metadata.propertyMap.get(key);
    if (property && property.encrypted !== true) {
      entity[key] = transformValuePGliteToJs(value, property);
    }
  });
  return entity;
};
