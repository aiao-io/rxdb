import { afterEach, describe, expect, it, vi } from 'vitest';
import { RxDB } from '../RxDB.js';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBPlugin } from '../rxdb-plugin.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

const databases: RxDB[] = [];
const createDatabase = () => {
  const database = new RxDB({
    dbName: `instance-lifecycle-${crypto.randomUUID()}`,
    entities: [],
    sync: { local: { adapter: 'mock' }, type: SyncType.None }
  });
  const adapter = createMockAdapter(database);
  database.adapter('mock', () => adapter);
  databases.push(database);
  return { database, adapter };
};

afterEach(async () => {
  for (const database of databases.splice(0)) await database.destroy();
  vi.restoreAllMocks();
});

describe('实例级插件资源', () => {
  it('销毁同步停止接收任务，等待适配器退出后再释放资源', async () => {
    const { database, adapter } = createDatabase();
    const stop = vi.fn();
    const dispose = vi.fn();
    database.use(() => ({ name: 'resource', install: vi.fn(), instanceLifecycle: { stop, dispose } }));
    await database.connect('mock');
    const entered = Promise.withResolvers<void>();
    const drained = Promise.withResolvers<void>();
    adapter.disconnect.mockImplementation(async () => {
      entered.resolve();
      await drained.promise;
    });

    const destroying = database.destroy();
    expect(stop).toHaveBeenCalledOnce();
    await entered.promise;
    expect(dispose).not.toHaveBeenCalled();
    drained.resolve();
    await destroying;
    expect(dispose).toHaveBeenCalledOnce();
    await database.destroy();
    expect(stop).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('普通断连保留实例资源，重连后销毁只释放一次', async () => {
    const { database } = createDatabase();
    const stop = vi.fn();
    const dispose = vi.fn();
    database.use(() => ({ name: 'resource', install: vi.fn(), instanceLifecycle: { stop, dispose } }));
    await database.connect('mock');
    await database.disconnectAll();
    expect(stop).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    await database.connect('mock');
    await database.destroy();
    expect(stop).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it.each(['stop', 'disconnect', 'dispose'] as const)('%s 失败仍完成其他清理并保留首个错误', async failing => {
    const { database, adapter } = createDatabase();
    const error = new Error(`${failing} failed`);
    const first = { stop: vi.fn(), dispose: vi.fn() };
    const second = { stop: vi.fn(), dispose: vi.fn() };
    for (const [name, instanceLifecycle] of [
      ['first', first],
      ['second', second]
    ] as const) {
      database.use((): IRxDBPlugin => ({ name, install: vi.fn(), instanceLifecycle }));
    }
    await database.connect('mock');
    const syncDestroyed = vi.spyOn(database.syncState, 'destroy');
    const reachabilityDestroyed = vi.spyOn(database.reachability, 'destroy');
    if (failing === 'disconnect') adapter.disconnect.mockRejectedValueOnce(error);
    else
      first[failing].mockImplementationOnce(() => {
        throw error;
      });

    await expect(database.destroy()).rejects.toBe(error);

    expect(adapter.disconnect).toHaveBeenCalledOnce();
    expect(first.stop).toHaveBeenCalledOnce();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(syncDestroyed).toHaveBeenCalledOnce();
    expect(reachabilityDestroyed).toHaveBeenCalledOnce();
  });
});
