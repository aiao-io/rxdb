import type { RxDBRestoreOptions } from '@aiao/rxdb';

/** 归档里记录的引擎名。 */
export const SQLITE_BACKUP_ENGINE = 'sqlite';

/**
 * 引擎数据兼容键。
 *
 * @remarks
 * 归档是逻辑转储（结构 SQL + 行字面量），不是数据库文件，SQLite 3 的 SQL 方言向后兼容，
 * 所以只按大版本判定；小版本差异里真正会破坏恢复的只有虚表模块，那一项由扩展清单单独比较。
 */
export const SQLITE_BACKUP_ENGINE_COMPATIBILITY = 'sqlite-3';

/** {@link RxDBBackupOptions.lockTimeoutMs} 的默认值。 */
export const SQLITE_BACKUP_LOCK_TIMEOUT_MS = 30_000;

/**
 * adapter 当前配置对应的存储后端，决定能否备份 / 恢复以及恢复走哪条路径。
 *
 * - `memory`：库只活在当前 adapter 实例里，恢复出来的连接由它直接接管
 * - `persistent`：库落在浏览器持久化存储里，恢复由 Web Lock 与库内标记表保护，之后正常连接即可
 * - `unsupported`：尚未交付的组合，备份与恢复都报 `unsupported_combination`
 */
export type SqliteBackupStorage =
  | {
      readonly kind: 'memory';
      /** 写进 manifest 的 `adapter.storage`，例如 `memory`。 */
      readonly label: string;
    }
  | {
      readonly kind: 'persistent';
      /** 写进 manifest 的 `adapter.storage`，例如 `idb` / `opfs`。 */
      readonly label: string;
      /** 同一份持久化库的唯一键，锁名以它为准。 */
      readonly storageKey: string;
    }
  | {
      readonly kind: 'unsupported';
      /** 导致不支持的选项名，写进错误的 `details.field`。 */
      readonly field: string;
      /** 该选项的实际值。 */
      readonly actual: string;
    };

/** 已交付备份与恢复的存储后端。 */
export type SqliteSupportedBackupStorage = Exclude<SqliteBackupStorage, { readonly kind: 'unsupported' }>;

/**
 * 恢复进行到的阶段，按顺序各触发一次。
 *
 * - `marker-written`：「恢复进行中」标记表已提交，下面开始写目标
 * - `rows-written`：结构与全部行已写入，行数与归档摘要一致
 * - `verified`：系统表水位与库结构已与 manifest / 归档核对一致
 * - `persisted`：事务已提交
 *
 * 内存目标没有标记也不需要单独落盘，只触发 `rows-written` 与 `verified`。
 */
export type SqliteRestoreStage = 'marker-written' | 'rows-written' | 'verified' | 'persisted';

/** SQLite 恢复选项。 */
export interface SqliteRestoreOptions extends RxDBRestoreOptions {
  /**
   * 阶段回调，会被 `await`。
   *
   * @remarks
   * 用于进度展示与崩溃注入测试；回调抛错等同恢复失败，会走完整的失败清理。
   */
  readonly onStage?: (stage: SqliteRestoreStage) => void | Promise<void>;
}

/**
 * 保护同一份 SQLite 持久化库的锁名。
 *
 * @param storageKey - {@link SqliteBackupStorage} 的 `storageKey`
 * @returns 锁名
 */
export const sqliteStorageLockName = (storageKey: string): string => `rxdb-sqlite-storage:${storageKey}`;
