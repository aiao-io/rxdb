import type { RxDB } from '../RxDB.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBError } from '../RxDBError.js';
import { assertIdentityBinding, getRxDBIdentityKey, RxDBIdentityMismatchError } from '../system/identity-binding.js';
import { RxDBBackupError } from './backup-error.js';
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

/**
 * 恢复之前核对归档里的库绑定的身份（US-040）：库绑定了别的身份就拒绝，一个身份的备份不能恢复进另一个身份的库。
 *
 * @param rxdb - 恢复目标的实例
 * @param migrationNames - 恢复出来的库里 `rxdb_migration` 全表的 `name` 列，顺序无关
 * @throws {@link RxDBBackupError} `incompatible_archive`（`details.field` 为 `identity`）：库里绑定的是别的身份；
 *   `corrupt_archive`（同一字段）：库里的首次绑定没有完成
 *
 * @remarks
 * 目标没有声明 `identity`、库没有绑定、或绑定的正是目标的身份时放行；没有绑定的库由第一次连接就地绑定到目标的身份
 * （US-035）。判定与打开库时用的是同一个原语，两处口径不会分叉。各 adapter 在恢复事务提交之前调用，拒绝时整笔回滚。
 */
export const assertRxDBRestoreIdentity = (rxdb: RxDB, migrationNames: readonly string[]): void => {
  const { identity } = rxdb.config;
  if (identity === undefined) return;
  try {
    assertIdentityBinding(migrationNames, getRxDBIdentityKey(identity));
  } catch (error) {
    if (error instanceof RxDBIdentityMismatchError)
      throw new RxDBBackupError('incompatible_archive', 'Backup archive belongs to another identity', {
        details: { field: 'identity' },
        cause: error
      });
    if (error instanceof RxDBError)
      throw new RxDBBackupError('corrupt_archive', 'Backup archive has an incomplete identity claim', {
        details: { field: 'identity' },
        cause: error
      });
    throw error;
  }
};
