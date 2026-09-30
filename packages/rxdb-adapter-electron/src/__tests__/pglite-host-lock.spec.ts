/**
 * PGlite 数据目录锁与恢复标记（US-217 阶段 C，AC#11 / AC#12）。
 *
 * @remarks
 * 同一进程内的第二条连接同样撞锁（`locking_mode = EXCLUSIVE`），所以这里在进程内就能模拟
 * 「另一个进程」；进程被强杀后锁随之释放的那一半由 fork 用例（`backup/electron-pglite-backup.spec.ts`）覆盖。
 */

import { RxDBAdapterDesktopError } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquirePgliteDirectoryLock, pgliteLockPathOf } from '../pglite-host/pglite-host-lock.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rxdb-pglite-host-lock-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const desktopCode = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RxDBAdapterDesktopError);
    return (error as RxDBAdapterDesktopError).code;
  }
  throw new Error('expected the call to throw');
};

describe('pgliteLockPathOf', () => {
  it('锁文件与数据目录同级、以点开头，不会与任何合法库名撞车', () => {
    expect(pgliteLockPathOf(join(root, 'app-pgdata'))).toBe(join(root, '.app-pgdata.rxdb-lock'));
  });
});

describe('acquirePgliteDirectoryLock', () => {
  it('同一目录同时只能有一个持有者；释放后别人才能拿到', () => {
    const dir = join(root, 'db');
    const first = acquirePgliteDirectoryLock(dir);

    expect(desktopCode(() => acquirePgliteDirectoryLock(dir))).toBe('database_busy');

    first.release();
    const second = acquirePgliteDirectoryLock(dir);
    second.release();
  });

  it('不同目录的锁互不影响', () => {
    const a = acquirePgliteDirectoryLock(join(root, 'a'));
    const b = acquirePgliteDirectoryLock(join(root, 'b'));

    a.release();
    b.release();
  });

  it('恢复标记跨越释放与重新取锁持续存在，清除后消失', () => {
    const dir = join(root, 'db');
    const first = acquirePgliteDirectoryLock(dir);
    expect(first.hasMarker()).toBe(false);
    first.markRestoring();
    first.release();

    const second = acquirePgliteDirectoryLock(dir);
    expect(second.hasMarker()).toBe(true);
    second.clearRestoring();
    expect(second.hasMarker()).toBe(false);
    second.release();

    const third = acquirePgliteDirectoryLock(dir);
    expect(third.hasMarker()).toBe(false);
    third.release();
  });

  it('删除数据目录不影响锁与标记：它们在目录外面', () => {
    const dir = join(root, 'db');
    mkdirSync(dir);
    const lock = acquirePgliteDirectoryLock(dir);
    lock.markRestoring();

    rmSync(dir, { recursive: true });

    expect(lock.hasMarker()).toBe(true);
    expect(existsSync(pgliteLockPathOf(dir))).toBe(true);
    lock.release();
  });

  it('重复释放无副作用', () => {
    const lock = acquirePgliteDirectoryLock(join(root, 'db'));

    lock.release();
    lock.release();
  });

  it('父目录不存在时一并创建', () => {
    const dir = join(root, 'nested', 'deeper', 'db');
    const lock = acquirePgliteDirectoryLock(dir);

    expect(existsSync(pgliteLockPathOf(dir))).toBe(true);
    lock.release();
  });

  it('锁文件不是 SQLite 库：报可判别的错误并且不留下连接', () => {
    const dir = join(root, 'db');
    writeFileSync(pgliteLockPathOf(dir), 'definitely not a sqlite database, just garbage bytes '.repeat(20));

    expect(desktopCode(() => acquirePgliteDirectoryLock(dir))).toBe('open_failed');
    expect(desktopCode(() => acquirePgliteDirectoryLock(dir))).toBe('open_failed');
  });

  it('父路径被普通文件占住：按文件系统错误上报', () => {
    writeFileSync(join(root, 'blocker'), 'x');

    expect(desktopCode(() => acquirePgliteDirectoryLock(join(root, 'blocker', 'db')))).toBe('host_internal_error');
  });

  it('释放后再读写标记：报 host_internal_error', () => {
    const lock = acquirePgliteDirectoryLock(join(root, 'db'));
    lock.release();

    expect(desktopCode(() => lock.hasMarker())).toBe('host_internal_error');
    expect(desktopCode(() => lock.markRestoring())).toBe('host_internal_error');
    expect(desktopCode(() => lock.clearRestoring())).toBe('host_internal_error');
  });
});
