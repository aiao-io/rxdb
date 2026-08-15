/**
 * @fileoverview 同一组 storage 行为在两个内容后端上各跑一遍（US-504 AC#2）。
 *
 * @remarks
 * `storage.service.spec.ts` 只覆盖 OPFS 后端，`desktop-filesystem.spec.ts` 只覆盖接缝本身；
 * 「换了后端，storage 的对外行为不变」这句话在这两份里都没有被验证过。本文件就是那句话的凭据：
 * 用例体只写一遍，`describe.each` 在 OPFS 与桌面两个后端上各执行一次，**无跳过项**。
 *
 * 桌面一侧接的是真实 host + 真实临时目录（不是断言 mock），因此这里同时也是
 * 「host 协议 → 原生文件」这条链路的集成测试。
 *
 * @module rxdb-plugin-storage/__tests__/backend-parity
 */

import { DESKTOP_ADAPTER_NAME, type DesktopHostTransport } from '@aiao/rxdb-adapter-desktop';
import { createDesktopFileHost, type DesktopFileHost } from '@aiao/rxdb-adapter-desktop/host';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopStorageFilesystem } from '../desktop.js';
import { createOpfsStorageFilesystem } from '../filesystem/opfs-filesystem.js';
import type { StorageFilesystem } from '../filesystem/storage-filesystem.js';
import { ObjectUrlRegistry } from '../object-url.js';
import type { RxdbFileStorage, RxDBStoragePluginOptions } from '../storage.service.js';
import { createService, FakeStorageFileMeta, MemoryDirectoryHandle } from './fixtures/memory-storage.js';

/**
 * 一个可被参数化套件驱动的内容后端。
 *
 * @remarks
 * 只暴露「怎么装上」与「怎么从后端背后看一眼」两件事 —— 用例体不得知道自己跑在哪个后端上，
 * 否则「行为一致」就退化成了「两套用例各自通过」。
 */
interface ParityBackend {
  /** 出现在测试标题里的后端名。 */
  readonly name: string;
  /** 该后端要求的 `sync.local.adapter`；桌面后端据此判定是否允许启用（AC#9）。 */
  readonly localAdapterName: string;
  /** 准备后端并返回插件选项。 */
  setup(): Promise<RxDBStoragePluginOptions>;
  /** 回收后端占用的会话与临时目录。 */
  teardown(): Promise<void>;
  /** 另开一个独立的接缝实例，用于绕过 service 制造孤立文件。 */
  createRawFilesystem(): StorageFilesystem;
  /** 后端里残留的临时条目名；补偿正确时应当为空。 */
  temporaryNames(): Promise<string[]>;
}

/** 临时条目的判据：service 层的 `.rxdb-storage-*` 与 host 层的 `*.rxdb-tmp`。 */
const isTemporaryName = (name: string): boolean => name.includes('.rxdb-storage-') || name.endsWith('.rxdb-tmp');

/** 递归收集内存目录树里的全部条目名。 */
const collectMemoryNames = (directory: MemoryDirectoryHandle): string[] => {
  const names = [...directory.files.keys()];
  for (const [name, child] of directory.directories) {
    names.push(name, ...collectMemoryNames(child));
  }
  return names;
};

/** 递归收集磁盘目录树里的全部条目名。 */
const collectDiskNames = async (directory: string): Promise<string[]> => {
  const names: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    names.push(entry.name);
    if (entry.isDirectory()) names.push(...(await collectDiskNames(join(directory, entry.name))));
  }
  return names;
};

const createOpfsBackend = (): ParityBackend => {
  let rootHandle = new MemoryDirectoryHandle();

  return {
    name: 'opfs',
    localAdapterName: 'sqlite',
    async setup() {
      rootHandle = new MemoryDirectoryHandle();
      Object.defineProperty(globalThis, 'navigator', {
        value: { storage: { getDirectory: vi.fn(async () => rootHandle) } },
        configurable: true
      });
      return {};
    },
    async teardown() {
      // 内存句柄随 rootHandle 一起被下一次 setup 丢掉，没有需要归还的资源。
    },
    createRawFilesystem() {
      return createOpfsStorageFilesystem('files', { localAdapterName: 'sqlite' });
    },
    async temporaryNames() {
      return collectMemoryNames(rootHandle).filter(isTemporaryName).sort();
    }
  };
};

