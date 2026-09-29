import type { RxDB } from '../RxDB.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { computeRxDBSchemaFingerprint } from './schema-fingerprint.js';

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
