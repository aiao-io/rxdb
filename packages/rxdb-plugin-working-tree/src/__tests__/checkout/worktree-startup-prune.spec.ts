/**
 * @fileoverview 启动清理（US-313 AC9 的「任一标签页启动」那一半）：每个连接纪元第一次连上本地适配器后，
 * 插件在后台回收一次没人在用的检出位。
 *
 * @remarks
 * 关掉或崩掉的标签页没有机会自己收尾，它留下的会话归属检出位只能靠别的标签页启动时收走。
 * `prune()` 本身的判据（锁、归属、状态）由一致性套件在真后端上验，这里只验「什么时候调、调几次、失败怎么办」。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorktreeManager } from '../../checkout/worktree-manager.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

const databases = new Set<RxDB>();
let databaseSequence = 0;

afterEach(async () => {
  const pending = Array.from(databases);
  databases.clear();
  await Promise.all(pending.map(database => database.disconnectAll()));
  vi.restoreAllMocks();
});

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * 造一条连接；`enabled` 决定库上的提交能力是否已启用。
 *
 * @param options - `worktrees` 为假时不配快照库工厂
 * @returns 已连接的实例
 */
const connectDatabase = async (options: { readonly worktrees: boolean; readonly enabled: boolean }): Promise<RxDB> => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-plugin-worktree-startup-prune-${databaseSequence}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', () => createMockAdapter(database));
  database.use(
    rxDBPluginWorkingTree,
    options.worktrees ? { worktrees: { adapter: db => createMockAdapter(db) as never } } : undefined
  );
  vi.spyOn(database.workingTree, 'isEnabled').mockResolvedValue(options.enabled);
  databases.add(database);
  await database.connect('local');
  return database;
};

describe('启动清理：每个连接纪元在后台回收一次检出位', () => {
  it('配了快照库、库已启用：连上之后回收一次', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);

    await connectDatabase({ worktrees: true, enabled: true });

    await vi.waitFor(() => expect(prune).toHaveBeenCalledTimes(1));
  });

  it('库还没启用：不回收——登记表要启用之后才有意义', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);

    const database = await connectDatabase({ worktrees: true, enabled: false });
    await vi.waitFor(() => expect(database.workingTree.isEnabled).toHaveBeenCalled());
    await flush();

    expect(prune).not.toHaveBeenCalled();
  });

  it('没配快照库：连启用状态都不读', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);

    const database = await connectDatabase({ worktrees: false, enabled: true });
    await flush();

    expect(database.workingTree.isEnabled).not.toHaveBeenCalled();
    expect(prune).not.toHaveBeenCalled();
  });

  it('断开重连是新的连接纪元：再回收一次，不会叠成两次', async () => {
    const prune = vi.spyOn(WorktreeManager.prototype, 'prune').mockResolvedValue([]);
    const database = await connectDatabase({ worktrees: true, enabled: true });
    await vi.waitFor(() => expect(prune).toHaveBeenCalledTimes(1));

    await database.disconnectAll();
    await database.connect('local');

    await vi.waitFor(() => expect(prune).toHaveBeenCalledTimes(2));
    await flush();
    expect(prune).toHaveBeenCalledTimes(2);
  });

  // 没有调用方能接住后台的错误：回收失败只是留下几个没删的快照库，不能拖垮这次连接
  it('回收失败：打到控制台，连接照常', async () => {
    const failure = new Error('prune exploded');
    vi.spyOn(WorktreeManager.prototype, 'prune').mockRejectedValue(failure);
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await connectDatabase({ worktrees: true, enabled: true });

    await vi.waitFor(() => expect(report).toHaveBeenCalledWith(expect.stringContaining('回收只读检出位失败'), failure));
  });
});