const createDesktopBackend = (): ParityBackend => {
  let workspace = '';
  let host: DesktopFileHost | null = null;
  let transport: DesktopHostTransport | null = null;

  return {
    name: 'desktop',
    localAdapterName: DESKTOP_ADAPTER_NAME,
    async setup() {
      workspace = await mkdtemp(join(tmpdir(), 'rxdb-parity-'));
      const created = createDesktopFileHost({ resolveStorageRoot: () => join(workspace, 'rxdb-files') });
      host = created;
      // 直连 host：renderer 侧后端接的是真实文件系统，不是断言 mock。
      transport = { request: payload => created.handle(payload), subscribe: () => () => undefined };
      return { filesystem: createDesktopStorageFilesystem({ transport }) };
    },
    async teardown() {
      host?.closeAll();
      host = null;
      transport = null;
      await rm(workspace, { recursive: true, force: true });
    },
    createRawFilesystem() {
      if (!transport) throw new Error('desktop backend not set up');
      return createDesktopStorageFilesystem({ transport })('files', { localAdapterName: DESKTOP_ADAPTER_NAME });
    },
    async temporaryNames() {
      return (await collectDiskNames(workspace)).filter(isTemporaryName).sort();
    }
  };
};

const textFile = (name: string, content: string): File => new File([content], name, { type: 'text/plain' });

