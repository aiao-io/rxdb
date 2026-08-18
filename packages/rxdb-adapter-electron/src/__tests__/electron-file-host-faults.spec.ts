import { mkdtemp, rm, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 本轮用例要注入的故障；`undefined` 表示走真实实现。
 *
 * @remarks
 * 提交路径的资源回收只在**失败**分支上才有意义，而 `sync()` 在真实文件系统上不会按需失败。
 * 故障注入因此单独占一个 spec 文件：`vi.mock` 的作用域是整个模块，塞进主 spec 会让那边
 * 每个用例都跑在被包装过的 `open` 上。
 */
const faults: { sync?: () => Promise<never> } = {};

/** 被包装的句柄上实际发生过的 `close()` 调用。 */
const closeCalls: FileHandle[] = [];

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const wrap = (handle: FileHandle): FileHandle =>
    new Proxy(handle, {
      get(target, property, receiver) {
        if (property === 'sync' && faults.sync) return faults.sync;
        if (property === 'close') {
          return async (): Promise<void> => {
            closeCalls.push(target);
            return target.close();
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });

  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>): Promise<FileHandle> => wrap(await actual.open(...args))
  };
});

const { createElectronFileHost } = await import('../electron-file-host.js');
type ElectronFileHost = ReturnType<typeof createElectronFileHost>;

describe('createElectronFileHost — 失败分支的资源回收', () => {
  let workspace: string;
  let host: ElectronFileHost;
  let sessionId: string;

  beforeEach(async () => {
    delete faults.sync;
    closeCalls.length = 0;
    workspace = await mkdtemp(join(tmpdir(), 'rxdb-file-host-faults-'));
    host = createElectronFileHost({ resolveStorageRoot: () => join(workspace, 'rxdb-files') });
    const opened = await host.handle({ kind: 'file.open' });
    if (opened.kind !== 'file.open') throw new Error(`file.open failed: ${JSON.stringify(opened)}`);
    sessionId = opened.result.sessionId;
    await host.handle({ kind: 'file.mkdir', sessionId, path: '' });
  });

  afterEach(async () => {
    delete faults.sync;
    await host.closeAll();
    await rm(workspace, { recursive: true, force: true });
  });

  const beginWrite = async (path: string): Promise<string> => {
    const begin = await host.handle({ kind: 'file.writeBegin', sessionId, path });
    if (begin.kind !== 'file.writeBegin') throw new Error(`file.writeBegin failed: ${JSON.stringify(begin)}`);
    return begin.result.writeId;
  };

  it('sync() 失败时关闭句柄，而不是把 fd 泄漏到宿主退出', async () => {
    // commitWrite 在 sync() 之前就把这次写入从 session.writes 摘掉了，closeSession 的
    // discardWrite 扫描与 file.writeAbort 都够不着它 —— 这里不关，就没有第二个人会关。
    const writeId = await beginWrite('notes.txt');
    await host.handle({ kind: 'file.writeChunk', sessionId, writeId, chunk: new TextEncoder().encode('hello') });
    faults.sync = () => Promise.reject(new Error('simulated fsync failure'));

    const committed = await host.handle({ kind: 'file.writeCommit', sessionId, writeId });

    expect(committed).toMatchObject({ kind: 'error' });
    expect(closeCalls).toHaveLength(1);
  });

  it('提交失败后额度归还，会话还能继续写', async () => {
    const writeId = await beginWrite('first.txt');
    faults.sync = () => Promise.reject(new Error('simulated fsync failure'));
    await host.handle({ kind: 'file.writeCommit', sessionId, writeId });
    delete faults.sync;

    await expect(beginWrite('second.txt')).resolves.toEqual(expect.any(String));
  });
});
