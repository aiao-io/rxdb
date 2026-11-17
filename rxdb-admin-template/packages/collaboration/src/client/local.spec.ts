import { describe, expect, it } from 'vitest';
import { applyChanges } from '../changes.js';
import { assertFingerprints, commitFingerprint } from '../commit.js';
import type { Records } from '../model.js';
import { parseCommand } from '../server/input.js';
import { LocalTasks, contextKey, uploadCommand, type Context, type Draft, type DraftStorage } from './local.js';
class MemoryStorage implements DraftStorage {
  rows = new Map<string, Draft>();
  fail = false;
  /** 读取完成后、把结果交给调用方之前执行一次：模拟别的页面在此期间改了草稿。 */
  afterRead?: () => Promise<void>;
  async read(key: string) {
    const draft = structuredClone(this.rows.get(key));
    const hook = this.afterRead;
    this.afterRead = undefined;
    await hook?.();
    return draft;
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
  it('captures only the field-level difference to the last commit, with a fingerprint over parent, author, message and changes', async () => {
    const { tasks } = await setup();
    const saved = await tasks.save(
      context,
      {
        row: { entity: 'AssetCategory', fields: { name: 'Computers', description: 'Old' } },
        kept: { entity: 'AssetCategory', fields: { name: 'Kept' } }
      },
      0
    );
    const first = (await tasks.capture(context, 'first', false)).queue[0].commits[0];
    expect(first).toMatchObject({ parent: null, authorId: 'alice', message: 'first' });
    expect(first.changes.map(change => [change.entityId, change.operation])).toEqual([
      ['kept', 'insert'],
      ['row', 'insert']
    ]);
    expect(first.fingerprint).toBe(await commitFingerprint(first));

    const edited: Records = {
      row: { entity: 'AssetCategory', fields: { name: 'Computers', description: 'New' } },
      added: { entity: 'AssetCategory', fields: { name: 'Added' } }
    };
    await tasks.save(context, edited, saved.revision + 1);
    const second = (await tasks.capture(context, 'second', false)).queue[1].commits[0];
    expect(second.parent).toBe(first.id);
    expect(second.changes).toEqual([
      {
        namespace: 'assets',
        entity: 'AssetCategory',
        entityId: 'added',
        operation: 'insert',
        patch: { name: 'Added' },
        inversePatch: null
      },
      {
        namespace: 'assets',
        entity: 'AssetCategory',
        entityId: 'kept',
        operation: 'delete',
        patch: null,
        inversePatch: { name: 'Kept' }
      },
      {
        namespace: 'assets',
        entity: 'AssetCategory',
        entityId: 'row',
        operation: 'update',
        patch: { description: 'New' },
        inversePatch: { description: 'Old' }
      }
    ]);
    expect(second.fingerprint).toBe(await commitFingerprint(second));
    expect(second.fingerprint).not.toBe(first.fingerprint);
    // 两个提交依次应用，恰好得到当前已保存的内容
    expect(applyChanges(applyChanges({}, first.changes), second.changes)).toEqual(edited);
  });
  it('produces commits that pass the server input validation and fingerprint check as they are', async () => {
    const { tasks } = await setup();
    await tasks.save(context, records, 0);
    const { queue } = await tasks.capture(context, 'update', false);
    const sent = JSON.parse(JSON.stringify(uploadCommand('task', queue[0]))) as Record<string, unknown>;
    const command = parseCommand(sent);
    expect(command.type).toBe('upload');
    if (command.type !== 'upload') throw new Error('expected an upload');
    await expect(assertFingerprints(command.commits)).resolves.toBeUndefined();
    expect(command).toEqual({
      type: 'upload',
      taskId: 'task',
      operationId: queue[0].operationId,
      expectedHead: queue[0].expectedHead,
      commits: queue[0].commits
    });
  });
  it('records when each queued upload was formed, keeps it on retries and never sends it to the server', async () => {
    const { tasks } = await setup();
    await tasks.save(context, records, 0);
    const before = Date.now();
    const captured = await tasks.capture(context, 'update', false);
    const createdAt = captured.queue[0].createdAt;
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(Date.now());
    const retried = await tasks.capture(context, 'retry', false);
    expect(retried.queue[0].createdAt).toBe(createdAt);
    const sent = uploadCommand('task', retried.queue[0]);
    expect(sent).not.toHaveProperty('createdAt');
    expect(() => parseCommand({ ...sent, createdAt })).toThrow(/请求字段不合法/);
  });
  it('gives every commit a fresh UUIDv7 id and keeps the same id and content while it waits for upload', async () => {
    const { tasks } = await setup();
    await tasks.save(context, records, 0);
    const captured = await tasks.capture(context, 'first', false);
    const commit = captured.queue[0].commits[0];
    expect(commit.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const retried = await tasks.capture(context, 'retry', false);
    expect(retried.queue[0].commits[0]).toEqual(commit);
    expect(retried.queue[0].operationId).toBe(captured.queue[0].operationId);
    await tasks.save(
      context,
      { ...records, extra: { entity: 'AssetCategory', fields: { name: 'Extra' } } },
      retried.revision
    );
    const next = (await tasks.capture(context, 'next', false)).queue[1].commits[0];
    expect(next.id).not.toBe(commit.id);
    expect(next.parent).toBe(commit.id);
  });
  it('does not commit over edits saved by another page while the commit was being prepared', async () => {
    const { tasks, storage } = await setup();
    const saved = await tasks.save(context, records, 0);
    const newer: Records = { row: { entity: 'AssetCategory', fields: { name: 'Edited elsewhere' } } };
    storage.afterRead = async () => {
      await tasks.save(context, newer, saved.revision);
    };
    await expect(tasks.capture(context, 'update', false)).rejects.toThrow(/其他页面/);
    const draft = await tasks.read(context);
    expect(draft?.records).toEqual(newer);
    expect(draft?.queue).toEqual([]);
    expect(draft?.localHead).toBeNull();
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
