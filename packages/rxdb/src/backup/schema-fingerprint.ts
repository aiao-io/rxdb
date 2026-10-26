import type { EntityType } from '../entity/entity.interface.js';
import { isSystemEntity } from '../system/system-entities.js';
import { FINGERPRINT_KEYS, fingerprintSchemaInput, pickSchemaFingerprintInput } from './schema-fingerprint-encoding.js';

export { canonicalSchemaJson } from './schema-fingerprint-encoding.js';

/**
 * 取出参与指纹的结构：过滤系统实体、按 `namespace.name` 排序、只保留备份清单的那些键。
 *
 * @param entities - 实体类
 * @returns 指纹输入
 * @internal
 */
export const schemaFingerprintInput = (entities: readonly EntityType[]): Record<string, unknown>[] =>
  pickSchemaFingerprintInput(
    entities.filter(entity => !isSystemEntity(entity)),
    FINGERPRINT_KEYS
  );

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
  fingerprintSchemaInput(schemaFingerprintInput(entities));
