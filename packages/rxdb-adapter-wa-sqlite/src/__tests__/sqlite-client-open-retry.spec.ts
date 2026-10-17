import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SQLITE_OK } from 'wa-sqlite';
import type { SupportVFS } from '../sqlite.interface.js';
import type { SQLiteAPI, SQLiteVFS } from '../wa-sqlite.interface.js';

/**
 * @fileoverview US-221：浏览器客户端打开库时哪些 VFS 退避重试、每次重试是不是一次完整的打开。
 *
 * @remarks
 * 注入假的 `waSqliteLoad` 与上游 `OPFSCoopSyncVFS` 工厂，把接线钉死；真实 Worker 占句柄的复现在 `opfs-reload-race.spec.ts`。
 */

const state = vi.hoisted(() => ({
  load: vi.fn(),
  coopSyncCreate: vi.fn()
}));

vi.mock('../sqlite-load.utils.js', async importOriginal => {
  const original = await importOriginal<typeof import('../sqlite-load.utils.js')>();
  return { ...original, waSqliteLoad: state.load };
});

vi.mock('../vfs-modules.js', async importOriginal => {
  const original = await importOriginal<typeof import('../vfs-modules.js')>();
  return {
    VFS_MODULES: {
      ...original.VFS_MODULES,
      OPFSCoopSyncVFS: async () => ({ OPFSCoopSyncVFS: { create: state.coopSyncCreate } })
    }
  };
});

import { WaSqliteClient } from '../SqliteClient.js';
import { WA_SQLITE_VFS_LIST } from '../sqlite-load.utils.js';

interface FakeSQLite extends SQLiteAPI {
  open_v2: Mock<SQLiteAPI['open_v2']>;
}

const createFakeSQLite = (): FakeSQLite =>
  ({
    close: vi.fn().mockResolvedValue(SQLITE_OK),
    create_function: vi.fn(() => SQLITE_OK),
    open_v2: vi.fn<SQLiteAPI['open_v2']>().mockResolvedValue(42),
    set_authorizer: vi.fn(() => SQLITE_OK),
    statements: vi.fn(async function* () {
      yield* [];
    }),
    update_hook: vi.fn()
  }) as unknown as FakeSQLite;

/** 一次加载：新的模块与新的 VFS，记下加载时的（假）时刻。 */
interface Attempt {
  readonly sqlite3: FakeSQLite;
  readonly vfs: SQLiteVFS & { close: Mock<() => void> };
  readonly at: number;
}

/** `open_v2` 打开失败时抛的形状：`SQLiteError` 带 `code`。 */
const sqliteError = (code: number) => Object.assign(new Error('sqlite3_open_v2'), { code });
const SQLITE_CANTOPEN = 14;

/**
 * 每次 `waSqliteLoad` 都交出新的模块与 VFS，`open_v2` 依次按 `outcomes` 失败；排完了就打开成功。
 *
 * @returns 每次加载的记录
 */
const loadAttempts = (outcomes: Error[]): Attempt[] => {
  const start = Date.now();
  const attempts: Attempt[] = [];
  state.load.mockImplementation(async () => {
    const sqlite3 = createFakeSQLite();
    const failure = outcomes.shift();
    if (failure) sqlite3.open_v2.mockRejectedValue(failure);
    const attempt: Attempt = { sqlite3, vfs: { close: vi.fn() } as unknown as Attempt['vfs'], at: Date.now() - start };
    attempts.push(attempt);
    return { sqlite3, vfs: attempt.vfs };
  });
  return attempts;
};

beforeEach(() => {
  state.load.mockReset();
  state.coopSyncCreate.mockReset();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WaSqliteClient · 打开撞上同步访问句柄被占（US-221）', () => {
  it('OPFSCoopSyncVFS 撞 SQLITE_CANTOPEN：按 50、100 毫秒退避，每次重新加载模块与 VFS、关掉失败那次的 VFS，句柄放开后打开成功', async () => {
    const attempts = loadAttempts([sqliteError(SQLITE_CANTOPEN), sqliteError(SQLITE_CANTOPEN)]);
    const client = new WaSqliteClient();

    const opening = client.init('reload-race', { vfs: 'OPFSCoopSyncVFS', worker: true, async: false });
    await vi.runAllTimersAsync();
    await opening;

    expect(attempts.map(attempt => attempt.at)).toEqual([0, 50, 150]);
    expect(attempts.map(attempt => attempt.vfs.close.mock.calls.length)).toEqual([1, 1, 0]);
    for (const attempt of attempts) expect(attempt.sqlite3.open_v2).toHaveBeenCalledWith('reload-race.sqlite');
  });

  it('OPFSCoopSyncVFS 的其它打开错误不重试，原样失败', async () => {
    const notADatabase = sqliteError(26);
    const attempts = loadAttempts([notADatabase]);

    await expect(new WaSqliteClient().init('db', { vfs: 'OPFSCoopSyncVFS', worker: true, async: false })).rejects.toBe(
      notADatabase
    );
    expect(attempts).toHaveLength(1);
  });

  it.each<SupportVFS>([
    'MemoryVFS',
    'MemoryAsyncVFS',
    'IDBBatchAtomicVFS',
    'IDBMirrorVFS',
    'AccessHandlePoolVFS',
    'OPFSAdaptiveVFS',
    'OPFSAnyContextVFS',
    'OPFSWriteAheadVFS'
  ])('%s 撞 SQLITE_CANTOPEN 不重试，原样失败', async vfs => {
    const cantOpen = sqliteError(SQLITE_CANTOPEN);
    const attempts = loadAttempts([cantOpen]);

    await expect(new WaSqliteClient().init('db', { vfs, worker: true })).rejects.toBe(cantOpen);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].vfs.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('OPFSCoopSyncVFS 的 close() 交出上游登记在 persistentFiles 上的句柄：上游没有 close，失败那次的 VFS 靠它放手', async () => {
    const journal = { close: vi.fn() };
    const persistentFiles = new Map([['/db.sqlite-journal', { accessHandle: journal as { close: Mock } | null }]]);
    state.coopSyncCreate.mockResolvedValue({ close: () => undefined, persistentFiles });
    const config = WA_SQLITE_VFS_LIST.find(candidate => candidate.name === 'OPFSCoopSyncVFS')!;

    const vfs = await (await config.vfsModule()).create('OPFSCoopSyncVFS', {});
    await vfs.close();

    expect(journal.close).toHaveBeenCalledOnce();
    expect(persistentFiles.get('/db.sqlite-journal')!.accessHandle).toBeNull();
  });
});
