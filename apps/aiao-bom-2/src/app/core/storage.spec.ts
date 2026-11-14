import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceRepository } from './storage';
function backend() {
  const read = { result: { id: 'saved' }, error: new Error('read failure'), onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
  const store = { get: vi.fn(() => read), put: vi.fn(), add: vi.fn(), delete: vi.fn() };
  const transaction = { objectStore: () => store, error: null as Error | null, oncomplete: null as (() => void) | null, onerror: null as (() => void) | null, onabort: null as (() => void) | null, abort: vi.fn() };
  const db = { createObjectStore: vi.fn(), transaction: vi.fn(() => transaction) };
  const opening = { result: db, error: new Error('open failure'), onupgradeneeded: null as (() => void) | null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null, onblocked: null as (() => void) | null };
  const open = vi.fn(() => opening); vi.stubGlobal('indexedDB', { open });
  return { open, opening, db, read, store, transaction };
}
afterEach(() => vi.unstubAllGlobals());
describe('本地仓储提交语义与失败', () => {
  it('使用独立库，并且只在 IndexedDB 事务提交后报告保存成功', async () => {
    const b = backend(); const repository = new WorkspaceRepository(); const reading = repository.read('draft:x');
    expect(b.open).toHaveBeenCalledWith('aiao-bom-2-workspace-v1', 1);
    b.opening.onupgradeneeded!(); b.opening.onsuccess!(); await Promise.resolve(); b.read.onsuccess!();
    expect(await reading).toEqual({ id: 'saved' }); expect(b.db.createObjectStore).toHaveBeenCalledWith('documents');
    const writing = repository.write('draft:x', { value: '0.1' }); let complete = false; void writing.then(() => complete = true);
    await Promise.resolve(); expect(complete).toBe(false); expect(b.store.put).toHaveBeenCalledWith({ value: '0.1' }, 'draft:x');
    b.transaction.oncomplete!(); await writing; expect(complete).toBe(true); expect(b.open).toHaveBeenCalledTimes(1);
    const deleting = repository.delete('draft:x'); await Promise.resolve(); b.transaction.oncomplete!(); await deleting; expect(b.store.delete).toHaveBeenCalledWith('draft:x');
  });
  it('打开失败、升级阻塞与读失败向调用方显式返回', async () => {
    let b = backend(); let task = new WorkspaceRepository().read('x'); let result = expect(task).rejects.toThrow('open failure'); b.opening.onerror!(); await result;
    b = backend(); task = new WorkspaceRepository().read('x'); result = expect(task).rejects.toThrow('阻塞'); b.opening.onblocked!(); await result;
    b = backend(); task = new WorkspaceRepository().read('x'); result = expect(task).rejects.toThrow('read failure'); b.opening.onsuccess!(); await Promise.resolve(); b.read.onerror!(); await result;
  });
  it('删除事务取消必须结束等待并保留错误原因', async () => {
    const b = backend(); const repository = new WorkspaceRepository(); const deleting = repository.delete('x');
    b.opening.onsuccess!(); await Promise.resolve(); expect(b.transaction.onabort).toBeTypeOf('function');
    const result = expect(deleting).rejects.toThrow('取消'); b.transaction.onabort!(); await result;
  });
  it('保存和删除的异常及事务取消均可终止等待', async () => {
    const b = backend(); const repository = new WorkspaceRepository();
    const writing = repository.write('x', {}); const rejected = expect(writing).rejects.toThrow('取消');
    b.opening.onsuccess!(); await Promise.resolve(); b.transaction.onabort!(); await rejected;
    const deleting = repository.delete('x'); const failedDelete = expect(deleting).rejects.toThrow('delete failure');
    await Promise.resolve(); b.transaction.error = new Error('delete failure'); b.transaction.onerror!(); await failedDelete;
  });
});

describe('快照与目录原子保存', () => {
  it('节点和元数据在一个事务写入，两者均提交后才成功', async () => {
    const b = backend(); const repository = new WorkspaceRepository();
    const saving = repository.writeMany([['snapshot:a', { nodes: [] }], ['snapshot-meta:a', { id: 'a' }]]);
    b.opening.onsuccess!(); await Promise.resolve();
    expect(b.db.transaction).toHaveBeenCalledTimes(1);
    expect(b.store.put.mock.calls).toEqual([[{ nodes: [] }, 'snapshot:a'], [{ id: 'a' }, 'snapshot-meta:a']]);
    b.transaction.oncomplete!(); await saving;
  });

  it('按前缀读取元数据，节点正文不会被一起载入', async () => {
    const b = backend(); const getAll = vi.fn(() => b.read);
    Object.assign(b.store, { getAll });
    vi.stubGlobal('IDBKeyRange', { bound: vi.fn((lower: string, upper: string) => ({ lower, upper })) });
    const task = new WorkspaceRepository().readAll('snapshot-meta:dataset:');
    b.opening.onsuccess!(); await Promise.resolve();
    expect(getAll).toHaveBeenCalledWith({ lower: 'snapshot-meta:dataset:', upper: 'snapshot-meta:dataset:\uffff' });
    b.read.onsuccess!(); expect(await task).toEqual({ id: 'saved' });
  });
});


describe('不可变快照的存储边界', () => {
  it('追加模式使用 add，跨标签页同身份写入交给 IndexedDB 唯一性约束', async () => {
    const b = backend();
    const saving = new WorkspaceRepository().writeMany([['snapshot:a', {}]], 'add');
    b.opening.onsuccess!(); await Promise.resolve();
    expect(b.store.add).toHaveBeenCalledWith({}, 'snapshot:a'); expect(b.store.put).not.toHaveBeenCalled();
    const failure = expect(saving).rejects.toThrow('duplicate');
    b.transaction.error = new Error('duplicate'); b.transaction.onerror!(); await failure;
  });
  it('第二项同步失败时取消整个事务，第一项也不能单独提交', async () => {
    const b = backend(); b.store.put.mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error('clone failure'); });
    const saving = new WorkspaceRepository().writeMany([['a', {}], ['b', {}]]);
    const failure = expect(saving).rejects.toThrow('clone failure');
    b.opening.onsuccess!(); await failure; expect(b.transaction.abort).toHaveBeenCalledOnce();
  });
});
