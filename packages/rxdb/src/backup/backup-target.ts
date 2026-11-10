import type { RxDB } from '../RxDB.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { computeRxDBConstraintFingerprint, computeRxDBSchemaFingerprint } from './schema-fingerprint.js';

/**
 * 加密认证域：有实体声明加密列时为库名（与 keyring 的 namespace 同源），否则 `null`。
 *
 * @remarks
 * 备份端写进 manifest、恢复端拿来比较，两端必须是同一个算法，所以放在核心而不是各 adapter 里各写一份。
 *
 * @param rxdb - 已 `init()` 的实例
 * @returns 认证域
 */
export const getRxDBBackupAuthDomain = (rxdb: RxDB): string | null => {
  const encrypted = rxdb.config.entities.some(
    entity => (getEntityMetadata(entity).encryptedPropertyMap?.size ?? 0) > 0
  );
  return encrypted ? rxdb.config.dbName : null;
};

/**
 * 实体结构指纹。
 *
 * @remarks
 * 取的是 `init()` 之后的实体集合：多对多中间表、仓库生成的实体都在 `SchemaManager.init()` 里补进
 * `config.entities`，源库连过，目标还没连——两边都以「初始化后」为准才可比。
 *
 * @param rxdb - 已 `init()` 的实例
 * @returns 指纹
 */
export const getRxDBBackupSchemaFingerprint = (rxdb: RxDB): string =>
  computeRxDBSchemaFingerprint(rxdb.config.entities);

/**
 * 实体级存储约束指纹（CHECK / 条件唯一索引 / 区间排他），写进清单的 `constraintFingerprint`。
 *
 * @remarks
 * 与 {@link getRxDBBackupSchemaFingerprint} 同样取 `init()` 之后的实体集合。备份端写进清单、恢复端算出期望，
 * 两端共用这一份算法；结构指纹看不见只差这些约束的两份配置，靠它在写目标之前拒绝。
 *
 * @param rxdb - 已 `init()` 的实例
 * @returns 64 位十六进制 SHA-256
 */
export const getRxDBBackupConstraintFingerprint = (rxdb: RxDB): string =>
  computeRxDBConstraintFingerprint(rxdb.config.entities);
