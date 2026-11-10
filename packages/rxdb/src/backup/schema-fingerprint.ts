import type { EntityType } from '../entity/entity.interface.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import {
  expectedCheckConstraintNames,
  expectedConditionalUniqueIndexNames,
  expectedExclusionConstraintNames
} from '../system/constraint-drift.js';
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

/** 一个实体的存储约束：漂移检查比对的同一组确定性约束名（各自排序，与声明顺序无关）。 */
const constraintNamesOf = (metadata: EntityMetadata) => ({
  entity: `${metadata.namespace}.${metadata.name}`,
  checks: expectedCheckConstraintNames(metadata).sort(),
  uniques: expectedConditionalUniqueIndexNames(metadata).sort(),
  exclusions: expectedExclusionConstraintNames(metadata).sort()
});

/**
 * 计算实体级存储约束的指纹：每个非系统实体的 CHECK（`ck_`）、条件唯一索引（`uq_`）与区间排他（`ex_`）约束名。
 *
 * @remarks
 * 不并进 {@link computeRxDBSchemaFingerprint}：那份的键已被已有归档钉死，往里加键会让已有备份全部失配。
 * 约束名本身就是规范化定义的哈希，覆盖继承来的约束与属性级语法糖；恢复前比它，与恢复后 `connect()`
 * 的约束漂移检查是同一口径。
 *
 * @param entities - 实体类（可混入系统实体）
 * @returns 64 位十六进制 SHA-256；与声明顺序无关
 * @internal
 */
export const computeRxDBConstraintFingerprint = (entities: readonly EntityType[]): string =>
  fingerprintSchemaInput(
    entities
      .filter(entity => !isSystemEntity(entity))
      .map(entity => constraintNamesOf(getEntityMetadata(entity)))
      .sort((left, right) => (left.entity < right.entity ? -1 : Number(left.entity > right.entity)))
  );
