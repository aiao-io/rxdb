import { describe, expect, it } from 'vitest';
import type { Records } from '../model.js';
import { LocalTasks, contextKey, type Context, type Draft, type DraftStorage } from './local.js';
class MemoryStorage implements DraftStorage {
  rows = new Map<string, Draft>();
  fail = false;
  async read(key: string) {
    return structuredClone(this.rows.get(key));
  }
  async write(key: string, change: (current: Draft | undefined) => Draft) {
    const next = change(await this.read(key));
    if (this.fail) throw new Error('disk full');
    this.rows.set(key, structuredClone(next));
    return next;
  }
  async list(id: string) {
    return [...this.rows.values()].filter(d => d.context.userId === id).map(d => structuredClone(d));
  }
  async lock(id: string) {
    this.rows.forEach(d => {
      if (d.context.userId === id) d.locked = true;
    });
  }
}
const context: Context = { userId: 'alice', teamId: 'team', appId: 'assets', taskId: 'task' };
const records: Records = { row: { entity: 'AssetCategory', fields: { name: 'Computers' } } };
async function setup() {
  const storage = new MemoryStorage();
  const tasks = new LocalTasks(storage);
  await tasks.login('alice');
  await tasks.openVerified(context, 'Task', null, null, {});
  return { storage, tasks };
}
describe('local context and commit boundaries', () => {
  it('save does not commit or upload; capture persists the commit and outbox atomically', async () => {
    const { tasks, storage } = await setup();
    const saved = await tasks.save(context, records, 0);
    expect(saved.queue).toEqual([]);
    expect(saved.localHead).toBeNull();
    storage.fail = true;
    await expect(tasks.capture(context, 'update', false)).rejects.toThrow('disk full');
    expect((await tasks.read(context))?.records).toEqual(records);
    expect((await tasks.read(context))?.queue).toEqual([]);
    storage.fail = false;
    const committed = await tasks.capture(context, 'update', false);
    expect(committed.queue).toHaveLength(1);
    expect((await tasks.capture(context, 'retry', false)).queue).toEqual(committed.queue);
  });
  it('refuses to silently exclude unsaved inputs and never creates empty commits', async () => {
    const { tasks } = await setup();
    await expect(tasks.capture(context, 'update', true)).rejects.toThrow(/保存全部/);
    expect((await tasks.capture(context, 'empty', false)).queue).toHaveLength(0);
  });
  it('an old upload acknowledgment never erases edits saved during upload', async () => {
    const { tasks } = await setup();
    await tasks.save(context, records, 0);
    const pending = await tasks.capture(context, 'update', false);
    const newer = { ...records, row2: { entity: 'AssetCategory' as const, fields: { name: 'New' } } };
    await tasks.save(context, newer, pending.revision);
    const receipt = await tasks.acknowledge(context, pending.queue[0].operationId, pending.localHead!, tasks.epoch);
    expect(receipt.records).toEqual(newer);
    expect(receipt.committed).toEqual(records);
    expect(receipt.queue).toEqual([]);
    expect((await tasks.capture(context, 'next', false)).queue[0].expectedHead).toBe(pending.localHead);
  });
  it('allows warm offline editing, but cold start needs an unexpired session and a previously verified context', async () => {
    const { tasks, storage } = await setup();
    await tasks.save(context, records, 0);
    const cold = new LocalTasks(storage);
    await expect(cold.coldRestore('alice', 100, 200)).rejects.toThrow(/过期/);
    await expect(cold.read(context)).rejects.toThrow(/锁定/);
    expect(await cold.coldRestore('alice', 300, 200)).toHaveLength(1);
    expect((await cold.read(context))?.records).toEqual(records);
    await expect(cold.read({ ...context, taskId: 'unknown' })).rejects.toThrow(/锁定/);
  });
  it('logout locks persisted drafts and rejects late receipts and another account adopting the queue', async () => {
    const { tasks, storage } = await setup();
    await tasks.save(context, records, 0);
    const draft = await tasks.capture(context, 'update', false);
    const epoch = tasks.epoch;
    await tasks.logout();
    await tasks.login('bob');
    await expect(tasks.acknowledge(context, draft.queue[0].operationId, draft.localHead!, epoch)).rejects.toThrow(
      /锁定/
    );
    await expect(tasks.read(context)).rejects.toThrow(/锁定/);
    expect((await storage.read(contextKey(context)))?.queue).toHaveLength(1);
    const cold = new LocalTasks(storage);
    expect(await cold.coldRestore('alice', 300, 200)).toEqual([]);
    await cold.openVerified(context, 'Task', null, null, {});
    expect((await cold.read(context))?.records).toEqual(records);
  });
  it('refuses fast-forward and stale saves while preserving all local work', async () => {
    const { tasks } = await setup();
    await tasks.save(context, records, 0);
    await expect(tasks.save(context, {}, 0)).rejects.toThrow(/其他页面/);
    await expect(tasks.fastForward(context, 'remote', {}, false)).rejects.toThrow(/本机有修改/);
    expect((await tasks.read(context))?.records).toEqual(records);
  });
  it('fetches the original task only after every queued commit is preserved by an acknowledged fork', async () => {
    const { tasks } = await setup();
    await tasks.save(context, records, 0);
    const captured = await tasks.capture(context, 'fork', false);
    await expect(tasks.fastForward(context, 'remote', {}, false)).rejects.toThrow(/本机有修改/);
    await tasks.archiveFork(context, 'fork-task', captured.localHead!);
    await expect(tasks.fastForward(context, 'remote', {}, true)).rejects.toThrow(/本机有修改/);
    const restored = await tasks.fastForward(context, 'remote', {}, false);
    expect(restored.records).toEqual({});
    expect(restored.queue).toEqual([]);
    expect(restored.localHead).toBe('remote');
    expect(restored.forkArchive).toEqual({ taskId: 'fork-task', head: captured.localHead });
  });
  it('never discards edits or commits made after preserving a fork', async () => {
    const { tasks } = await setup();
    await tasks.save(context, records, 0);
    const captured = await tasks.capture(context, 'fork', false);
    await tasks.archiveFork(context, 'fork-task', captured.localHead!);
    const newer: Records = { row: { entity: 'AssetCategory', fields: { name: 'Later edit' } } };
    await tasks.save(context, newer, captured.revision);
    await expect(tasks.fastForward(context, 'remote', {}, false)).rejects.toThrow(/本机有修改/);
    await tasks.capture(context, 'new commit', false);
    await expect(tasks.fastForward(context, 'remote', {}, false)).rejects.toThrow(/本机有修改/);
    expect((await tasks.read(context))?.records).toEqual(newer);
  });

});
