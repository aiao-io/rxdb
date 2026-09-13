import type { StorageFilesystem, StorageFilesystemFactory } from '@aiao/rxdb-plugin-storage';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createOpfsWorkerFilesystem } from './opfs-worker-filesystem';
import type { OpfsWorkerPort, OpfsWorkerRequest } from './opfs-worker-protocol';

/**
 * 只记投递与终止的 worker 端口替身：本文件要验的是「openWrite 走通道、其余走 base」，
 * 响应交付与崩溃语义由 `opfs-worker-protocol.spec.ts` 覆盖，这里不回放响应。
 */
class FakePort implements OpfsWorkerPort {
  readonly posted: { message: OpfsWorkerRequest; transfer?: Transferable[] }[] = [];
  terminated = 0;

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.posted.push({ message: message as OpfsWorkerRequest, transfer });
  }

  onMessage(): void {
    /* 响应交付语义由 protocol spec 覆盖 */
  }

  onError(): void {
    /* 崩溃语义由 protocol spec 覆盖 */
  }

  terminate(): void {
    this.terminated += 1;
  }
}

/** 全部方法都是 spy 的 base 后端：委托断言精确到「哪个方法、什么参数」。 */
const createFakeBase = (): StorageFilesystem => ({
  lockBackend: undefined,
  ensureRoot: vi.fn(() => Promise.resolve()),
  ensureDirectory: vi.fn(() => Promise.resolve()),
  directoryExists: vi.fn(() => Promise.resolve(false)),
  removeDirectory: vi.fn(() => Promise.resolve()),
  list: vi.fn(() =>
    (async function* () {
      yield* [];
    })()
  ),
  fileExists: vi.fn(() => Promise.resolve(false)),
  readBlob: vi.fn(() => Promise.resolve(new Blob())),
  openRead: vi.fn(() => Promise.resolve(new ReadableStream<Uint8Array>())),
  openWrite: vi.fn(() => Promise.reject(new Error('base openWrite must not be used'))),
  removeFile: vi.fn(() => Promise.resolve()),
  supportsFileMove: vi.fn(() => Promise.resolve(true)),
  moveFile: vi.fn(() => Promise.resolve()),
  supportsDirectoryMove: vi.fn(() => Promise.resolve(true)),
  moveDirectory: vi.fn(() => Promise.resolve()),
  dispose: vi.fn()
});

/** 剥掉注释后静态断言：下面的门禁挡的是具体写法，而 TSDoc 会逐字解释为什么不这么写。 */
const stripTsComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^'"`\n]*?\/\/.*$/gm, '');

