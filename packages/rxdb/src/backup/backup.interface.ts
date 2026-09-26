/**
 * 归档格式标识。
 */
export const RXDB_BACKUP_FORMAT = 'rxdb-backup' as const;

/**
 * 当前归档格式版本。读到其他值一律拒绝，不做猜测性兼容。
 */
export const RXDB_BACKUP_FORMAT_VERSION = 1 as const;

/**
 * 备份范围声明（AC#14）。
 *
 * @remarks
 * 归档只含数据库；`rxdb-plugin-storage` 管理的外置文件本体**不在**其中，
 * 调用方必须另行备份，不能据此报告「完整应用备份成功」。
 */
export interface RxDBBackupScope {
  /** 数据库全部持久化状态（用户表、系统表、变更历史、keyring 非秘密元数据）。 */
  readonly database: 'included';
  /** 外置文件内容。 */
  readonly externalFiles: 'excluded';
}

/**
 * 冻结的备份范围常量。
 */
export const RXDB_BACKUP_SCOPE: RxDBBackupScope = Object.freeze({
  database: 'included',
  externalFiles: 'excluded'
});

/**
 * 归档元数据。写在归档最前面，恢复时在写入目标之前完成兼容性校验。
 */
export interface RxDBBackupManifest {
  readonly format: typeof RXDB_BACKUP_FORMAT;
  readonly formatVersion: typeof RXDB_BACKUP_FORMAT_VERSION;
  /** 快照捕获时间（ISO 8601）。 */
  readonly createdAt: string;
  readonly scope: RxDBBackupScope;
  readonly adapter: {
    /** adapter 标识，例如 `pglite`。 */
    readonly name: string;
    /** 数据库引擎，例如 `postgres`。 */
    readonly engine: string;
    /** 引擎完整版本，仅作记录。 */
    readonly engineVersion: string;
    /** 引擎数据格式兼容键；恢复时必须与目标逐字相等。 */
    readonly engineCompatibility: string;
    /** 源库加载的扩展；目标必须全部提供。 */
    readonly extensions: readonly string[];
    /** 源存储后端，例如 `memory` / `idb`，仅作记录。 */
    readonly storage: string;
  };
  readonly rxdb: {
    /** 源 RxDB 版本，仅作记录；数据兼容性由下面两个版本号决定。 */
    readonly version: string;
    readonly systemSchemaVersion: number;
    readonly changeCodecVersion: number;
  };
  /** {@link computeRxDBSchemaFingerprint} 的结果。 */
  readonly schemaFingerprint: string;
  /** 加密认证域；无加密列时为 `null`。 */
  readonly encryption: { readonly authDomain: string } | null;
}

/**
 * 目标侧的兼容性期望，由 adapter 按预先提供的目标配置算出。
 */
export interface RxDBBackupCompatibility {
  readonly adapterName: string;
  readonly engine: string;
  readonly engineCompatibility: string;
  /** 目标能提供的扩展。 */
  readonly extensions: readonly string[];
  readonly systemSchemaVersion: number;
  readonly changeCodecVersion: number;
  readonly schemaFingerprint: string;
  /** 目标的加密认证域；目标实体没有加密列时为 `null`。 */
  readonly authDomain: string | null;
}

/**
 * 归档结束标记里的汇总。
 */
export interface RxDBBackupTrailer {
  /** 条目数（文件 + 目录）。 */
  readonly entries: number;
  /** 文件数据总字节数。 */
  readonly bytes: number;
  /** 结束标记之前全部归档字节的 SHA-256。 */
  readonly sha256: string;
}

/**
 * 备份成功的结果。
 *
 * @remarks
 * 只有在归档完整写出、且输出端 `WritableStream.close()` 已 resolve 之后才会返回。
 * 输出端 close 之后的持久化（例如写盘、上传）由调用方提供的流负责。
 */
export interface RxDBBackupResult extends RxDBBackupTrailer {
  readonly manifest: RxDBBackupManifest;
  readonly scope: RxDBBackupScope;
}

/**
 * 恢复成功的结果。
 */
export interface RxDBRestoreResult extends RxDBBackupTrailer {
  readonly manifest: RxDBBackupManifest;
  readonly scope: RxDBBackupScope;
}

/**
 * 备份选项。
 */
export interface RxDBBackupOptions {
  /** 在成功提交边界之前取消；之后的取消不回退已完成的备份。 */
  readonly signal?: AbortSignal;
  /**
   * 等待一致性锁的上限（毫秒），超时抛 `lock_timeout`。
   *
   * @remarks
   * 在同一 adapter 的事务回调里调用备份会等待自己，只能靠这个上限脱困。
   *
   * @defaultValue 30000
   */
  readonly lockTimeoutMs?: number;
}

/**
 * 恢复选项。
 */
export interface RxDBRestoreOptions {
  /** 在成功提交边界之前取消。 */
  readonly signal?: AbortSignal;
}
