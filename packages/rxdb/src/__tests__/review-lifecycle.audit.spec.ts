import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RxDB } from '../RxDB.js';
import { SyncType } from '../entity/metadata-options.interface.js';
import { registerRxDBTeardown } from './fixtures/rxdb-lifecycle.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

function createDatabase() {
  return trackRxDB(
    new RxDB({
      dbName: `review-lifecycle-${crypto.randomUUID()}`,
      entities: [],
      multiInstance: false,
      sync: { type: SyncType.None, local: { adapter: 'local' }, remote: { adapter: 'remote' } }
    })
  );
}

const { trackRxDB } = registerRxDBTeardown();

describe('review 生命周期边界', () => {
  it('只重连一个适配器也应更新持续订阅持有的实例', async () => {
    const db = createDatabase();
    db.adapter('local', createMockAdapter).adapter('remote', createMockAdapter);
    await db.connect('local');
    const first = await db.connect('remote');
    const values: unknown[] = [];
    const sub = db.remoteAdapter$.subscribe(value => values.push(value));
    await vi.waitFor(() => expect(values).toEqual([first]));
    await db.disconnect('remote');
    const second = await db.connect('remote');
    await Promise.resolve();
    const latest = await firstValueFrom(db.remoteAdapter$);
    sub.unsubscribe();
    await db.destroy();
    expect(second).not.toBe(first);
    expect(latest).toBe(second);
  });

  it('插件安装期间断连后原 connect 应拒绝', async () => {
    const db = createDatabase();
    const adapter = createMockAdapter(db);
    db.adapter('local', () => adapter);
    let release!: () => void;
    const hold = new Promise<void>(resolve => {
      release = resolve;
    });
    const install = vi.fn(() => hold);
    db.use(() => ({ name: 'held', lifecycle: 'scoped', inject: ['adapter:local'], install }));
    const connecting = db.connect('local');
    const settled = connecting.then(
      () => 'resolved',
      () => 'rejected'
    );
    await vi.waitFor(() => expect(install).toHaveBeenCalledOnce());
    await db.disconnectAll();
    release();
    const result = await settled;
    await db.destroy();
    expect(result).toBe('rejected');
  });

  it('adapter disconnect 失败也应销毁实例级资源', async () => {
    const db = createDatabase();
    const adapter = createMockAdapter(db);
    db.adapter('local', () => adapter);
    await db.connect('local');
    const reachability = vi.spyOn(db.reachability, 'destroy');
    const syncState = vi.spyOn(db.syncState, 'destroy');
    adapter.disconnect.mockRejectedValue(new Error('close failed'));
    await expect(db.destroy()).rejects.toThrow('close failed');
    await db.destroy();
    const calls = [reachability.mock.calls.length, syncState.mock.calls.length];
    db.reachability.destroy();
    db.syncState.destroy();
    expect(calls).toEqual([1, 1]);
  });
});