describe('createOpfsWorkerFilesystem', () => {
  it('base 工厂收到同一 rootDir 与 context；除 openWrite/dispose 外全部委托 base', async () => {
    const base = createFakeBase();
    const baseFactory: StorageFilesystemFactory = vi.fn(() => base);
    const port = new FakePort();

    const filesystem = createOpfsWorkerFilesystem({ base: baseFactory, port })('files', {
      localAdapterName: 'wa-sqlite'
    });

    expect(baseFactory).toHaveBeenCalledWith('files', { localAdapterName: 'wa-sqlite' });
    expect(filesystem.lockBackend).toBe(base.lockBackend);

    await filesystem.ensureRoot();
    expect(base.ensureRoot).toHaveBeenCalledTimes(1);
    await filesystem.ensureDirectory('/a');
    expect(base.ensureDirectory).toHaveBeenCalledWith('/a');
    await filesystem.directoryExists('/a');
    expect(base.directoryExists).toHaveBeenCalledWith('/a');
    await filesystem.removeDirectory('/a');
    expect(base.removeDirectory).toHaveBeenCalledWith('/a');
    await filesystem.list('/a');
    expect(base.list).toHaveBeenCalledWith('/a');
    await filesystem.fileExists('a.txt');
    expect(base.fileExists).toHaveBeenCalledWith('a.txt');
    await filesystem.readBlob('a.txt');
    expect(base.readBlob).toHaveBeenCalledWith('a.txt');
    await filesystem.openRead('a.txt');
    expect(base.openRead).toHaveBeenCalledWith('a.txt');
    await filesystem.removeFile('a.txt');
    expect(base.removeFile).toHaveBeenCalledWith('a.txt');
    await filesystem.supportsFileMove('a.txt');
    expect(base.supportsFileMove).toHaveBeenCalledWith('a.txt');
    await filesystem.moveFile('a.txt', 'b.txt');
    expect(base.moveFile).toHaveBeenCalledWith('a.txt', 'b.txt');
    await filesystem.supportsDirectoryMove('/a');
    expect(base.supportsDirectoryMove).toHaveBeenCalledWith('/a');
    await filesystem.moveDirectory('/a', '/b');
    expect(base.moveDirectory).toHaveBeenCalledWith('/a', '/b');

    expect(base.openWrite).not.toHaveBeenCalled();
  });

  it('openWrite 走 worker 通道，段列表以 rootDir 打头', async () => {
    const base = createFakeBase();
    const port = new FakePort();

    const filesystem = createOpfsWorkerFilesystem({
      base: vi.fn(() => base),
      port,
      precreateEntry: vi.fn(() => Promise.resolve())
    })('files', {
      localAdapterName: 'wa-sqlite'
    });

    void filesystem.openWrite('notes/a.txt');

    await vi.waitFor(() => expect(port.posted).toHaveLength(1));
    expect(port.posted[0].message).toEqual({ id: 0, kind: 'open', segments: ['files', 'notes', 'a.txt'] });
  });

  it('openWrite 先主线程预建条目再投递 open：段列表一致，预建完成前不投递', async () => {
    const base = createFakeBase();
    const port = new FakePort();
    // 门住的预建：只有手动放行后 open 消息才可能落地，前置性断言因此是确定性的。
    let releasePrecreate!: () => void;
    const precreateEntry = vi.fn(
      () =>
        new Promise<void>(resolve => {
          releasePrecreate = resolve;
        })
    );

    const filesystem = createOpfsWorkerFilesystem({ base: vi.fn(() => base), port, precreateEntry })('files', {
      localAdapterName: 'wa-sqlite'
    });

    void filesystem.openWrite('notes/a.txt');

    await vi.waitFor(() => expect(precreateEntry).toHaveBeenCalledWith(['files', 'notes', 'a.txt']));
    expect(port.posted).toHaveLength(0);
    releasePrecreate();
    await vi.waitFor(() => expect(port.posted).toHaveLength(1));
    expect(port.posted[0].message).toEqual({ id: 0, kind: 'open', segments: ['files', 'notes', 'a.txt'] });
  });

  it('预建失败时 openWrite 拒绝且不向 worker 投递任何消息', async () => {
    const base = createFakeBase();
    const port = new FakePort();

    const filesystem = createOpfsWorkerFilesystem({
      base: vi.fn(() => base),
      port,
      precreateEntry: vi.fn(() => Promise.reject(new Error('pre-create failed')))
    })('files', {
      localAdapterName: 'wa-sqlite'
    });

    await expect(filesystem.openWrite('a.txt')).rejects.toThrow('pre-create failed');
    expect(port.posted).toHaveLength(0);
  });

  it('dispose 同时释放 base 与 worker', () => {
    const base = createFakeBase();
    const port = new FakePort();
    const filesystem = createOpfsWorkerFilesystem({ base: vi.fn(() => base), port })('files', {
      localAdapterName: 'wa-sqlite'
    });

    filesystem.dispose();

    expect(base.dispose).toHaveBeenCalledTimes(1);
    expect(port.terminated).toBe(1);
  });

  it('缺省 worker 由本模块自建并指向 opfs-storage.worker 入口，且不依赖 Tauri 宿主', () => {
    const source = stripTsComments(readFileSync(resolve(import.meta.dirname, 'opfs-worker-filesystem.ts'), 'utf8'));

    // 写通道要修的是 WKWebView 的能力缺口，不是 Tauri 专属问题：装配拖进 Tauri 宿主
    // 模块就会让浏览器预览里（插件默认 OPFS 能写）也背上这条通道的 bundle 开销。
    expect(source).toContain("new Worker(new URL('./opfs-storage.worker', import.meta.url), { type: 'module' })");
    expect(source).not.toContain('@tauri-apps');
  });
});
