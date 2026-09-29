/**
 * PGlite 数据目录的跨进程独占锁与恢复标记（US-217）。
 *
 * @module pglite-host/pglite-host-lock
 */

import { RxDBAdapterDesktopError, type RxDBAdapterDesktopErrorCode } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { toHostIoError } from './pglite-host-data-dir.js';

/** 一个已持有的数据目录锁。 */
export interface PgliteDirectoryLock {
  /** 目录上是否留有未完成恢复的标记。 */
  hasMarker(): boolean;
  /** 持久化恢复标记；返回时标记已经落盘。 */
  markRestoring(): void;
  /** 删除恢复标记；返回时删除已经落盘。 */
  clearRestoring(): void;
  /** 释放锁；重复调用无副作用。 */
  release(): void;
}

/**
 * 数据目录对应的锁文件路径：与数据目录同级的隐藏文件。
 *
 * @remarks
 * 库名不能以 `.` 开头（{@link assertValidDesktopDatabaseName}），锁文件名因此不会与任何库名撞车；
 * 放在数据目录外面，恢复删除整个目录时锁与标记都还在。
 *
 * @param directory - 数据目录的物理路径
 * @returns 锁文件的物理路径
 */
export const pgliteLockPathOf = (directory: string): string =>
  join(dirname(directory), `.${basename(directory)}.rxdb-lock`);

/**
 * 取锁的脚本。
 *
 * @remarks
 * - `busy_timeout = 0`：撞锁立刻失败。`node:sqlite` 是同步接口，等锁会卡住主进程的整条线程。
 * - `locking_mode = EXCLUSIVE` + `journal_mode = DELETE`：第一个写事务拿到的 EXCLUSIVE 锁一直持有到
 *   连接关闭，别的连接连读库头都做不到。撞锁发生在 `journal_mode` 这一步——它要读库头。
 * - `synchronous = FULL`：标记的写入与删除在返回前落盘，掉电后看到的一定是最后一次提交的结果。
 */
const ACQUIRE_SQL = `
  PRAGMA busy_timeout = 0;
  PRAGMA locking_mode = EXCLUSIVE;
  PRAGMA journal_mode = DELETE;
  PRAGMA synchronous = FULL;
  BEGIN EXCLUSIVE;
  CREATE TABLE IF NOT EXISTS holder (id INTEGER PRIMARY KEY, pid INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS restore_marker (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
`;

/** SQLite 主结果码 → 桌面错误码；扩展码先取低 8 位。 */
const LOCK_ERROR_CODES = new Map<number, RxDBAdapterDesktopErrorCode>([
  [3, 'permission_denied'], // SQLITE_PERM
  [5, 'database_busy'], // SQLITE_BUSY
  [6, 'database_busy'], // SQLITE_LOCKED
  [8, 'permission_denied'], // SQLITE_READONLY
  [13, 'disk_full'], // SQLITE_FULL
  [23, 'permission_denied'] // SQLITE_AUTH
]);

const toLockError = (
  error: unknown,
  fallback: RxDBAdapterDesktopErrorCode,
  detail: string
): RxDBAdapterDesktopError => {
  const errcode = (error as { errcode?: unknown } | null | undefined)?.errcode;
  const code = typeof errcode === 'number' ? LOCK_ERROR_CODES.get(errcode & 0xff) : undefined;
  return new RxDBAdapterDesktopError(code ?? fallback, detail, { cause: error });
};

const openLockDatabase = (path: string, directory: string): DatabaseSync => {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  } catch (error) {
    throw toHostIoError(error, 'failed to create the parent of the PGlite data directory');
  }
  try {
    return new DatabaseSync(path);
  } catch (error) {
    throw toLockError(
      error,
      'open_failed',
      `failed to open the lock of PGlite data directory "${basename(directory)}"`
    );
  }
};

/**
 * 取得一个 PGlite 数据目录的独占使用权。
 *
 * @remarks
 * Node 上的 PGlite（NODEFS）自己没有任何跨进程锁：两个进程打开同一个数据目录会各自写坏对方。
 * 这里借 SQLite 的文件锁（POSIX `fcntl` / Windows `LockFileEx`）实现独占：
 *
 * - 锁由操作系统持有，进程被强杀时随之释放，不会像 pid 文件那样留下需要人工判断的陈旧锁，
 *   也不怕 pid 被复用（AC#11）；
 * - 同一进程内的第二条连接同样撞锁，同一 host 里的重复打开也被挡住；
 * - 恢复标记与锁在同一个文件里，写入在拿锁之后、提交即落盘，任何改动目标的动作都排在它后面。
 *
 * 锁文件本身从不删除：删掉一个仍被别的进程锁着的文件，后来者会在新文件上拿到「独占」，锁就裂成两把。
 *
 * @param directory - 数据目录的物理路径；不要求存在，其父目录不存在时会被创建
 * @returns 已持有的锁
 * @throws {@link RxDBAdapterDesktopError} `database_busy`：别的连接（其他进程或同一进程内）正持有该目录；
 *   `permission_denied` / `disk_full` / `open_failed`：锁文件无法创建或写入
 */
export const acquirePgliteDirectoryLock = (directory: string): PgliteDirectoryLock => {
  const db = openLockDatabase(pgliteLockPathOf(directory), directory);
  try {
    db.exec(ACQUIRE_SQL);
    db.prepare('INSERT OR REPLACE INTO holder (id, pid) VALUES (1, ?)').run(process.pid);
    db.exec('COMMIT');
  } catch (error) {
    // 关闭连接会回滚未提交的取锁事务并释放已拿到的文件锁
    db.close();
    throw toLockError(error, 'open_failed', `failed to lock PGlite data directory "${basename(directory)}"`);
  }
  let released = false;
  const markerIo = <T>(run: () => T, detail: string): T => {
    try {
      return run();
    } catch (error) {
      throw toLockError(error, 'host_internal_error', detail);
    }
  };
  return {
    hasMarker: () =>
      markerIo(
        () => db.prepare('SELECT 1 FROM restore_marker LIMIT 1').get() !== undefined,
        'failed to read the restore marker'
      ),
    markRestoring: () =>
      markerIo(() => {
        db.prepare('INSERT OR REPLACE INTO restore_marker (id, created_at) VALUES (1, ?)').run(
          new Date().toISOString()
        );
      }, 'failed to persist the restore marker'),
    clearRestoring: () =>
      markerIo(() => {
        db.exec('DELETE FROM restore_marker');
      }, 'failed to remove the restore marker'),
    release: () => {
      if (released) return;
      released = true;
      db.close();
    }
  };
};
