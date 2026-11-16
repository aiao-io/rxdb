import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextKey, IndexedDraftStorage, LocalTasks, type Context } from './local.js';
const context: Context = { userId: 'alice', teamId: 'team', appId: 'assets', taskId: 'task' };
const stores: IndexedDraftStorage[] = [];
function storage() {
  const value = new IndexedDraftStorage('test-collaboration');
  stores.push(value);
  return value;
}
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => {
  stores.splice(0).forEach(store => store.dispose());
  vi.unstubAllGlobals();
});
describe('persistent draft transaction boundaries', () => {
  it('isolates physical task databases and reloads only the verified user contexts', async () => {
    const store = storage();
    const tasks = new LocalTasks(store);
    await tasks.login('alice');
    await tasks.openVerified(context, 'Task', null, null, {});
    await tasks.openVerified({ ...context, teamId: 'other-team' }, 'Other', null, null, {});
    await tasks.save(context, { c: { entity: 'AssetCategory', fields: { name: 'Private' } } }, 0);
    await tasks.capture(context, 'saved', false);
    expect(await store.list('bob')).toEqual([]);
    expect((await indexedDB.databases()).filter(db => db.name?.startsWith('test-collaboration:['))).toHaveLength(2);
    const reloaded = new LocalTasks(storage());
    expect(await reloaded.coldRestore('alice', Date.now() + 10000, Date.now())).toHaveLength(2);
    expect((await reloaded.read(context))?.queue).toHaveLength(1);
    expect((await reloaded.read(context))?.records.c.fields['name']).toBe('Private');
  });
  it('rolls back failed writes without losing the previous working tree or creating a partial queue', async () => {
    const store = storage();
    const tasks = new LocalTasks(store);
    await tasks.login('alice');
    const before = await tasks.openVerified(context, 'Task', null, null, {});
    await expect(
      store.write(contextKey(context), current => {
        if (!current) throw new Error('missing');
        current.records = { c: { entity: 'AssetCategory', fields: { name: 'Not committed' } } };
        throw new Error('injected failure');
      })
    ).rejects.toThrow('injected failure');
    expect(await store.read(contextKey(context))).toEqual(before);
    await expect(
      store.write(contextKey(context), current => ({ ...current!, context: { ...context, userId: 'bob' } }))
    ).rejects.toThrow(/上下文不匹配/);
    expect(await store.read(contextKey(context))).toEqual(before);
  });
  it('serializes concurrent tabs by revision and locks persisted drafts on logout', async () => {
    const first = new LocalTasks(storage());
    const second = new LocalTasks(storage());
    await first.login('alice');
    await second.login('alice');
    await first.openVerified(context, 'Task', null, null, {});
    await second.openVerified(context, 'Task', null, null, {});
    const results = await Promise.allSettled([
      first.save(context, { a: { entity: 'AssetCategory', fields: { name: 'A' } } }, 0),
      second.save(context, { b: { entity: 'AssetCategory', fields: { name: 'B' } } }, 0)
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    await first.logout();
    const restored = new LocalTasks(storage());
    expect(await restored.coldRestore('alice', Date.now() + 10000, Date.now())).toEqual([]);
    expect((await restored.storage.read(contextKey(context)))?.locked).toBe(true);
  });
  it('closes task connections without deleting drafts and rejects use after disposal', async () => {
    const store = storage();
    const tasks = new LocalTasks(store);
    await tasks.login('alice');
    await tasks.openVerified(context, 'Task', null, null, {});
    tasks.dispose();
    await expect(store.read(contextKey(context))).rejects.toMatchObject({ code: 'cancelled' });
    expect(await storage().read(contextKey(context))).toBeDefined();
  });
});
