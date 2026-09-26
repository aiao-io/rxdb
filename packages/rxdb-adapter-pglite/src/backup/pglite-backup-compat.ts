import type { RxDB } from '@aiao/rxdb';
import {
  computeRxDBSchemaFingerprint,
  getEntityMetadata,
  getRxDBSystemVersionState,
  RXDB_CHANGE_CODEC_VERSION,
  RXDB_CHANGE_CODEC_WATERMARK_PREFIX,
  RXDB_SYSTEM_SCHEMA_VERSION,
  RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
  RxDBBackupError,
  RxDBMigration,
  type RxDBBackupCompatibility,
  type RxDBSystemVersionState
} from '@aiao/rxdb';
import { PGlite, type Results } from '@electric-sql/pglite';
import { ADAPTER_NAME, type PGliteClientOptions } from '../pglite.interface.js';
import { getTableNameByMetadata } from '../pglite.utils.js';

/** 归档里记录的引擎名。 */
export const PGLITE_BACKUP_ENGINE = 'postgres';

/** 能执行只读查询的最小接口：PGlite 实例与 {@link IPGliteClient} 都满足。 */
export interface PGliteQueryable {
  query<T>(query: string, params?: unknown[]): Promise<Results<T>>;
}

/** 引擎版本与数据格式兼容键。 */
export interface PGliteEngineInfo {
  /** `SHOW server_version` 的原文。 */
  readonly version: string;
  /** `postgres-<major>`：PostgreSQL 只保证同一大版本内数据目录可互通。 */
  readonly compatibility: string;
}

/** 数据目录所在的存储后端；只有这两种声明支持备份与恢复。 */
export type PGliteBackupStorage =
  | { readonly kind: 'memory' }
  | {
      readonly kind: 'idb';
      /** `idb://` 之后的部分。 */
      readonly name: string;
      /** 规范化的 `dataDir` 原文，锁名与恢复标记都以它为键。 */
      readonly storageKey: string;
    };

/**
 * 读引擎版本并算出兼容键。
 *
 * @param db - 已就绪的 PGlite 或客户端
 * @returns 引擎信息
 */
export const readPGliteEngineInfo = async (db: PGliteQueryable): Promise<PGliteEngineInfo> => {
  const result = await db.query<{ server_version: string }>('SHOW server_version');
  const version = result.rows[0].server_version;
  return { version, compatibility: `${PGLITE_BACKUP_ENGINE}-${version.split('.')[0]}` };
};

let probe: Promise<PGliteEngineInfo> | undefined;

/**
 * 当前 realm 里 PGlite 运行时的引擎信息。
 *
 * @remarks
 * 恢复必须在写入目标之前判定兼容性，而那时目标还不存在，只能另起一个一次性内存实例问版本。
 * 同一个 bundle 里 PGlite 的 PostgreSQL 版本是固定的，所以结果按 realm 缓存；失败不缓存。
 *
 * @returns 引擎信息
 */
export const probePGliteEngineInfo = (): Promise<PGliteEngineInfo> => {
  probe ??= (async () => {
    const pg = new PGlite();
    try {
      await pg.waitReady;
      return await readPGliteEngineInfo(pg);
    } finally {
      await pg.close();
    }
  })().catch((error: unknown) => {
    probe = undefined;
    throw error;
  });
  return probe;
};

/**
 * 读库里的系统表结构 / 变更编码水位。
 *
 * @param db - 已就绪的 PGlite 或客户端
 * @returns 水位
 */
export const readPGliteSystemVersionState = async (db: PGliteQueryable): Promise<RxDBSystemVersionState> => {
  const migrationTable = getTableNameByMetadata(getEntityMetadata(RxDBMigration));
  const result = await db.query<{ name: string }>(
    `SELECT "name" FROM ${migrationTable}
     WHERE left("name", $1::integer) = $2::text OR left("name", $3::integer) = $4::text`,
    [
      RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX.length,
      RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
      RXDB_CHANGE_CODEC_WATERMARK_PREFIX.length,
      RXDB_CHANGE_CODEC_WATERMARK_PREFIX
    ]
  );
  return getRxDBSystemVersionState(result.rows.map(row => row.name));
};

/**
 * 按规范化后的 `dataDir` 判定存储后端。
 *
 * @param dataDir - {@link resolvePGliteInitOptions} 的 `dataDir`
 * @param operation - 用于错误信息
 * @returns 存储后端
 * @throws RxDBBackupError `unsupported_combination` OPFS-AHP、Node 文件系统等尚未交付的后端
 */
export const resolvePGliteBackupStorage = (dataDir: string | undefined, operation: string): PGliteBackupStorage => {
  if (dataDir === undefined || dataDir === 'memory://') return { kind: 'memory' };
  if (dataDir.startsWith('idb://') && dataDir.length > 'idb://'.length) {
    return { kind: 'idb', name: dataDir.slice('idb://'.length), storageKey: dataDir };
  }
  throw new RxDBBackupError('unsupported_combination', `PGlite ${operation} does not support storage "${dataDir}"`, {
    details: { field: 'dataDir', actual: dataDir }
  });
};

/**
 * 归档记录的扩展名：用户配置的扩展，去掉适配器自己强制注入的 `live`。
 *
 * @param options - 用户选项
 * @returns 排序后的扩展名
 */
export const pgliteBackupExtensions = (options: PGliteClientOptions): string[] =>
  Object.keys(options.extensions ?? {})
    .filter(name => name !== 'live')
    .sort();

/**
 * 加密认证域：有实体声明加密列时为库名（与 keyring 的 namespace 同源），否则 `null`。
 *
 * @param rxdb - 已 `init()` 的实例
 * @returns 认证域
 */
export const pgliteBackupAuthDomain = (rxdb: RxDB): string | null => {
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
export const pgliteBackupFingerprint = (rxdb: RxDB): string => computeRxDBSchemaFingerprint(rxdb.config.entities);

/**
 * 目标侧的兼容性期望。
 *
 * @param rxdb - 目标实例（会被 `init()`，但不会连接）
 * @param options - 目标 adapter 选项
 * @returns 兼容性期望
 */
export const pgliteTargetCompatibility = async (
  rxdb: RxDB,
  options: PGliteClientOptions
): Promise<RxDBBackupCompatibility> => {
  rxdb.init();
  const engine = await probePGliteEngineInfo();
  return {
    adapterName: ADAPTER_NAME,
    engine: PGLITE_BACKUP_ENGINE,
    engineCompatibility: engine.compatibility,
    extensions: pgliteBackupExtensions(options),
    systemSchemaVersion: RXDB_SYSTEM_SCHEMA_VERSION,
    changeCodecVersion: RXDB_CHANGE_CODEC_VERSION,
    schemaFingerprint: pgliteBackupFingerprint(rxdb),
    authDomain: pgliteBackupAuthDomain(rxdb)
  };
};
