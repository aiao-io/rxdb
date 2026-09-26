import type { EntityType } from '../entity/entity.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBError } from '../RxDBError.js';
import { sha256Hex } from '../system/sha256.js';
import { isSystemEntity } from '../system/system-entities.js';

/**
 * 指纹只取这些实体级字段：它们决定表结构、约束和数据语义。
 *
 * @remarks
 * `sync` / `repository` / 展示文案不改变已存数据的含义，改了它们的应用照样能读旧库，
 * 纳入指纹只会让合法恢复被误拒。`propertyMap` 之类的 Map 是数组的派生索引，canonical 规则本身会丢掉。
 */
const FINGERPRINT_KEYS = [
  'namespace',
  'name',
  'tableName',
  'extends',
  'properties',
  'computedProperties',
  'relations',
  'indexes',
  'foreignKeys',
  'features'
] as const;

/** 任何深度都不参与指纹的展示性键。 */
const IGNORED_KEYS = new Set(['displayName', 'description']);

const HEX_BYTE = Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0'));

const isDropped = (value: unknown): boolean =>
  value === undefined ||
  typeof value === 'function' ||
  typeof value === 'symbol' ||
  value instanceof Map ||
  value instanceof Set;

const encodeLeaf = (value: unknown): string | undefined => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : `{"$number":${JSON.stringify(String(value))}}`;
  }
  if (typeof value === 'bigint') return `{"$bigint":"${value.toString()}"}`;
  if (value instanceof Date) return `{"$date":${JSON.stringify(value.toISOString())}}`;
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return `{"$bytes":"${Array.from(bytes, byte => HEX_BYTE[byte]).join('')}"}`;
  }
  return undefined;
};

const encode = (value: unknown, ancestors: Set<object>): string => {
  const leaf = encodeLeaf(value);
  if (leaf !== undefined) return leaf;
  const node = value as object;
  if (ancestors.has(node)) throw new RxDBError('Schema fingerprint input contains a cycle');
  ancestors.add(node);
  const body =
    Array.isArray(node) ?
      `[${node.map(item => (isDropped(item) ? 'null' : encode(item, ancestors))).join(',')}]`
    : encodeObject(node as Record<string, unknown>, ancestors);
  ancestors.delete(node);
  return body;
};

const encodeObject = (node: Record<string, unknown>, ancestors: Set<object>): string => {
  const keys = Object.keys(node)
    .filter(key => !IGNORED_KEYS.has(key) && !isDropped(node[key]))
    .sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${encode(node[key], ancestors)}`).join(',')}}`;
};

/**
 * 把任意元数据值编码成确定的 JSON 文本（指纹的规范化输入）。
 *
 * @remarks
 * 规则：对象键按码点排序；`displayName` / `description` 在任何深度都丢弃；函数、Symbol、
 * Map、Set、`undefined` 丢弃（数组里对应位置写 `null` 以保住下标）；bigint / 日期 / 二进制 /
 * 非有限数编码成带 `$` 标签的对象。循环引用直接抛错——静默截断会让两份不同的结构撞同一指纹。
 *
 * @param value - 任意值
 * @returns 规范化 JSON 文本
 * @throws RxDBError 输入含循环引用
 * @internal
 */
export const canonicalSchemaJson = (value: unknown): string => encode(value, new Set());

/**
 * 取出参与指纹的结构：过滤系统实体、按 `namespace.name` 排序、只保留 {@link FINGERPRINT_KEYS}。
 *
 * @param entities - 实体类
 * @returns 指纹输入
 * @internal
 */
export const schemaFingerprintInput = (entities: readonly EntityType[]): Record<string, unknown>[] =>
  entities
    .filter(entity => !isSystemEntity(entity))
    .map(entity => {
      const metadata = getEntityMetadata(entity) as unknown as Record<string, unknown>;
      return Object.fromEntries(FINGERPRINT_KEYS.map(key => [key, metadata[key]]));
    })
    .sort((left, right) => {
      const leftKey = `${String(left['namespace'])}.${String(left['name'])}`;
      const rightKey = `${String(right['namespace'])}.${String(right['name'])}`;
      return leftKey < rightKey ? -1 : Number(leftKey > rightKey);
    });

/**
 * 计算实体结构指纹。
 *
 * @remarks
 * 系统实体不参与：系统表结构由 `RXDB_SYSTEM_SCHEMA_VERSION` 单独把关。与实体声明顺序无关；
 * 字段约束、字面默认值、关系、索引、外键、特性开关变化都会改变指纹，展示文案和函数默认值不会。
 *
 * @param entities - 实体类（可混入系统实体）
 * @returns 64 位十六进制 SHA-256
 *
 * @example
 * ```typescript
 * const fingerprint = computeRxDBSchemaFingerprint([Todo, Tag]);
 * ```
 */
export const computeRxDBSchemaFingerprint = (entities: readonly EntityType[]): string =>
  sha256Hex(new TextEncoder().encode(canonicalSchemaJson(schemaFingerprintInput(entities))));
