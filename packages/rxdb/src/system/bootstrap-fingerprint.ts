/**
 * @fileoverview 引导指纹：把「表结构 + 迁移集」的标识存进 `rxdb_migration`，命中时跳过二次连接的重复引导。
 *
 * @remarks
 * 完整引导成功后写一行 `__rxdb_bootstrap__<指纹>`（与迁移行同表，水位线读法一致）。下一次连接
 * 在未认领能力守卫的同一趟只读事务里读到它，命中时仅跳过已完成的迁移事务。
 * 系统 schema 版本检查与插件引导仍运行，每次连接仍检查物理表存在性与存储约束。
 *
 * 指纹覆盖实体结构（{@link BOOTSTRAP_FINGERPRINT_KEYS}，含 `checks` / `exclusions` / `log`）、
 * 实例级存储声明与系统/接入方两条迁移链的名字，任一变化都会失配、回落完整引导。旧版本的指纹行不清理，
 * 按集合比对（{@link readBootstrapFingerprints}）。
 */

import {
  FINGERPRINT_KEYS,
  fingerprintSchemaInput,
  pickSchemaFingerprintInput
} from '../backup/schema-fingerprint-encoding.js';
import type { EntityType } from '../entity/entity.interface.js';
import type { EntityStorageOverride } from '../entity/storage-override.js';

/**
 * 引导指纹取的实体级键：备份清单那批之外还看约束（`checks` / `exclusions`）与 `log`——
 * 漂移检查与变更触发器都在它的覆盖里。与表集指纹同口径（US-314 B2.6），按「另起一份」的先例独立成表。
 */
const BOOTSTRAP_FINGERPRINT_KEYS = [...FINGERPRINT_KEYS, 'checks', 'exclusions', 'log'];

/** 引导指纹行的 `name` 前缀；与迁移行同表，前缀让读侧按形状认出来。 */
export const BOOTSTRAP_FINGERPRINT_PREFIX = '__rxdb_bootstrap__';

/** 引导指纹的输入：实体结构、实例级存储声明与两条迁移链的名字。 */
export interface BootstrapFingerprintInput {
  readonly entities: readonly EntityType[];
  readonly entityStorage?: readonly EntityStorageOverride[];
  readonly systemMigrations: readonly string[];
  readonly userMigrations: readonly string[];
}

/** 指纹行的 `name` = 前缀 + 指纹。 */
export const bootstrapFingerprintName = (fingerprint: string): string =>
  `${BOOTSTRAP_FINGERPRINT_PREFIX}${fingerprint}`;

/**
 * 从迁移名集合里读出已存的引导指纹。
 *
 * @param migrationNames - `rxdb_migration` 全表的 `name` 列，顺序无关
 * @returns 已存指纹的集合；不同版本的指纹行都会留下，命中任意一条即可跳过
 */
export const readBootstrapFingerprints = (migrationNames: readonly string[]): ReadonlySet<string> =>
  new Set(
    migrationNames
      .filter(name => name.startsWith(BOOTSTRAP_FINGERPRINT_PREFIX))
      .map(name => name.slice(BOOTSTRAP_FINGERPRINT_PREFIX.length))
  );

/**
 * 计算引导指纹。
 *
 * @param input - 见 {@link BootstrapFingerprintInput}
 * @returns 64 位十六进制 SHA-256；与实体声明顺序、迁移声明顺序无关
 */
export const computeBootstrapFingerprint = (input: BootstrapFingerprintInput): string => {
  const declared = new Map(
    (input.entityStorage ?? []).map(({ entity, ...declaration }) => [entity, declaration] as const)
  );
  return fingerprintSchemaInput({
    schema: pickSchemaFingerprintInput(input.entities, BOOTSTRAP_FINGERPRINT_KEYS, entity => ({
      entityStorage: declared.get(entity)
    })),
    migrations: {
      system: [...input.systemMigrations].sort(),
      user: [...input.userMigrations].sort()
    }
  });
};