describe.each([createOpfsBackend(), createDesktopBackend()])('storage 行为一致性（$name 后端）', backend => {
  let options: RxDBStoragePluginOptions;
  const started: RxdbFileStorage[] = [];

  /** 造一个接在当前后端上的 service，并登记到 afterEach 的回收表里。 */
  const makeService = (
    objectUrls: ObjectUrlRegistry = new ObjectUrlRegistry(() => 'blob:x', vi.fn())
  ): { service: RxdbFileStorage } => {
    const built = createService(options, objectUrls, FakeStorageFileMeta, backend.localAdapterName);
    started.push(built.service);
    return built;
  };

  /** 写一个没有 metadata 的文件，绕过 service 直接落到后端上。 */
  const writeOrphanFile = async (path: string, content: string): Promise<void> => {
    const filesystem = backend.createRawFilesystem();
    try {
      await filesystem.ensureRoot();
      const writer = await filesystem.openWrite(path);
      await writer.write(new TextEncoder().encode(content));
      await writer.close();
    } finally {
      filesystem.dispose();
    }
  };

  beforeEach(async () => {
    FakeStorageFileMeta.reset();
    options = await backend.setup();
    Object.defineProperty(globalThis, 'window', {
      value: { document, URL, showSaveFilePicker: undefined },
      configurable: true
    });
  });

  afterEach(async () => {
    await Promise.all(started.splice(0).map(service => service.destroy()));
    await backend.teardown();
    vi.unstubAllGlobals();
  });

  it('上传后可按 ID 读回，删除后 metadata 与内容一并消失', async () => {
    const { service } = makeService();

    const meta = await service.upload(textFile('avatar.txt', 'hello'), { path: '/avatars' });

    expect(meta.opfsPath).toBe('avatars/avatar.txt');
    expect(meta.size).toBe(5);
    await expect((await service.read(meta.id)).text()).resolves.toBe('hello');
    expect(await service.getMeta(meta.id)).toMatchObject({ id: meta.id, name: 'avatar.txt' });

    await service.delete(meta.id);

    expect(await service.getMeta(meta.id)).toBeNull();
    await expect(service.read(meta.id)).rejects.toThrow('Storage file meta not found');
  });

  it('同路径重复上传未开 overwrite 即冲突，且旧内容与临时文件都不受影响', async () => {
    const { service } = makeService();
    const meta = await service.upload(textFile('doc.txt', 'v1'));

    await expect(service.upload(textFile('doc.txt', 'v2'))).rejects.toThrow('File already exists');

    await expect((await service.read(meta.id)).text()).resolves.toBe('v1');
    await expect(backend.temporaryNames()).resolves.toEqual([]);
  });

  it('overwrite 保留原 ID 并递增 contentVersion', async () => {
    const { service } = makeService();

    const first = await service.upload(textFile('doc.txt', 'v1'));
    const second = await service.upload(textFile('doc.txt', 'v2'), { overwrite: true });

    expect(second.id).toBe(first.id);
    expect(second.contentVersion).toBe(2);
    await expect((await service.read(second.id)).text()).resolves.toBe('v2');
    await expect(backend.temporaryNames()).resolves.toEqual([]);
  });

  it('list 按「整库 / 直属 / 递归」三种作用域返回 metadata', async () => {
    const { service } = makeService();
    await service.upload(textFile('a.txt', 'a'));
    await service.upload(textFile('b.txt', 'b'), { path: '/docs' });
    await service.upload(textFile('c.txt', 'c'), { path: '/docs/deep' });

    const paths = async (listOptions?: Parameters<RxdbFileStorage['list']>[0]) =>
      (await service.list(listOptions)).map(meta => meta.opfsPath);

    await expect(paths()).resolves.toEqual(['a.txt', 'docs/b.txt', 'docs/deep/c.txt']);
    await expect(paths({ path: '/docs' })).resolves.toEqual(['docs/b.txt']);
    await expect(paths({ path: '/docs', recursive: true })).resolves.toEqual(['docs/b.txt', 'docs/deep/c.txt']);
  });

  it('listEntries 目录在前、名称升序，且孤立文件不暴露给调用方', async () => {
    const { service } = makeService();
    await service.init();
    await service.createDirectory('deep', { path: '/docs' });
    await service.upload(textFile('b.txt', 'b'), { path: '/docs' });
    await writeOrphanFile('docs/orphan.bin', 'x');

    const entries = await service.listEntries({ path: '/docs' });

    expect(entries.map(entry => `${entry.kind}:${entry.name}`)).toEqual(['directory:deep', 'file:b.txt']);
  });

  it('createDirectory 建出可枚举的空目录', async () => {
    const { service } = makeService();

    const path = await service.createDirectory('archive');

    expect(path).toBe('/archive');
    await expect(service.listEntries()).resolves.toEqual([{ kind: 'directory', name: 'archive', path: '/archive' }]);
  });

  it('rename 在原目录内改名，ID 与内容保持不变', async () => {
    const { service } = makeService();
    const meta = await service.upload(textFile('old.txt', 'data'), { path: '/docs' });

    const renamed = await service.rename(meta.id, 'new.txt');

    expect(renamed.id).toBe(meta.id);
    expect(renamed.opfsPath).toBe('docs/new.txt');
    await expect((await service.read(meta.id)).text()).resolves.toBe('data');
    await expect(service.list({ path: '/docs' })).resolves.toHaveLength(1);
  });

  it('rename 冲突时按 overwrite 决定拒绝还是整体替换', async () => {
    const { service } = makeService();
    const source = await service.upload(textFile('source.txt', 'source'));
    const target = await service.upload(textFile('target.txt', 'target'));

    await expect(service.rename(source.id, 'target.txt')).rejects.toThrow('File already exists');

    const replaced = await service.rename(source.id, 'target.txt', { overwrite: true });

    expect(replaced.id).toBe(source.id);
    expect(await service.getMeta(target.id)).toBeNull();
    await expect((await service.read(source.id)).text()).resolves.toBe('source');
    await expect(backend.temporaryNames()).resolves.toEqual([]);
  });

  it('renameDirectory 整棵子树跟着改名，内容仍可读', async () => {
    const { service } = makeService();
    const meta = await service.upload(textFile('c.txt', 'c'), { path: '/docs/deep' });

    const path = await service.renameDirectory('/docs', 'papers');

    expect(path).toBe('/papers');
    expect((await service.getMeta(meta.id))?.opfsPath).toBe('papers/deep/c.txt');
    await expect((await service.read(meta.id)).text()).resolves.toBe('c');
    await expect(service.listEntries()).resolves.toEqual([{ kind: 'directory', name: 'papers', path: '/papers' }]);
  });

  it('clear 按作用域清理：带路径只清子树，不带路径清空整库', async () => {
    const { service } = makeService();
    const kept = await service.upload(textFile('a.txt', 'a'));
    await service.upload(textFile('b.txt', 'b'), { path: '/docs' });

    await service.clear('/docs');

    await expect(service.list()).resolves.toHaveLength(1);
    await expect((await service.read(kept.id)).text()).resolves.toBe('a');

    await service.clear();

    await expect(service.list()).resolves.toEqual([]);
    expect(await service.getMeta(kept.id)).toBeNull();
  });

  it('watch 先发当前值，改名与删除后各发一次', async () => {
    const { service } = makeService();
    const meta = await service.upload(textFile('test.txt', 'initial'));
    const values: Array<{ name: string } | null> = [];
    const subscription = service.watch(meta.id).subscribe(value => values.push(value));

    await vi.waitFor(() => expect(values[0]?.name).toBe('test.txt'));

    await service.rename(meta.id, 'renamed.txt');
    await vi.waitFor(() => expect(values[values.length - 1]?.name).toBe('renamed.txt'));

    await service.delete(meta.id);
    await vi.waitFor(() => expect(values[values.length - 1]).toBeNull());

    subscription.unsubscribe();
  });

  it('preview 与 createObjectUrl 由服务持有 URL，revoke 后归还', async () => {
    const revokeImpl = vi.fn();
    const { service } = makeService(new ObjectUrlRegistry(blob => `blob:${blob.size}`, revokeImpl));
    const meta = await service.upload(new File(['preview'], 'photo.png', { type: 'image/png' }));

    const preview = await service.preview(meta.id);

    expect(preview.type).toBe('image/png');
    preview.dispose();
    expect(revokeImpl).toHaveBeenCalledWith(preview.url);

    const url = await service.createObjectUrl(meta.id);
    expect(service.activeObjectUrlCount).toBe(1);

    service.revokeObjectUrl(url);
    expect(service.activeObjectUrlCount).toBe(0);
  });

  it('download 在没有文件选择器时走锚点回退，并释放临时 URL', async () => {
    const revokeImpl = vi.fn();
    const { service } = makeService(new ObjectUrlRegistry(() => 'blob:download-url', revokeImpl));
    const meta = await service.upload(textFile('file.txt', 'data'));
    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
      (node as HTMLAnchorElement).click = click;
      click();
      return node;
    });
    const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation(node => node);

    await service.download(meta.id);

    expect(click).toHaveBeenCalled();
    expect(revokeImpl).toHaveBeenCalledWith('blob:download-url');
    expect(service.activeObjectUrlCount).toBe(0);

    appendChild.mockRestore();
    removeChild.mockRestore();
  });

  it('fetch 首次落盘、二次命中缓存不再发请求', async () => {
    const fetchMock = vi.fn(async () => new Response('remote', { headers: { 'content-type': 'text/plain' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { service } = makeService();

    const first = await service.fetch('cache/remote.txt', { url: 'https://example.test/remote.txt' });
    const second = await service.fetch('cache/remote.txt', { url: 'https://example.test/remote.txt' });

    await expect(first.text()).resolves.toBe('remote');
    await expect(second.text()).resolves.toBe('remote');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(backend.temporaryNames()).resolves.toEqual([]);
  });

  it('含空格、非 ASCII 与保留字符的名字往返一致', async () => {
    const { service } = makeService();
    // 桌面后端要把这些字符编码成原生文件系统接受的物理名再解码回来；
    // OPFS 直存。两边的对外表现必须一模一样，否则「换后端不改行为」就是空话。
    const name = '笔 记:v1?.txt';

    const meta = await service.upload(textFile(name, 'note'), { path: '/文档' });

    expect(meta.opfsPath).toBe(`文档/${name}`);
    await expect((await service.read(meta.id)).text()).resolves.toBe('note');
    await expect(service.listEntries({ path: '/文档' })).resolves.toEqual([
      { kind: 'file', name, path: `/文档/${name}`, meta: expect.objectContaining({ id: meta.id }) }
    ]);
  });
});
