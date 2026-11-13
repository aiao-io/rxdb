import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceRepository } from './storage';
function backend() {
  const read = { result: { id: 'saved' }, error: new Error('read failure'), onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
  const store = { get: vi.fn(() => read), put: vi.fn(), delete: vi.fn() };
  const transaction = { objectStore: () => store, error: null as Error | null, oncomplete: null as (() => void) | null, onerror: null as (() => void) | null, onabort: null as (() => void) | null };
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
