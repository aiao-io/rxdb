import type { RxDB } from '@aiao/rxdb';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BoardShellController,
  browserBoardShellRuntime,
  type BoardBackupAdapter,
  type BoardShellOptions,
  type BoardShellRuntime
} from '../board-shell.js';
import { ACTIVE_DB_KEY, PENDING_SWITCH_KEY, RESTORE_TARGET_KEY, RESTORING_MARKER_KEY } from '../board-storage.js';

/** 一个库在假存储里的样子：看板数、是否有没做完的恢复。 */
interface StoredDb {
  boards: number;
  incomplete: boolean;
}

/**
 * 内存世界：库的存储 + 外壳运行时（localStorage / 锁 / 库名列表 / storage 事件 / 重载 / 下载）。
 * 假实例只实现外壳用到的那几个方法；真实 sqlite-wasm 闭环由 demo 与三端宿主的 e2e 验收。
 */
const createWorld = () => {
  const dbs = new Map<string, StoredDb>();
  const storage = new Map<string, string>();
  const listeners = new Set<(key: string | null, value: string | null) => void>();
  const connected = new Set<string>();
  const failConnect = new Set<string>();
  const failDisconnect = new Set<string>();
  let tail: Promise<unknown> = Promise.resolve();
  let held = false;
  const world = {
    dbs,
    storage,
    connected,
    failConnect,
    failDisconnect,
    /** 另一页面占着恢复锁。 */
    otherPageHoldsLock: false,
    listFailure: null as Error | null,
    backupMethods: true,
    reload: vi.fn(),
    download: vi.fn<(archive: Blob, fileName: string) => void>(),
    emitStorage: (key: string | null, value: string | null) => listeners.forEach(listener => listener(key, value)),
    listenerCount: () => listeners.size,
    runtime: undefined as unknown as BoardShellRuntime
  };
  world.runtime = {
    storage: {
      get: key => storage.get(key) ?? null,
      set: (key, value) => void storage.set(key, value),
      remove: key => void storage.delete(key)
    },
    withLock: async (operation, wait) => {
      if (!wait && (held || world.otherPageHoldsLock)) throw new Error('另一页面正在准备或恢复看板，请稍后重试');
      const run = tail.then(async () => {
        held = true;
        try {
          return await operation();
        } finally {
          held = false;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
    listDatabases: async () => {
      if (world.listFailure) throw world.listFailure;
      return [...dbs.keys()];
    },
    watchStorage: listener => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    reload: world.reload,
    download: world.download
  };
  return world;
};

type World = ReturnType<typeof createWorld>;

const createRxdbIn =
  (world: World) =>
  (dbName: string): RxDB => {
    const adapter: BoardBackupAdapter = {
      backup: async sink => {
        const writer = sink.getWriter();
        await writer.write(new TextEncoder().encode(`archive:${world.dbs.get(dbName)?.boards ?? 0}`));
        await writer.close();
      },
      restore: async source => {
        const text = await new Response(source).text();
        if (!text.startsWith('archive:')) throw new Error('归档已损坏');
        world.dbs.set(dbName, { boards: Number(text.slice('archive:'.length)), incomplete: false });
      },
      cleanupIncompleteRestore: async () => {
        const stored = world.dbs.get(dbName);
        if (!stored?.incomplete) return false;
        world.dbs.delete(dbName);
        return true;
      },
      dropStorage: async () => void world.dbs.delete(dbName)
    };
    return {
      config: { dbName: `${dbName}@0_1` },
      connect: vi.fn(async () => {
        if (world.failConnect.has(dbName)) throw new Error(`连接 ${dbName} 失败`);
        if (!world.dbs.has(dbName)) world.dbs.set(dbName, { boards: 0, incomplete: false });
        world.connected.add(dbName);
      }),
      disconnectAll: vi.fn(async () => {
        world.connected.delete(dbName);
        if (world.failDisconnect.has(dbName)) throw new Error(`断开 ${dbName} 失败`);
      }),
      getAdapter: async () => (world.backupMethods ? adapter : { connect: adapter.backup }),
      entityManager: {
        getRepository: () => ({
          count: () => of(world.dbs.get(dbName)?.boards ?? 0),
          find: () => of([])
        })
      }
    } as unknown as RxDB;
  };

const seedIn = (world: World) =>
  vi.fn(async (rxdb: RxDB) => {
    world.dbs.get(rxdb.config.dbName.split('@')[0])!.boards = 2;
  });

const createShell = (world: World, overrides: Partial<BoardShellOptions> = {}): BoardShellController =>
  new BoardShellController({
    createRxdb: createRxdbIn(world),
    adapterName: 'sqlite-wasm',
    seed: seedIn(world),
    runtime: world.runtime,
    ...overrides
  });

const archiveOf = (text: string): Blob => new Blob([text]);

/** 等外壳回到可交互状态（确认框出现或流程结束）。 */
const settled = async (): Promise<void> => {
  for (let index = 0; index < 5; index++) await new Promise(resolve => setTimeout(resolve, 0));
};

describe('BoardShellController（US-537 宿主编排 / US-539 AC#4 / #5）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('没有活动位置：停在启动选择，选择前不连接、不建库', async () => {
    const world = createWorld();
    const shell = createShell(world);
    await shell.start();
    expect(shell.state.phase).toBe('startup');
    expect(shell.state.canSeed).toBe(true);
    expect(world.dbs.size).toBe(0);
  });

  it('新建空看板 / 装载演示数据：在新库名上建库，成功才写活动位置', async () => {
    const world = createWorld();
    const shell = createShell(world);
    await shell.start();
    await shell.startEmpty();
    expect(shell.state.phase).toBe('board');
    expect(world.storage.get(ACTIVE_DB_KEY)).toBe('rxdb-board-restore-0');
    expect(world.dbs.get('rxdb-board-restore-0')?.boards).toBe(0);

    const seeded = createShell(createWorld());
    await seeded.start();
    await seeded.startSeed();
    expect(seeded.state.rxdb?.config.dbName).toBe('rxdb-board-restore-0@0_1');
  });

  it('有活动位置：启动直接打开活动库；活动位置被别的页面改写时本页重载', async () => {
    const world = createWorld();
    world.storage.set(ACTIVE_DB_KEY, 'rxdb-board-restore-3');
    world.dbs.set('rxdb-board-restore-3', { boards: 1, incomplete: false });
    const shell = createShell(world);
    await shell.start();
    expect(shell.state.phase).toBe('board');
    expect(world.connected.has('rxdb-board-restore-3')).toBe(true);

    world.emitStorage(RESTORING_MARKER_KEY, '1');
    world.emitStorage(ACTIVE_DB_KEY, 'rxdb-board-restore-3');
    world.emitStorage(ACTIVE_DB_KEY, null);
    expect(world.reload).not.toHaveBeenCalled();
    world.emitStorage(ACTIVE_DB_KEY, 'rxdb-board-restore-4');
    expect(world.reload).toHaveBeenCalledOnce();
    expect(shell.state.phase).toBe('loading');
  });

  it('另一页面留着恢复中标记：启动时先显示恢复中，等锁后清理再打开', async () => {
    const world = createWorld();
    world.storage.set(RESTORING_MARKER_KEY, '1');
    const shell = createShell(world);
    const started = shell.start();
    expect(shell.state.phase).toBe('restoring');
    await started;
    expect(shell.state.phase).toBe('startup');
    expect(world.storage.has(RESTORING_MARKER_KEY)).toBe(false);
  });

  it('重置为演示数据：取消零写；确认后避让现存库名、断开旧库并打开新库', async () => {
    const world = createWorld();
    const shell = createShell(world);
    await shell.start();
    await shell.startSeed();
    const first = shell.state.rxdb!;

    const cancelled = shell.resetDemo();
    await settled();
    expect(shell.state.confirm?.title).toBe('重置为演示数据');
    shell.settleConfirm(false);
    await cancelled;
    expect(shell.state.rxdb).toBe(first);
    expect(world.dbs.size).toBe(1);

    const confirmed = shell.resetDemo();
    await settled();
    shell.settleConfirm(true);
    await confirmed;
    expect(world.storage.get(ACTIVE_DB_KEY)).toBe('rxdb-board-restore-1');
    expect(first.disconnectAll).toHaveBeenCalled();

    // 第三次：restore-0 仍在库里，回绕时也要避开它
    const again = shell.resetDemo();
    await settled();
    shell.settleConfirm(true);
    await again;
    expect(world.storage.get(ACTIVE_DB_KEY)).toBe('rxdb-board-restore-2');
  });

  it('演示数据只进新库；宿主不提供种子时没有演示入口；失败时释放并删除本次新建的库', async () => {
    // 库名列表过时，选中了原本就有看板的库：拒绝装载，也不能当成新库删掉
    const world = createWorld();
    world.dbs.set('rxdb-board-restore-0', { boards: 1, incomplete: false });
    const nonEmpty = createShell(world, { runtime: { ...world.runtime, listDatabases: async () => [] } });
    await nonEmpty.start();
    await nonEmpty.startSeed();
    expect(nonEmpty.state.phase).toBe('startup');
    expect(nonEmpty.state.error).toBe('演示数据只能装进新库');
    expect(world.dbs.get('rxdb-board-restore-0')?.boards).toBe(1);

    const failingSeed = createWorld();
    const seedFails = createShell(failingSeed, {
      seed: async () => {
        throw new Error('种子写入失败');
      }
    });
    await seedFails.start();
    await seedFails.startSeed();
    expect(seedFails.state.error).toBe('种子写入失败');
    expect(failingSeed.dbs.size).toBe(0);

    const bare = createShell(createWorld(), { seed: undefined });
    await bare.start();
    expect(bare.state.canSeed).toBe(false);
    await bare.startSeed();
    expect(bare.state.error).toBe('宿主没有提供演示数据');

    const broken = createWorld();
    broken.failConnect.add('rxdb-board-restore-0');
    broken.failDisconnect.add('rxdb-board-restore-0');
    const shell = createShell(broken);
    await shell.start();
    await shell.startEmpty();
    expect(shell.state.error).toBe('连接 rxdb-board-restore-0 失败；看板连接释放失败：断开 rxdb-board-restore-0 失败');
  });

  it('从备份恢复：已有看板先确认；恢复到新库名、写待切换记录后整页重载', async () => {
    const world = createWorld();
    const shell = createShell(world);
    await shell.start();
    await shell.startSeed();

    const declined = shell.restoreFromFile(archiveOf('archive:5'));
    await settled();
    expect(shell.state.confirm?.title).toBe('从备份恢复');
    shell.settleConfirm(false);
    await declined;
    expect(world.storage.has(RESTORE_TARGET_KEY)).toBe(false);

    const restoring = shell.restoreFromFile(archiveOf('archive:5'));
    await settled();
    shell.settleConfirm(true);
    await restoring;
    expect(world.dbs.get('rxdb-board-restore-1')?.boards).toBe(5);
    expect(world.storage.get(PENDING_SWITCH_KEY)).toBe('rxdb-board-restore-1');
    expect(world.storage.get(RESTORE_TARGET_KEY)).toBe('rxdb-board-restore-1');
    expect(world.storage.get(RESTORING_MARKER_KEY)).toBe('1');
    expect(world.storage.get(ACTIVE_DB_KEY)).toBe('rxdb-board-restore-0');
    expect(shell.state.phase).toBe('restoring');
    expect(shell.state.restore).toMatchObject({ state: 'switching', restoringMarker: true, pendingSwitch: true });
    expect(world.reload).toHaveBeenCalledOnce();

    // 重载后：读回成功才写活动位置，记录全部清除
    const reopened = createShell(world);
    await reopened.start();
    expect(reopened.state.phase).toBe('board');
    expect(reopened.state.restore.state).toBe('restored');
    expect(world.storage.get(ACTIVE_DB_KEY)).toBe('rxdb-board-restore-1');
    for (const key of [PENDING_SWITCH_KEY, RESTORE_TARGET_KEY, RESTORING_MARKER_KEY]) {
      expect(world.storage.has(key)).toBe(false);
    }
  });

  it('启动页恢复不需要确认；损坏归档失败不切换、清理目标并保留原库', async () => {
    const world = createWorld();
    const shell = createShell(world);
    await shell.start();
    await shell.restoreFromFile(archiveOf('archive:1'));
    expect(shell.state.confirm).toBeNull();
    expect(world.storage.get(PENDING_SWITCH_KEY)).toBe('rxdb-board-restore-0');

    const active = createWorld();
    const opened = createShell(active);
    await opened.start();
    await opened.startEmpty();
    const restoring = opened.restoreFromFile(archiveOf('not an archive'));
    await settled();
    opened.settleConfirm(true);
    await restoring;
    expect(opened.state.phase).toBe('board');
    expect(opened.state.error).toBe('归档已损坏');
    expect(opened.state.restore.failure).toEqual({ kind: 'restore_failed', reason: '归档已损坏' });
    expect(active.storage.get(ACTIVE_DB_KEY)).toBe('rxdb-board-restore-0');
    expect([...active.dbs.keys()]).toEqual(['rxdb-board-restore-0']);
    expect(active.storage.has(RESTORING_MARKER_KEY)).toBe(false);
  });

  it('恢复失败且清理也失败：两个原因一起报出，目标记录留着供重开时重试', async () => {
    const world = createWorld();
    const shell = createShell(world);
    await shell.start();
    const listDatabases = world.runtime.listDatabases;
    let calls = 0;
    world.runtime.listDatabases = async () => {
      // 第 1 次：取新库名；第 2 次：失败后的目标清理（恢复前没有残留记录，不列库）
      if (++calls === 2) throw new Error('列库失败');
      return listDatabases();
    };
    await shell.restoreFromFile(archiveOf('broken'));
    expect(shell.state.error).toBe('归档已损坏；恢复目标清理失败：列库失败，可重新打开页面重试清理');
    expect(world.storage.get(RESTORE_TARGET_KEY)).toBe('rxdb-board-restore-0');
    expect(world.storage.has(RESTORING_MARKER_KEY)).toBe(false);
  });

  it('重载后待切换库已丢失：报读回失败、清除待切换记录并继续打开原库', async () => {
    const world = createWorld();
    world.storage.set(ACTIVE_DB_KEY, 'rxdb-board-restore-0');
    world.dbs.set('rxdb-board-restore-0', { boards: 1, incomplete: false });
    world.storage.set(PENDING_SWITCH_KEY, 'rxdb-board-missing');
    world.storage.set(RESTORE_TARGET_KEY, 'rxdb-board-missing');
    world.storage.set(RESTORING_MARKER_KEY, '1');
    const shell = createShell(world);
    await shell.start();
    expect(shell.state.phase).toBe('board');
    expect(shell.state.error).toBe('恢复读回失败：恢复目标存储已不存在');
    expect(shell.state.restore.failure?.kind).toBe('readback_failed');
    expect(world.storage.get(ACTIVE_DB_KEY)).toBe('rxdb-board-restore-0');
    expect(world.storage.has(PENDING_SWITCH_KEY)).toBe(false);
    expect(world.dbs.has('rxdb-board-missing')).toBe(false);
  });

  it('读回失败且清理失败：保留待切换记录（重开时重试），没有活动库时回到启动选择', async () => {
    const world = createWorld();
    world.storage.set(PENDING_SWITCH_KEY, 'rxdb-board-restore-0');
    world.storage.set(RESTORE_TARGET_KEY, 'rxdb-board-restore-0');
    world.dbs.set('rxdb-board-restore-0', { boards: 1, incomplete: false });
    world.failConnect.add('rxdb-board-restore-0');
    world.failDisconnect.add('rxdb-board-restore-0');
    const listDatabases = world.runtime.listDatabases;
    let calls = 0;
    world.runtime.listDatabases = async () => {
      if (++calls === 2) throw new Error('列库失败');
      return listDatabases();
    };
    const shell = createShell(world);
    await shell.start();
    expect(shell.state.phase).toBe('startup');
    expect(shell.state.error).toBe(
      '恢复读回失败：连接 rxdb-board-restore-0 失败；恢复目标断开失败：断开 rxdb-board-restore-0 失败；' +
        '恢复目标清理失败：列库失败，可重新打开页面重试清理'
    );
    expect(world.storage.get(PENDING_SWITCH_KEY)).toBe('rxdb-board-restore-0');
  });

  it('中断的恢复：重开时清理没做完的目标，完整的孤儿库整库删除，活动库不动', async () => {
    const world = createWorld();
    world.storage.set(ACTIVE_DB_KEY, 'rxdb-board-restore-0');
    world.dbs.set('rxdb-board-restore-0', { boards: 1, incomplete: false });
    world.dbs.set('rxdb-board-restore-1', { boards: 0, incomplete: true });
    world.storage.set(RESTORE_TARGET_KEY, 'rxdb-board-restore-1');
    world.storage.set(RESTORING_MARKER_KEY, '1');
    await createShell(world).start();
    expect([...world.dbs.keys()]).toEqual(['rxdb-board-restore-0']);

    world.dbs.set('rxdb-board-restore-2', { boards: 3, incomplete: false });
    world.storage.set(RESTORE_TARGET_KEY, 'rxdb-board-restore-2');
    const shell = createShell(world);
    await shell.start();
    expect([...world.dbs.keys()]).toEqual(['rxdb-board-restore-0']);
    expect(shell.state.error).toBeNull();

    // 目标记录指向活动库：不清理
    world.storage.set(RESTORE_TARGET_KEY, 'rxdb-board-restore-0');
    await createShell(world).start();
    expect(world.dbs.has('rxdb-board-restore-0')).toBe(true);
    expect(world.storage.has(RESTORE_TARGET_KEY)).toBe(false);
  });

  it('清理失败：照常打开活动库并提示，目标记录留着、恢复中标记清除', async () => {
    const world = createWorld();
    world.storage.set(ACTIVE_DB_KEY, 'rxdb-board-restore-0');
    world.dbs.set('rxdb-board-restore-0', { boards: 1, incomplete: false });
    world.storage.set(RESTORE_TARGET_KEY, 'rxdb-board-failed-target');
    world.storage.set(RESTORING_MARKER_KEY, '1');
    world.listFailure = new Error('模拟清理读取失败');
    const shell = createShell(world);
    await shell.start();
    expect(shell.state.phase).toBe('board');
    expect(shell.state.error).toBe('恢复目标清理失败：模拟清理读取失败，可重新打开页面重试清理');
    expect(world.storage.get(RESTORE_TARGET_KEY)).toBe('rxdb-board-failed-target');
    expect(world.storage.has(RESTORING_MARKER_KEY)).toBe(false);

    // 恢复前的残留清理失败：不启动恢复
    const restoring = shell.restoreFromFile(archiveOf('archive:1'));
    await settled();
    shell.settleConfirm(true);
    await restoring;
    expect(shell.state.error).toBe('恢复目标清理失败：模拟清理读取失败，可重新打开页面重试清理');
    expect(world.storage.has(PENDING_SWITCH_KEY)).toBe(false);
  });

  it('另一页面占着恢复锁：用户动作立即报错，不排队', async () => {
    const world = createWorld();
    const shell = createShell(world);
    await shell.start();
    world.otherPageHoldsLock = true;
    await shell.startEmpty();
    expect(shell.state.phase).toBe('startup');
    expect(shell.state.error).toBe('另一页面正在准备或恢复看板，请稍后重试');
    await shell.restoreFromFile(archiveOf('archive:1'));
    expect(world.dbs.size).toBe(0);
  });

  it('连上新库后释放旧库失败：照常切过去并提示', async () => {
    const world = createWorld();
    const shell = createShell(world);
    await shell.start();
    await shell.startEmpty();
    world.failDisconnect.add('rxdb-board-restore-0');
    const reset = shell.resetDemo();
    await settled();
    shell.settleConfirm(true);
    await reset;
    expect(world.storage.get(ACTIVE_DB_KEY)).toBe('rxdb-board-restore-1');
    expect(shell.state.error).toBe('看板连接释放失败：断开 rxdb-board-restore-0 失败');

    world.failConnect.add('rxdb-board-restore-1');
    const reopened = createShell(world);
    await reopened.start();
    expect(reopened.state.phase).toBe('startup');
    expect(reopened.state.error).toBe('连接 rxdb-board-restore-1 失败');
  });

  it('导出备份：归档完整生成后交给下载；没有打开的看板或适配器不支持备份时报错', async () => {
    const world = createWorld();
    const shell = createShell(world);
    await shell.start();
    await expect(shell.downloadBackup()).rejects.toThrow('当前没有打开的看板');
    await shell.startSeed();
    await shell.downloadBackup();
    const [archive, fileName] = world.download.mock.calls[0];
    expect(fileName).toBe('board-backup-rxdb-board-restore-0@0_1.rxdb');
    expect(await archive.text()).toBe('archive:2');

    world.backupMethods = false;
    await expect(shell.downloadBackup()).rejects.toThrow('适配器 sqlite-wasm 不支持备份与恢复');
  });

  it('拆除：退订存储事件、取消待确认操作、断开连接；之后到达的连接直接断开、状态不再变化', async () => {
    const world = createWorld();
    const shell = createShell(world);
    await shell.start();
    await shell.startEmpty();
    const db = shell.state.rxdb!;
    const pending = shell.resetDemo();
    await settled();
    expect(world.listenerCount()).toBe(1);
    await shell.destroy();
    await shell.destroy();
    await pending;
    expect(world.listenerCount()).toBe(0);
    expect(db.disconnectAll).toHaveBeenCalledOnce();
    expect(world.dbs.size).toBe(1);

    // StrictMode 双挂载：启动还没连上就拆除，连上的库随即断开
    const late = createWorld();
    late.storage.set(ACTIVE_DB_KEY, 'rxdb-board-restore-0');
    const unmounted = createShell(late);
    const starting = unmounted.start();
    await unmounted.destroy();
    await starting;
    expect(unmounted.state.phase).toBe('loading');
    expect(late.connected.size).toBe(0);

    const never = createShell(createWorld());
    await never.destroy();
    await never.start();
    expect(never.state.phase).toBe('loading');
  });

  it('浏览器运行时：localStorage、Web Locks、IndexedDB 逻辑库名、storage 事件、下载与重载', async () => {
    const data = new Map<string, string>();
    const localStorageStub = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key)
    };
    const windowListeners = new Map<string, (event: unknown) => void>();
    const reload = vi.fn();
    const click = vi.fn();
    const anchor = { href: '', download: '', click, remove: vi.fn() };
    let available = true;
    vi.stubGlobal('localStorage', localStorageStub);
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: string, options: { ifAvailable: boolean }, callback: (lock: object | null) => unknown) =>
          callback(options.ifAvailable && !available ? null : {})
      }
    });
    vi.stubGlobal('indexedDB', {
      databases: async () => [{ name: 'rxdb-board-restore-0@0_1.sqlite.db' }, { name: '' }, {}]
    });
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (event: unknown) => void) => windowListeners.set(type, listener),
      removeEventListener: (type: string) => windowListeners.delete(type),
      location: { reload }
    });
    vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:board', revokeObjectURL: vi.fn() });
    vi.useFakeTimers();
    try {
      const runtime = browserBoardShellRuntime();
      runtime.storage.set(ACTIVE_DB_KEY, 'a');
      expect(runtime.storage.get(ACTIVE_DB_KEY)).toBe('a');
      runtime.storage.remove(ACTIVE_DB_KEY);
      expect(runtime.storage.get(ACTIVE_DB_KEY)).toBeNull();

      expect(await runtime.withLock(async () => 'ok', false)).toBe('ok');
      available = false;
      await expect(runtime.withLock(async () => 'ok', false)).rejects.toThrow('另一页面正在准备或恢复看板');
      expect(await runtime.withLock(async () => 'waited', true)).toBe('waited');

      expect(await runtime.listDatabases()).toEqual(['rxdb-board-restore-0']);

      const seen: unknown[] = [];
      const unwatch = runtime.watchStorage((key, value) => seen.push([key, value]));
      windowListeners.get('storage')!({ storageArea: localStorageStub, key: ACTIVE_DB_KEY, newValue: 'b' });
      windowListeners.get('storage')!({ storageArea: {}, key: ACTIVE_DB_KEY, newValue: 'c' });
      expect(seen).toEqual([[ACTIVE_DB_KEY, 'b']]);
      unwatch();
      expect(windowListeners.has('storage')).toBe(false);

      runtime.reload();
      expect(reload).toHaveBeenCalledOnce();
      runtime.download(new Blob(['x']), 'board.rxdb');
      expect(anchor.download).toBe('board.rxdb');
      expect(click).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(1000);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:board');
    } finally {
      vi.useRealTimers();
    }
  });
});
