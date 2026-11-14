/**
 * @fileoverview 结构指纹的规范化编码：备份清单（`schema-fingerprint.ts`）与可写检出位的表集（US-314 B2.6）共用。
 *
 * @remarks
 * 单独成模块是为了不引系统实体：表集模块（`system/worktree-table-set.ts`）就在系统实体的引用链上，从这里取编码
 * 不会绕回 `system-entities.ts`，也就不会在模块初始化的顺序里撞上还没定义好的实体类。
 */

import type { EntityType } from '../entity/entity.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBError } from '../RxDBError.js';
import { sha256Hex } from '../system/sha256.js';

/**
 * 备份清单的指纹只取这些实体级字段：它们决定表结构、约束和数据语义。
 *
 * @remarks
 * `sync` / `repository` / 展示文案不改变已存数据的含义，改了它们的应用照样能读旧库，
 * 纳入指纹只会让合法恢复被误拒。`propertyMap` 之类的 Map 是数组的派生索引，canonical 规则本身会丢掉。
 * 已有备份的指纹按这份算，往里加键就全对不上、恢复不了；要多看几样的另起一份（见表集指纹）。
 *
 * @internal
 */
export const FINGERPRINT_KEYS = [
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

/** 用户键以 `$` 开头时再加一个 `$`：单个 `$` 开头的键只留给类型标签，编码保持单射。 */
const escapeKey = (key: string): string => (key.startsWith('$') ? `$${key}` : key);

const encodeObject = (node: Record<string, unknown>, ancestors: Set<object>): string => {
  const keys = Object.keys(node)
    .filter(key => !IGNORED_KEYS.has(key) && !isDropped(node[key]))
    .sort();
  return `{${keys.map(key => `${JSON.stringify(escapeKey(key))}:${encode(node[key], ancestors)}`).join(',')}}`;
};

/**
 * 把任意元数据值编码成确定的 JSON 文本（指纹的规范化输入）。
 *
 * @remarks
 * 规则：对象键按码点排序；`displayName` / `description` 在任何深度都丢弃；函数、Symbol、
 * Map、Set、`undefined` 丢弃（数组里对应位置写 `null` 以保住下标）；bigint / 日期 / 二进制 /
 * 非有限数编码成带 `$` 标签的对象；用户对象里以 `$` 开头的键多加一个 `$`，不会与标签同形。
 * 循环引用直接抛错——静默截断会让两份不同的结构撞同一指纹。
 *
 * @param value - 任意值
 * @returns 规范化 JSON 文本
 * @throws RxDBError 输入含循环引用
 * @internal
 */
export const canonicalSchemaJson = (value: unknown): string => encode(value, new Set());

/**
 * 按给定的实体级键取出参与指纹的结构，按 `namespace.name` 排序（与声明顺序无关）。
 *
 * @param entities - 实体类；不在这里滤系统实体
 * @param keys - 取哪些实体级字段
 * @param extraOf - 每个实体在这些字段之外并进去的结构（表集指纹并上实例级存储声明）；值为 `undefined` 的键编码时丢掉
 * @returns 指纹输入
 * @internal
 */
export const pickSchemaFingerprintInput = (
  entities: readonly EntityType[],
  keys: readonly string[],
  extraOf?: (entity: EntityType) => Readonly<Record<string, unknown>>
): Record<string, unknown>[] =>
  entities
    .map(entity => {
      const metadata = getEntityMetadata(entity) as unknown as Record<string, unknown>;
      return { ...Object.fromEntries(keys.map(key => [key, metadata[key]])), ...extraOf?.(entity) };
    })
    .sort((left, right) => {
      const leftKey = `${String(left['namespace'])}.${String(left['name'])}`;
      const rightKey = `${String(right['namespace'])}.${String(right['name'])}`;
      return leftKey < rightKey ? -1 : Number(leftKey > rightKey);
    });

/**
 * 指纹输入的 SHA-256。
 *
 * @param input - {@link pickSchemaFingerprintInput} 一类的结构
 * @returns 64 位十六进制
 * @internal
 */
export const fingerprintSchemaInput = (input: unknown): string =>
  sha256Hex(new TextEncoder().encode(canonicalSchemaJson(input)));
