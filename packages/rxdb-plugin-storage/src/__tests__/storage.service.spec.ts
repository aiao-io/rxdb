import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageFetchError, StorageMimeTypeMissingError, StorageOfflineError } from '../errors.js';
import { createOpfsStorageFilesystem } from '../filesystem/opfs-filesystem.js';
import type { StorageFilesystemFactory } from '../filesystem/storage-filesystem.js';
import { ObjectUrlRegistry } from '../object-url.js';
import {
  getDirectoryPathFromOpfsPath,
  isOpfsPathInDirectory,
  isOpfsPathInsideDirectory,
  joinDirectoryAndFileName,
  normalizeDirectoryPath,
  normalizeRelativeOpfsPath,
  toAbsoluteStoragePath
} from '../storage.service.js';
import {
  createService,
  FakeStorageFileMeta,
  MemoryDirectoryHandle,
  MemoryFileHandle
} from './fixtures/memory-storage.js';
import { isTemporaryStorageName } from './storage-backend-parity.suite.js';


describe('RxdbFileStorage', () => {
  let rootHandle: MemoryDirectoryHandle;

  const expectNoTemporaryEntries = (): void => {
    const storageRoot = rootHandle.directories.get('files');
    if (!storageRoot) return;
    const entryNames = [...storageRoot.files.keys(), ...storageRoot.directories.keys()];
    expect(entryNames.filter(name => name.startsWith('.rxdb-storage-'))).toEqual([]);
  };

  beforeEach(() => {
    rootHandle = new MemoryDirectoryHandle();
    FakeStorageFileMeta.reset();

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: {
          getDirectory: vi.fn(async () => rootHandle)
        }
      },
      configurable: true
    });

    Object.defineProperty(globalThis, 'window', {
      value: {
        document,
        URL,
        showSaveFilePicker: undefined
      },
      configurable: true
    });
  });

  it('should upload, read and delete files with metadata', async () => {
    const { service } = createService({}, new ObjectUrlRegistry((blob: Blob) => `blob:${blob.size}`, vi.fn()));

    const meta = await service.upload(new File(['hello'], 'avatar.txt', { type: 'text/plain' }), { path: '/avatars' });
    const blob = await service.read(meta.id);

    expect(meta.opfsPath).toBe('avatars/avatar.txt');
    expect(await blob.text()).toBe('hello');

    await service.delete(meta.id);

    expect(await service.getMeta(meta.id)).toBeNull();
  });

  it('should create disposable previews', async () => {
    const revokeImpl = vi.fn();
    const { service } = createService({}, new ObjectUrlRegistry(() => 'blob:preview', revokeImpl));

    const meta = await service.upload(new File(['preview'], 'photo.png', { type: 'image/png' }));
    const preview = await service.preview(meta.id);

    expect(preview.url).toBe('blob:preview');
    expect(preview.type).toBe('image/png');

    preview.dispose();

    expect(revokeImpl).toHaveBeenCalledWith('blob:preview');
  });

  it('should throw on upload conflict without overwrite', async () => {
    const { service } = createService();

    await service.upload(new File(['v1'], 'doc.txt', { type: 'text/plain' }));
    await expect(service.upload(new File(['v2'], 'doc.txt', { type: 'text/plain' }))).rejects.toThrow(
      'File already exists'
    );
    expectNoTemporaryEntries();
  });

  it('should overwrite on upload with overwrite: true', async () => {
    const { service } = createService();

    const meta1 = await service.upload(new File(['v1'], 'doc.txt', { type: 'text/plain' }));
    const meta2 = await service.upload(new File(['v2'], 'doc.txt', { type: 'text/plain' }), { overwrite: true });

    expect(meta2.id).toBe(meta1.id);
    expect(meta2.contentVersion).toBe(2);
    const blob = await service.read(meta2.id);
    expect(await blob.text()).toBe('v2');
  });

  /**
   * 按 File System 标准，`FileSystemFileHandle.getFile()` 返回的 `File` 绑定的是
   * **调用那一刻**的磁盘 snapshot state；文件此后被修改或删除，该 File 即不可读，
   * 读取抛 `NotReadableError`。
   *
   * 而回滚流程恰恰是「先读快照 → 覆写文件 → 失败时用快照还原」——快照在覆写那一步就失效了，
   * 回滚自身抛错，最终 OPFS 留新内容、RxDB 留旧 meta，正是 README 声称要避免的不一致。
   *
   * 既有测试替身的 `getFile()` 每次都从当前 blob 新建 File、永不失效，所以从未抓到；
   * 且 `restoreFileState` 的 `previous !== null` 分支在覆盖率里完全未覆盖。
   * 这里的替身按标准语义模拟失效。
   */
  it('元数据写入失败时，能用覆写前的内容真正回滚（快照必须脱离磁盘）', async () => {
    const { service, repository } = createService();

    await service.upload(new File(['v1'], 'doc.txt', { type: 'text/plain' }));

    // 覆写时让 meta 更新失败，逼出回滚路径
    const updateSpy = vi.spyOn(repository, 'update').mockRejectedValueOnce(new Error('meta write failed'));

    await expect(
      service.upload(new File(['v2-longer'], 'doc.txt', { type: 'text/plain' }), { overwrite: true })
    ).rejects.toThrow('meta write failed');

    updateSpy.mockRestore();

    // 回滚必须真正生效：内容回到 v1，而不是留下 v2 + 旧 meta
    const metas = await repository.find({});
    const restored = await service.read(metas[0].id);
    expect(await restored.text()).toBe('v1');
    expectNoTemporaryEntries();
  });

  it('should stream every rollback chunk and remove the temporary journal', async () => {
    const { service, repository } = createService();
    const original = `${'a'.repeat(70_000)}${'b'.repeat(70_000)}`;
    const meta = await service.upload(new File([original], 'large.txt', { type: 'text/plain' }));
    vi.spyOn(repository, 'update').mockRejectedValueOnce(new Error('meta write failed'));

    await expect(
      service.upload(new File(['replacement'], 'large.txt', { type: 'text/plain' }), { overwrite: true })
    ).rejects.toThrow('meta write failed');

    expect(await (await service.read(meta.id)).text()).toBe(original);
    expectNoTemporaryEntries();
  });

  /**
   * check-then-act 全程无互斥：两个并发 upload 同一路径时，B 的 meta 因唯一索引写入失败，
   * 回滚走 `restoreFileState(path, null)` → `removeFile(path)`，把 **A 刚成功注册的文件删掉**，
   * 留下「meta 存在、OPFS 文件不存在」的孤儿 meta。
   */
  it('同路径并发上传：失败的一方不得删除另一方已成功落盘的文件', async () => {
    const { service, repository } = createService();
    const originalCreate = repository.create.bind(repository);
    let created = 0;
    // 模拟 opfs_path 唯一索引：第二条 meta 写入被拒
    vi.spyOn(repository, 'create').mockImplementation(async entity => {
      created += 1;
      if (created > 1) throw new Error('duplicate key value violates unique constraint "opfs_path"');
      return originalCreate(entity);
    });

    const results = await Promise.allSettled([
      service.upload(new File(['A'], 'race.txt', { type: 'text/plain' })),
      service.upload(new File(['B'], 'race.txt', { type: 'text/plain' }))
    ]);

    const succeeded = results.filter(r => r.status === 'fulfilled');
    expect(succeeded).toHaveLength(1);

    // 成功那一方的文件必须还在，能正常读出
    const metas = await repository.find({});
    expect(metas).toHaveLength(1);
    await expect(service.read(metas[0].id)).resolves.toBeInstanceOf(Blob);
  });

  it('clear() 必须删光所有根条目（不得因边迭代边删而漏删）', async () => {
    const { service } = createService();

    await service.upload(new File(['x'], 'a.txt', { type: 'text/plain' }));

    const storageRoot = await rootHandle.getDirectoryHandle('files');
    // 注入孤儿条目（不在 meta 里）：`clear()` 的按 meta 删除阶段碰不到它们，
    // 只能靠根目录扫描清掉 —— 这才让「边迭代边删」的跳项真正暴露出来
    for (const name of ['orphan-1.txt', 'orphan-2.txt', 'orphan-3.txt', 'orphan-4.txt']) {
      await storageRoot.getFileHandle(name, { create: true });
    }
    await storageRoot.getDirectoryHandle('orphan-dir', { create: true });
    const before: string[] = [];
    for await (const [name] of storageRoot.entries()) before.push(name);
    expect(before.length).toBeGreaterThan(1);

    await service.clear();

    // 清的是存储根内部；`files` 目录本身保留
    const remaining: string[] = [];
    for await (const [name] of storageRoot.entries()) remaining.push(name);
    expect(remaining).toEqual([]);
  });

  it('download() 不得把写入阶段的 AbortError 当成用户取消而静默假成功', async () => {
    const { service } = createService();
    const meta = await service.upload(new File(['data'], 'doc.txt', { type: 'text/plain' }));

    const abort = new DOMException('The write was aborted', 'AbortError');
    (globalThis as unknown as { window: Record<string, unknown> }).window['showSaveFilePicker'] = vi.fn(async () => ({
      createWritable: async () => ({
        write: async () => {
          throw abort;
        },
        close: async () => undefined,
        abort: async () => undefined
      })
    }));

    // 用户取消选择器才该静默返回；写入阶段中断必须上抛，否则调用方以为已保存
    await expect(service.download(meta.id)).rejects.toThrow('The write was aborted');
  });

  it('download() 在用户取消选择器时仍静默返回', async () => {
    const { service } = createService();
    const meta = await service.upload(new File(['data'], 'doc.txt', { type: 'text/plain' }));

    (globalThis as unknown as { window: Record<string, unknown> }).window['showSaveFilePicker'] = vi.fn(async () => {
      throw new DOMException('The user aborted a request', 'AbortError');
    });

    await expect(service.download(meta.id)).resolves.toBeUndefined();
  });

  it('should use the binary MIME fallback when the uploaded File has no type', async () => {
    const { service } = createService();

    const meta = await service.upload(new File(['binary'], 'data.bin'));

    expect(meta.mimeType).toBe('application/octet-stream');
    expect((await service.read(meta.id)).type).toBe('application/octet-stream');
  });

  it('should return the existing metadata when renaming a file to the same name', async () => {
    const { repository, service } = createService();
    const meta = await service.upload(new File(['same'], 'same.txt', { type: 'text/plain' }));
    const updateSpy = vi.spyOn(repository, 'update');

    await expect(service.rename(meta.id, 'same.txt')).resolves.toBe(meta);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('should reject renaming the root directory', async () => {
    const { service } = createService();

    await expect(service.renameDirectory('/', 'renamed')).rejects.toThrow('Root directory cannot be renamed');
  });

  it('should omit orphan OPFS files and sort directories before files', async () => {
    const { service } = createService();
    await service.init();

    const storageRoot = rootHandle.directories.get('files');
    expect(storageRoot).toBeDefined();
    if (!storageRoot) throw new Error('Storage root was not created');

    await storageRoot.getFileHandle('orphan.txt', { create: true });
    await service.createDirectory('docs');
    await service.upload(new File(['tracked'], 'tracked.txt', { type: 'text/plain' }));

    const entries = await service.listEntries();
    expect(entries.map(entry => [entry.kind, entry.name])).toEqual([
      ['directory', 'docs'],
      ['file', 'tracked.txt']
    ]);
  });

  it('should preserve the write error and remove a new file when upload write and close both fail', async () => {
    const { service } = createService();
    const writeError = new Error('write failed');
    const closeError = new Error('close failed');

    await service.init();
    const storageRoot = rootHandle.directories.get('files');
    expect(storageRoot).toBeDefined();
    if (!storageRoot) return;

    storageRoot.fileHandleFactory = name => new MemoryFileHandle(name, { writeError, closeError });

    await expect(service.upload(new File(['broken'], 'broken.txt'))).rejects.toBe(writeError);
    expect(storageRoot.files.has('broken.txt')).toBe(false);
    expect(FakeStorageFileMeta.store.size).toBe(0);
    expectNoTemporaryEntries();
  });

  it('should keep the original file and metadata when rename metadata update fails', async () => {
    const { repository, service } = createService();
    const meta = await service.upload(new File(['original'], 'old.txt', { type: 'text/plain' }), { path: '/docs' });
    const updateError = new Error('metadata update failed');
    vi.spyOn(repository, 'update').mockRejectedValueOnce(updateError);

    await expect(service.rename(meta.id, 'new.txt')).rejects.toBe(updateError);

    expect(meta.name).toBe('old.txt');
    expect(meta.opfsPath).toBe('docs/old.txt');
    expect(await (await service.read(meta.id)).text()).toBe('original');
    expect((await service.listEntries({ path: '/docs' })).map(entry => entry.name)).toEqual(['old.txt']);
    expectNoTemporaryEntries();
  });

  it('should keep the file when delete metadata removal fails', async () => {
    const { repository, service } = createService();
    const meta = await service.upload(new File(['keep'], 'keep.txt', { type: 'text/plain' }));
    const removeError = new Error('metadata remove failed');
    vi.spyOn(repository, 'remove').mockRejectedValueOnce(removeError);

    await expect(service.delete(meta.id)).rejects.toBe(removeError);

    expect(await service.getMeta(meta.id)).toBe(meta);
    expect(await (await service.read(meta.id)).text()).toBe('keep');
  });

  it('should throw on read when file meta not found', async () => {
    const { service } = createService();

    await expect(service.read('nonexistent')).rejects.toThrow('Storage file meta not found');
  });

  it('should return null from getMeta for non-existent id', async () => {
    const { service } = createService();

    expect(await service.getMeta('nonexistent')).toBeNull();
  });

  it('should throw on preview when file exceeds limit', async () => {
    const { service } = createService({ previewLimitBytes: 10 });

    const meta = await service.upload(new File(['a'.repeat(20)], 'big.txt', { type: 'text/plain' }));
    await expect(service.preview(meta.id)).rejects.toThrow('Preview file exceeds limit');
  });

  it('should list files filtered by path', async () => {
    const { service } = createService();

    await service.upload(new File(['a'], 'a.txt', { type: 'text/plain' }), { path: '/docs' });
    await service.upload(new File(['b'], 'b.txt', { type: 'text/plain' }), { path: '/images' });
    await service.upload(new File(['c'], 'c.txt', { type: 'text/plain' }), { path: '/docs' });

    const docsFiles = await service.list({ path: '/docs' });
    expect(docsFiles).toHaveLength(2);
    expect(docsFiles.map(m => m.name)).toEqual(['a.txt', 'c.txt']);

    const allFiles = await service.list();
    expect(allFiles).toHaveLength(3);
  });

  // STOR-005：`''` 经 `normalizeDirectoryPath` 就是根目录，但它是假值，
  // 于是走进「未传 path」分支返回全树 —— 同一个规范化结果有两套行为。
  it('should treat an empty path string as the root directory', async () => {
    const { service } = createService();

    await service.upload(new File(['root'], 'root.txt', { type: 'text/plain' }), {});
    await service.upload(new File(['nested'], 'nested.txt', { type: 'text/plain' }), { path: '/docs' });

    expect((await service.list({ path: '' })).map(meta => meta.name)).toEqual(['root.txt']);
    expect((await service.list({ path: '/' })).map(meta => meta.name)).toEqual(['root.txt']);
  });

  // 默认（不传 path）返回全树是既定行为，但此前只能靠「省略 path」触发，
  // 指定目录时无法递归。补显式 recursive，让两种意图都能表达。
  it('should list a subtree when recursive is set', async () => {
    const { service } = createService();

    await service.upload(new File(['a'], 'a.txt', { type: 'text/plain' }), { path: '/docs' });
    await service.upload(new File(['b'], 'b.txt', { type: 'text/plain' }), { path: '/docs/nested' });
    await service.upload(new File(['c'], 'c.txt', { type: 'text/plain' }), { path: '/images' });

    expect((await service.list({ path: '/docs' })).map(meta => meta.name)).toEqual(['a.txt']);
    expect((await service.list({ path: '/docs', recursive: true })).map(meta => meta.name)).toEqual(['a.txt', 'b.txt']);
    expect((await service.list({ path: '', recursive: true })).map(meta => meta.name)).toEqual([
      'a.txt',
      'b.txt',
      'c.txt'
    ]);
  });

  it('should create directories and list browser entries', async () => {
    const { service } = createService();

    await service.createDirectory('empty');
    await service.upload(new File(['doc'], 'guide.txt', { type: 'text/plain' }), { path: '/docs' });

    const rootEntries = await service.listEntries();
    expect(rootEntries).toEqual([
      { kind: 'directory', name: 'docs', path: '/docs' },
      { kind: 'directory', name: 'empty', path: '/empty' }
    ]);

    const docsEntries = await service.listEntries({ path: '/docs' });
    expect(docsEntries).toHaveLength(1);
    expect(docsEntries[0].kind).toBe('file');

    if (docsEntries[0]?.kind === 'file') {
      expect(docsEntries[0].name).toBe('guide.txt');
      expect(docsEntries[0].path).toBe('/docs/guide.txt');
      expect(docsEntries[0].meta.opfsPath).toBe('docs/guide.txt');
    }
  });

  it('should rename a file without changing its contents', async () => {
    const { service } = createService();

    const meta = await service.upload(new File(['hello'], 'old.txt', { type: 'text/plain' }), { path: '/docs' });
    const renamed = await service.rename(meta.id, 'new.txt');

    expect(renamed.name).toBe('new.txt');
    expect(renamed.opfsPath).toBe('docs/new.txt');

    const blob = await service.read(meta.id);
    expect(await blob.text()).toBe('hello');

    const docsEntries = await service.listEntries({ path: '/docs' });
    expect(docsEntries).toHaveLength(1);
    expect(docsEntries[0].kind).toBe('file');

    if (docsEntries[0]?.kind === 'file') {
      expect(docsEntries[0].name).toBe('new.txt');
      expect(docsEntries[0].path).toBe('/docs/new.txt');
    }
  });

  it('should use OPFS move() for a supported file handle', async () => {
    const { service } = createService();
    const meta = await service.upload(new File(['payload'], 'old.txt', { type: 'text/plain' }), { path: '/docs' });
    const docs = rootHandle.directories.get('files')?.directories.get('docs');
    const sourceHandle = docs?.files.get('old.txt');
    if (!docs || !sourceHandle) throw new Error('missing source file');
    let currentName = 'old.txt';
    const move = vi.fn(async (name: string) => {
      docs.files.delete(currentName);
      docs.files.set(name, sourceHandle);
      currentName = name;
    });
    Object.assign(sourceHandle, { move });
    const getFile = vi.spyOn(sourceHandle, 'getFile');

    const renamed = await service.rename(meta.id, 'new.txt');

    expect(move).toHaveBeenCalledWith('new.txt');
    expect(getFile).not.toHaveBeenCalled();
    expect(renamed.opfsPath).toBe('docs/new.txt');
    expect(await (await service.read(renamed.id)).text()).toBe('payload');
    expectNoTemporaryEntries();
  });

  it('should roll back OPFS move() and the overwritten target when metadata update fails', async () => {
    const { repository, service } = createService();
    const source = await service.upload(new File(['source'], 'source.txt', { type: 'text/plain' }), { path: '/docs' });
    const target = await service.upload(new File(['target'], 'target.txt', { type: 'text/plain' }), { path: '/docs' });
    const docs = rootHandle.directories.get('files')?.directories.get('docs');
    const sourceHandle = docs?.files.get('source.txt');
    if (!docs || !sourceHandle) throw new Error('missing source file');
    let currentName = 'source.txt';
    const move = vi.fn(async (name: string) => {
      docs.files.delete(currentName);
      docs.files.set(name, sourceHandle);
      currentName = name;
    });
    Object.assign(sourceHandle, { move });
    vi.spyOn(repository, 'update').mockRejectedValueOnce(new Error('metadata update failed'));

    await expect(service.rename(source.id, 'target.txt', { overwrite: true })).rejects.toThrow(
      'metadata update failed'
    );

    expect(move).toHaveBeenNthCalledWith(1, 'target.txt');
    expect(move).toHaveBeenNthCalledWith(2, 'source.txt');
    expect(await (await service.read(source.id)).text()).toBe('source');
    expect(await (await service.read(target.id)).text()).toBe('target');
    expectNoTemporaryEntries();
  });

  it('should replace the target file and metadata when rename overwrite is enabled', async () => {
    const { service } = createService();

    const firstMeta = await service.upload(new File(['first'], 'a.txt', { type: 'text/plain' }), { path: '/docs' });
    const secondMeta = await service.upload(new File(['second'], 'b.txt', { type: 'text/plain' }), { path: '/docs' });

    const renamed = await service.rename(firstMeta.id, 'b.txt', { overwrite: true });

    expect(renamed.id).toBe(firstMeta.id);
    expect(renamed.opfsPath).toBe('docs/b.txt');
    expect(await (await service.read(firstMeta.id)).text()).toBe('first');
    await expect(service.read(secondMeta.id)).rejects.toThrow(/not found/i);

    const docsEntries = await service.listEntries({ path: '/docs' });
    expect(docsEntries).toHaveLength(1);
    expect(docsEntries.map(entry => entry.name)).toEqual(['b.txt']);
  });

  // STOR-002：`#withPathLock` 只有 upload 用，rename 全程在锁外做
  // 「预检 → 写 OPFS → 写 metadata → 补偿」。确定性交错：
  // rename 预检目标不存在（previousTarget = null），随后 upload 在同一目标成功提交；
  // rename 的 metadata 更新因唯一索引失败，回滚按 null 把目标文件删掉 ——
  // 于是 upload 的 meta 还在、文件却没了。所有写路径必须共用同一套多路径锁协议。
  it('never leaves a meta without its file when rename and upload race on one path', async () => {
    const { repository, service } = createService();
    const first = await service.upload(new File(['first'], 'a.txt', { type: 'text/plain' }), { path: '/docs' });

    // 真实后端在 opfsPath 上有唯一索引；FakeRepository 没有，这里补上，
    // 否则复现不出 finding 描述的「metadata 更新失败 → 回滚删掉别人的文件」。
    const update = repository.update.bind(repository);
    vi.spyOn(repository, 'update').mockImplementation(async (entity, patch) => {
      const targetPath = patch.opfsPath;
      const owner =
        targetPath ? await repository.find({ where: { rules: [{ field: 'opfsPath', value: targetPath }] } }) : [];
      if (owner.some(other => other.id !== entity.id)) {
        throw new Error('unique index violation on opfsPath');
      }
      return update(entity, patch);
    });

    // 卡在 rename 的第 3 次 find（`read(fileId)`）—— 此时它已完成目标预检、
    // 已把 previousTarget 快照成 null，但还没写目标文件。
    const find = repository.find.bind(repository);
    let findCalls = 0;
    let releaseRename!: () => void;
    const renameParked = new Promise<void>(resolveParked => {
      vi.spyOn(repository, 'find').mockImplementation(async options => {
        findCalls += 1;
        if (findCalls === 3) {
          resolveParked();
          await new Promise<void>(resolveRelease => {
            releaseRename = resolveRelease;
          });
        }
        return find(options);
      });
    });

    const renamePromise = service.rename(first.id, 'b.txt');
    await renameParked;

    // 目标路径此刻空闲，并发 upload 可以完整提交（文件 + meta）
    const uploadPromise = service.upload(new File(['second'], 'b.txt', { type: 'text/plain' }), { path: '/docs' });
    // 给 upload 一个完整的宏任务窗口：没有锁时它在这里跑完；
    // 有锁时它会一直排队等 rename 释放目标路径，所以不能 await 它本身（会死锁）。
    await new Promise(resolve => setTimeout(resolve, 0));
    releaseRename();

    await Promise.allSettled([renamePromise, uploadPromise]);

    // 不论谁赢，最终状态必须自洽：每条 meta 都要有对应且可读的文件
    const metas = await service.list();
    expect(metas.length).toBeGreaterThan(0);
    for (const meta of metas) {
      await expect(service.read(meta.id)).resolves.toBeInstanceOf(Blob);
    }
  });

  it('should rename a directory with nested files and empty directories', async () => {
    const { service } = createService();

    await service.createDirectory('docs');
    await service.createDirectory('assets', { path: '/docs' });
    await service.createDirectory('empty', { path: '/docs' });
    await service.upload(new File(['guide'], 'guide.txt', { type: 'text/plain' }), { path: '/docs' });
    await service.upload(new File(['icon'], 'icon.txt', { type: 'text/plain' }), { path: '/docs/assets' });

    const renamedPath = await service.renameDirectory('/docs', 'guides');

    expect(renamedPath).toBe('/guides');
    expect(await service.listEntries()).toEqual([{ kind: 'directory', name: 'guides', path: '/guides' }]);

    const guideEntries = await service.listEntries({ path: '/guides' });
    expect(guideEntries).toEqual([
      { kind: 'directory', name: 'assets', path: '/guides/assets' },
      { kind: 'directory', name: 'empty', path: '/guides/empty' },
      {
        kind: 'file',
        name: 'guide.txt',
        path: '/guides/guide.txt',
        meta: expect.objectContaining({ opfsPath: 'guides/guide.txt' })
      }
    ]);

    const nestedEntries = await service.listEntries({ path: '/guides/assets' });
    expect(nestedEntries).toHaveLength(1);

    if (nestedEntries[0]?.kind === 'file') {
      expect(nestedEntries[0].meta.opfsPath).toBe('guides/assets/icon.txt');
      const blob = await service.read(nestedEntries[0].meta.id);
      expect(await blob.text()).toBe('icon');
    }
  });

  it('should use OPFS move() to replace a supported directory tree', async () => {
    const { service } = createService();
    await service.upload(new File(['source'], 'source.txt'), { path: '/docs' });
    await service.upload(new File(['target'], 'target.txt'), { path: '/guides' });
    const storageRoot = rootHandle.directories.get('files');
    const sourceHandle = storageRoot?.directories.get('docs');
    const targetHandle = storageRoot?.directories.get('guides');
    if (!storageRoot || !sourceHandle || !targetHandle) throw new Error('missing directory tree');
    const attachMove = (handle: MemoryDirectoryHandle, initialName: string) => {
      let currentName = initialName;
      const move = vi.fn(async (name: string) => {
        storageRoot.directories.delete(currentName);
        storageRoot.directories.set(name, handle);
        currentName = name;
      });
      Object.assign(handle, { move });
      return move;
    };
    const sourceMove = attachMove(sourceHandle, 'docs');
    const targetMove = attachMove(targetHandle, 'guides');

    await expect(service.renameDirectory('/docs', 'guides', { overwrite: true })).resolves.toBe('/guides');

    expect(sourceMove).toHaveBeenCalledWith('guides');
    expect(targetMove).toHaveBeenCalledTimes(1);
    expect((await service.list()).map(meta => meta.opfsPath)).toEqual(['guides/source.txt']);
    expect(await service.listEntries()).toEqual([{ kind: 'directory', name: 'guides', path: '/guides' }]);
    expectNoTemporaryEntries();
  });

  it('should roll back copied files and metadata when directory rename metadata update fails', async () => {
    const { repository, service } = createService();
    const first = await service.upload(new File(['first'], 'first.txt'), { path: '/docs' });
    const second = await service.upload(new File(['second'], 'second.txt'), { path: '/docs/nested' });
    const updateError = new Error('second metadata update failed');
    const update = repository.update.bind(repository);
    vi.spyOn(repository, 'update').mockImplementationOnce(update).mockRejectedValueOnce(updateError);

    await expect(service.renameDirectory('/docs', 'guides')).rejects.toBe(updateError);

    expect(first.opfsPath).toBe('docs/first.txt');
    expect(second.opfsPath).toBe('docs/nested/second.txt');
    expect(await (await service.read(first.id)).text()).toBe('first');
    expect(await (await service.read(second.id)).text()).toBe('second');
    expect(await service.listEntries()).toEqual([{ kind: 'directory', name: 'docs', path: '/docs' }]);
    expectNoTemporaryEntries();
  });

  it('should replace the complete target tree when directory rename overwrite is enabled', async () => {
    const { service } = createService();

    await service.upload(new File(['guide'], 'guide.txt', { type: 'text/plain' }), { path: '/docs' });
    await service.upload(new File(['existing'], 'guide.txt', { type: 'text/plain' }), { path: '/guides' });
    await service.upload(new File(['stale'], 'stale.txt', { type: 'text/plain' }), { path: '/guides/nested' });

    await expect(service.renameDirectory('/docs', 'guides', { overwrite: true })).resolves.toBe('/guides');

    const rootEntries = await service.listEntries();
    expect(rootEntries).toEqual([{ kind: 'directory', name: 'guides', path: '/guides' }]);
    const guidesEntries = await service.listEntries({ path: '/guides' });

    expect(guidesEntries).toHaveLength(1);
    expect(guidesEntries[0].name).toBe('guide.txt');
    if (guidesEntries[0]?.kind === 'file') {
      expect(await (await service.read(guidesEntries[0].meta.id)).text()).toBe('guide');
    }
    expectNoTemporaryEntries();
  });

  it('should clear all files when no path given', async () => {
    const { service } = createService();

    await service.upload(new File(['a'], 'a.txt', { type: 'text/plain' }));
    await service.upload(new File(['b'], 'b.txt', { type: 'text/plain' }), { path: '/sub' });

    await service.clear();
    expect(await service.list()).toHaveLength(0);
  });

  it('should clear only files in a specific path', async () => {
    const { service } = createService();

    await service.upload(new File(['a'], 'root.txt', { type: 'text/plain' }));
    await service.upload(new File(['b'], 'sub.txt', { type: 'text/plain' }), { path: '/sub' });

    await service.clear('/sub');

    const remaining = await service.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('root.txt');
  });

  it('should remove empty directories via clear(path)', async () => {
    const { service } = createService();

    await service.createDirectory('empty');
    expect(await service.listEntries()).toEqual([{ kind: 'directory', name: 'empty', path: '/empty' }]);

    await service.clear('/empty');

    expect(await service.listEntries()).toEqual([]);
  });

  it('should clean up object urls and root handle on destroy', async () => {
    const revokeImpl = vi.fn();
    const objectUrls = new ObjectUrlRegistry(() => 'blob:x', revokeImpl);
    const { service } = createService({}, objectUrls);

    await service.upload(new File(['a'], 'a.txt', { type: 'text/plain' }));
    await service.createObjectUrl((await service.list())[0].id);
    expect(service.activeObjectUrlCount).toBe(1);

    await service.destroy();

    expect(service.activeObjectUrlCount).toBe(0);
    expect(revokeImpl).toHaveBeenCalled();
  });

  it('should wait for an in-flight write and reject all work after destroy', async () => {
    const { repository, service } = createService();
    const create = repository.create.bind(repository);
    let releaseCreate!: () => void;
    let markCreateStarted!: () => void;
    const createStarted = new Promise<void>(resolve => {
      markCreateStarted = resolve;
    });
    vi.spyOn(repository, 'create').mockImplementation(async entity => {
      markCreateStarted();
      await new Promise<void>(resolve => {
        releaseCreate = resolve;
      });
      return create(entity);
    });

    const upload = service.upload(new File(['pending'], 'pending.txt', { type: 'text/plain' }));
    await createStarted;
    let destroyFinished = false;
    const destroy = Promise.resolve(service.destroy()).then(() => {
      destroyFinished = true;
    });
    await Promise.resolve();
    const finishedBeforeWrite = destroyFinished;

    releaseCreate();
    await upload;
    await destroy;

    expect(finishedBeforeWrite).toBe(false);
    await expect(service.upload(new File(['late'], 'late.txt'))).rejects.toThrow(/destroyed/i);
    await expect(service.list()).rejects.toThrow(/destroyed/i);
  });

  it('should revoke object URLs through the service API', async () => {
    const revokeImpl = vi.fn();
    const { service } = createService({}, new ObjectUrlRegistry(() => 'blob:manual', revokeImpl));
    const meta = await service.upload(new File(['x'], 'x.txt', { type: 'text/plain' }));
    const url = await service.createObjectUrl(meta.id);

    service.revokeObjectUrl(url);

    expect(revokeImpl).toHaveBeenCalledWith(url);
  });

  it('should throw when directory handle entries() is unavailable', async () => {
    const { service } = createService();
    await service.init();
    const storageRoot = rootHandle.directories.get('files');
    if (!storageRoot) throw new Error('missing storage root');
    // @ts-expect-error force unsupported environment
    storageRoot.entries = undefined;

    await expect(service.listEntries()).rejects.toThrow(
      'FileSystemDirectoryHandle.entries is not supported in this environment'
    );
  });

  it('should treat duck-typed NotFoundError objects as missing files during read', async () => {
    const { service } = createService();
    const meta = await service.upload(new File(['x'], 'missing-handle.txt', { type: 'text/plain' }));
    const filesRoot = rootHandle.directories.get('files');
    if (!filesRoot) throw new Error('missing root');
    const original = filesRoot.getFileHandle.bind(filesRoot);
    filesRoot.getFileHandle = vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (name === 'missing-handle.txt' && !options?.create) {
        throw { name: 'NotFoundError' };
      }
      return original(name, options);
    }) as typeof filesRoot.getFileHandle;

    await expect(service.read(meta.id)).rejects.toThrow();
  });

  it('should ignore AbortError from showSaveFilePicker download path', async () => {
    const showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('user canceled', 'AbortError'));
    Object.defineProperty(globalThis, 'window', {
      value: { document, URL, showSaveFilePicker },
      configurable: true
    });
    const { service } = createService();
    const meta = await service.upload(new File(['x'], 'save.txt', { type: 'text/plain' }));

    await expect(service.download(meta.id)).resolves.toBeUndefined();
    expect(showSaveFilePicker).toHaveBeenCalled();
  });

  it('should download via showSaveFilePicker when available', async () => {
    const write = vi.fn();
    const close = vi.fn();
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
    Object.defineProperty(globalThis, 'window', {
      value: { document, URL, showSaveFilePicker },
      configurable: true
    });
    const { service } = createService();
    const meta = await service.upload(new File(['payload'], 'picker.txt', { type: 'text/plain' }));

    await service.download(meta.id, { suggestedName: 'renamed.txt' });

    expect(showSaveFilePicker).toHaveBeenCalledWith({ suggestedName: 'renamed.txt' });
    expect(write).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('should throw StorageUnavailableError when local adapter is missing', async () => {
    const { service } = createService();
    service['rxdb'].config.sync = {};
    await expect(service.list()).rejects.toThrow('RxDB local adapter is required for storage plugin');
  });

  it('should download using fallback anchor when showSaveFilePicker is undefined', async () => {
    const revokeImpl = vi.fn();
    const { service } = createService({}, new ObjectUrlRegistry(() => 'blob:download-url', revokeImpl));

    const meta = await service.upload(new File(['data'], 'file.txt', { type: 'text/plain' }));

    const clickSpy = vi.fn();
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
      (node as HTMLAnchorElement).click = clickSpy;
      clickSpy();
      return node;
    });
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(node => node);

    await service.download(meta.id);

    expect(clickSpy).toHaveBeenCalled();
    expect(revokeImpl).toHaveBeenCalledWith('blob:download-url');

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it('download() 在 click 之后让出一个宏任务再回收 URL', async () => {
    // click() 只是把下载排进队列。同步 revoke 会让部分浏览器在真正读 blob 之前就丢掉 URL，
    // 表现为下载出一个空文件——这种失败不会抛错，只会静默产出坏文件。
    const revokeImpl = vi.fn();
    const { service } = createService({}, new ObjectUrlRegistry(() => 'blob:download-url', revokeImpl));
    const meta = await service.upload(new File(['data'], 'file.txt', { type: 'text/plain' }));

    let revokedBeforeBrowserRead = true;
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
      (node as HTMLAnchorElement).click = () => {
        // 用一个宏任务代表浏览器真正去读 blob 的那一刻。
        setTimeout(() => {
          revokedBeforeBrowserRead = revokeImpl.mock.calls.length > 0;
        }, 0);
      };
      (node as HTMLAnchorElement).click();
      return node;
    });
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(node => node);

    await service.download(meta.id);

    expect(revokedBeforeBrowserRead).toBe(false);
    expect(revokeImpl).toHaveBeenCalledWith('blob:download-url');
    expect(service.activeObjectUrlCount).toBe(0);

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it('should clean up fallback anchor when click throws', async () => {
    const revokeImpl = vi.fn();
    const { service } = createService({}, new ObjectUrlRegistry(() => 'blob:download-url', revokeImpl));

    const meta = await service.upload(new File(['data'], 'file.txt', { type: 'text/plain' }));

    const clickError = new Error('click failed');
    const removeSpy = vi.spyOn(HTMLAnchorElement.prototype, 'remove');
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(node => {
      (node as HTMLAnchorElement).click = () => {
        throw clickError;
      };
      return node;
    });

    await expect(service.download(meta.id)).rejects.toThrow(clickError);
    expect(removeSpy).toHaveBeenCalled();
    expect(revokeImpl).toHaveBeenCalledWith('blob:download-url');

    appendChildSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('should abort the picker writable and preserve the write error', async () => {
    const { service } = createService();
    const meta = await service.upload(new File(['data'], 'file.txt', { type: 'text/plain' }));
    const writeError = new Error('picker write failed');
    const writable = {
      write: vi.fn().mockRejectedValue(writeError),
      close: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined)
    };
    const saveHandle = {
      createWritable: vi.fn().mockResolvedValue(writable)
    };

    Object.defineProperty(globalThis, 'window', {
      value: {
        document,
        URL,
        showSaveFilePicker: vi.fn().mockResolvedValue(saveHandle)
      },
      configurable: true
    });

    await expect(service.download(meta.id)).rejects.toBe(writeError);
    expect(writable.abort).toHaveBeenCalledWith(writeError);
    expect(writable.close).not.toHaveBeenCalled();
  });

  it('should emit meta changes through watch', async () => {
    const { service } = createService();
    const meta = await service.upload(new File(['initial'], 'test.txt', { type: 'text/plain' }));

    const values: Array<FakeStorageFileMeta | null> = [];
    const sub = service.watch(meta.id).subscribe(v => values.push(v));

    await vi.waitFor(() => expect(values[0]?.id).toBe(meta.id));

    await service.rename(meta.id, 'renamed.txt');
    await vi.waitFor(() => expect(values[values.length - 1]?.name).toBe('renamed.txt'));

    await service.delete(meta.id);
    await vi.waitFor(() => expect(values[values.length - 1]).toBeNull());

    sub.unsubscribe();
  });
});

describe('RxdbFileStorage.fetch (remote cache)', () => {
  let rootHandle: MemoryDirectoryHandle;

  const expectNoTemporaryEntries = (): void => {
    const storageRoot = rootHandle.directories.get('files');
    if (!storageRoot) return;
    const entryNames = [...storageRoot.files.keys(), ...storageRoot.directories.keys()];
    expect(entryNames.filter(name => name.startsWith('.rxdb-storage-'))).toEqual([]);
  };

  const setupGlobals = (onLine = true): void => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        storage: {
          getDirectory: vi.fn(async () => rootHandle)
        },
        onLine
      },
      configurable: true
    });

    Object.defineProperty(globalThis, 'window', {
      value: { document, URL, showSaveFilePicker: undefined },
      configurable: true
    });
  };

  beforeEach(() => {
    rootHandle = new MemoryDirectoryHandle();
    FakeStorageFileMeta.reset();
    setupGlobals();
  });

  it.each(['', '/', 'images/', '../image.png', 'images/../image.png', 'images\\image.png'])(
    'rejects invalid target path %j before starting a request',
    async opfsPath => {
      const { service } = createService();
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      await expect(service.fetch(opfsPath, { url: 'https://example.test/image.png' })).rejects.toThrow(
        'Invalid storage path'
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC #11: returns cached Blob from OPFS without network call when meta exists', async () => {
    const { service } = createService();
    await service.upload(new File(['cached'], '1.jpg', { type: 'image/jpeg' }), { path: '/images' });

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const blob = await service.fetch('images/1.jpg', { url: 'http://static.aiao.io/images/1.jpg' });

    expect(await blob.text()).toBe('cached');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('AC #12: downloads remote and writes OPFS + StorageFileMeta on miss + online', async () => {
    const { service } = createService();
    const responseBlob = new Blob(['fresh'], { type: 'image/jpeg' });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(responseBlob, {
        status: 200,
        headers: { 'content-type': 'image/jpeg' }
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const blob = await service.fetch('images/1.jpg', { url: 'http://static.aiao.io/images/1.jpg' });

    expect(fetchSpy).toHaveBeenCalledWith('http://static.aiao.io/images/1.jpg', expect.objectContaining({}));
    expect(await blob.text()).toBe('fresh');
    expect(blob.type).toBe('image/jpeg');

    const all = await service.list();
    expect(all).toHaveLength(1);
    expect(all[0].opfsPath).toBe('images/1.jpg');
    expect(all[0].name).toBe('1.jpg');
    expect(all[0].mimeType).toBe('image/jpeg');
    expect(all[0].size).toBe(responseBlob.size);

    const cachedRead = await service.read(all[0].id);
    expect(await cachedRead.text()).toBe('fresh');
  });

  it('streams a remote response without materializing it through response.blob()', async () => {
    const { service } = createService();
    const response = new Response(new Blob(['streamed'], { type: 'text/plain' }), {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    });
    const blobSpy = vi.spyOn(response, 'blob');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const result = await service.fetch('downloads/streamed.txt', { url: 'https://example.test/streamed.txt' });

    expect(await result.text()).toBe('streamed');
    expect(blobSpy).not.toHaveBeenCalled();
    expectNoTemporaryEntries();
  });

  it('preserves every chunk from a streamed remote response', async () => {
    const { service } = createService();
    const encoder = new TextEncoder();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('first-'));
          controller.enqueue(encoder.encode('second'));
          controller.close();
        }
      }),
      { headers: { 'content-type': 'text/plain' } }
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const result = await service.fetch('downloads/chunks.txt', { url: 'https://example.test/chunks.txt' });

    expect(await result.text()).toBe('first-second');
    expect((await service.list())[0].size).toBe('first-second'.length);
    expectNoTemporaryEntries();
  });

  it('AC #13: throws StorageOfflineError when miss and navigator.onLine is false', async () => {
    setupGlobals(false);
    const { service } = createService();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(service.fetch('images/1.jpg', { url: 'http://static.aiao.io/images/1.jpg' })).rejects.toBeInstanceOf(
      StorageOfflineError
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await service.list()).toHaveLength(0);
  });

  it('AC #13: maps fetch TypeError (network failure) to StorageOfflineError', async () => {
    const { service } = createService();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(service.fetch('images/1.jpg', { url: 'http://static.aiao.io/images/1.jpg' })).rejects.toBeInstanceOf(
      StorageOfflineError
    );

    expect(await service.list()).toHaveLength(0);
  });

  it('AC #14: throws StorageFetchError on non-2xx response and skips OPFS write', async () => {
    const { service } = createService();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404, statusText: 'Not Found' })));

    let captured: unknown;
    try {
      await service.fetch('images/missing.jpg', { url: 'http://static.aiao.io/images/missing.jpg' });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(StorageFetchError);
    expect((captured as StorageFetchError).status).toBe(404);
    expect(await service.list()).toHaveLength(0);
  });

  it('AC #15: re-fetches from remote after delete', async () => {
    const { service } = createService();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(new Blob(['v1'], { type: 'image/jpeg' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Blob(['v2'], { type: 'image/jpeg' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const first = await service.fetch('images/1.jpg', { url: 'http://static.aiao.io/images/1.jpg' });
    expect(await first.text()).toBe('v1');

    const meta = (await service.list())[0];
    await service.delete(meta.id);
    expect(await service.list()).toHaveLength(0);

    const second = await service.fetch('images/1.jpg', { url: 'http://static.aiao.io/images/1.jpg' });
    expect(await second.text()).toBe('v2');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('applies explicit mimeType option to returned Blob and meta', async () => {
    const { service } = createService();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(new Blob(['png-bytes'], { type: 'application/octet-stream' }), { status: 200 }))
    );

    const blob = await service.fetch('images/typed.png', {
      url: 'http://static.aiao.io/images/typed.png',
      mimeType: 'image/png'
    });

    expect(blob.type).toBe('image/png');
    const meta = (await service.list())[0];
    expect(meta.mimeType).toBe('image/png');
  });

  it('dedupes concurrent fetches against the same opfsPath', async () => {
    const { service } = createService();
    let resolveResponse!: (response: Response) => void;
    const responsePromise = new Promise<Response>(resolve => {
      resolveResponse = resolve;
    });
    const fetchSpy = vi.fn().mockReturnValue(responsePromise);
    vi.stubGlobal('fetch', fetchSpy);

    const first = service.fetch('images/concurrent.jpg', { url: 'http://static.aiao.io/images/concurrent.jpg' });
    const second = service.fetch('images/concurrent.jpg', { url: 'http://static.aiao.io/images/concurrent.jpg' });

    resolveResponse(new Response(new Blob(['shared'], { type: 'image/jpeg' }), { status: 200 }));

    const [firstBlob, secondBlob] = await Promise.all([first, second]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await firstBlob.text()).toBe('shared');
    expect(await secondBlob.text()).toBe('shared');
    expect(await service.list()).toHaveLength(1);
  });

  // STOR-003：in-flight key 只有 opfsPath，不含资源 identity。
  // 第二个调用即使传的是**另一个 URL**，也会直接拿到第一个 URL 的字节，且不发请求 ——
  // 缓存投毒，且调用方完全无从察觉。
  it('rejects a concurrent fetch for the same path with a different url', async () => {
    const { service } = createService();
    let resolveResponse!: (response: Response) => void;
    const responsePromise = new Promise<Response>(resolve => {
      resolveResponse = resolve;
    });
    const fetchSpy = vi.fn().mockReturnValue(responsePromise);
    vi.stubGlobal('fetch', fetchSpy);

    const first = service.fetch('images/conflict.jpg', { url: 'http://static.aiao.io/a.jpg' });
    const second = service.fetch('images/conflict.jpg', { url: 'http://static.aiao.io/b.jpg' });

    const secondAssertion = expect(second).rejects.toThrow(/different url|conflict/i);

    resolveResponse(new Response(new Blob(['from-a'], { type: 'image/jpeg' }), { status: 200 }));

    expect(await (await first).text()).toBe('from-a');
    await secondAssertion;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // 跟随者等待共享任务期间 abort 自己的 signal 时必须只拒绝它自己，
  // 首个调用方的下载不受影响 —— 此前跟随者的 signal 在等待期间被完全忽略。
  it('aborts only the waiting caller, leaving the shared download intact', async () => {
    const { service } = createService();
    let resolveResponse!: (response: Response) => void;
    const responsePromise = new Promise<Response>(resolve => {
      resolveResponse = resolve;
    });
    const fetchSpy = vi.fn().mockReturnValue(responsePromise);
    vi.stubGlobal('fetch', fetchSpy);
    const controller = new AbortController();

    const first = service.fetch('images/shared.jpg', { url: 'http://static.aiao.io/shared.jpg' });
    const follower = service.fetch('images/shared.jpg', {
      url: 'http://static.aiao.io/shared.jpg',
      signal: controller.signal
    });
    const followerAssertion = expect(follower).rejects.toMatchObject({ name: 'AbortError' });

    controller.abort();
    await followerAssertion;

    resolveResponse(new Response(new Blob(['shared'], { type: 'image/jpeg' }), { status: 200 }));
    expect(await (await first).text()).toBe('shared');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await service.list()).toHaveLength(1);
  });

  it('throws immediately when the provided AbortSignal is already aborted', async () => {
    const { service } = createService();
    const controller = new AbortController();
    controller.abort();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      service.fetch('images/aborted.jpg', {
        url: 'http://static.aiao.io/images/aborted.jpg',
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await service.list()).toHaveLength(0);
  });

  it('propagates AbortError from fetch and does not write OPFS or meta', async () => {
    const { service } = createService();
    const controller = new AbortController();
    const fetchSpy = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const pending = service.fetch('images/mid-abort.jpg', {
      url: 'http://static.aiao.io/images/mid-abort.jpg',
      signal: controller.signal
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(await service.list()).toHaveLength(0);
    expectNoTemporaryEntries();
  });

  it('removes a partially streamed temporary file when the response body aborts', async () => {
    const { service } = createService();
    const controller = new AbortController();
    const encoder = new TextEncoder();
    let sentFirstChunk = false;
    let markSecondPull!: () => void;
    let releaseSecondPull!: () => void;
    const secondPull = new Promise<void>(resolve => {
      markSecondPull = resolve;
    });
    const body = new ReadableStream<Uint8Array>({
      pull(streamController) {
        if (!sentFirstChunk) {
          sentFirstChunk = true;
          streamController.enqueue(encoder.encode('partial'));
          return;
        }
        markSecondPull();
        return new Promise<void>(resolve => {
          releaseSecondPull = () => {
            streamController.error(controller.signal.reason);
            resolve();
          };
        });
      }
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/plain' } }))
    );

    const pending = service.fetch('downloads/partial.txt', {
      url: 'https://example.test/partial.txt',
      signal: controller.signal
    });
    await secondPull;
    controller.abort();
    releaseSecondPull();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(await service.list()).toEqual([]);
    expectNoTemporaryEntries();
  });

  it('clears the in-flight slot after a failed download so retries can proceed', async () => {
    const { service } = createService();
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(new Blob(['retry-ok'], { type: 'image/jpeg' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      service.fetch('images/retry.jpg', { url: 'http://static.aiao.io/images/retry.jpg' })
    ).rejects.toBeInstanceOf(StorageFetchError);

    const blob = await service.fetch('images/retry.jpg', { url: 'http://static.aiao.io/images/retry.jpg' });
    expect(await blob.text()).toBe('retry-ok');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws StorageMimeTypeMissingError when 200 OK lacks Content-Type and no options.mimeType', async () => {
    const { service } = createService();
    // Response 实例的 headers.get 在不同 runtime 下行为不一致；直接构造 ducktyped fake
    // 让 ok=true、status=200、headers.get('content-type')=null
    const fakeResponse = {
      ok: true,
      status: 200,
      headers: { get: () => null },
      blob: async () => new Blob(['bytes'])
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse));

    await expect(
      service.fetch('images/no-mime.bin', { url: 'http://static.aiao.io/images/no-mime.bin' })
    ).rejects.toBeInstanceOf(StorageMimeTypeMissingError);

    expect(await service.list()).toHaveLength(0);
  });

  it('strips parameters from Content-Type header (image/jpeg; charset=binary → image/jpeg)', async () => {
    const { service } = createService();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Blob(['x'], { type: 'image/jpeg' }), {
          status: 200,
          headers: { 'content-type': 'image/jpeg; charset=binary' }
        })
      )
    );

    const blob = await service.fetch('images/charset.jpg', { url: 'http://static.aiao.io/images/charset.jpg' });
    expect(blob.type).toBe('image/jpeg');
    const meta = (await service.list())[0];
    expect(meta.mimeType).toBe('image/jpeg');
  });

  it('re-fetches when an in-flight blob has a different mimeType than requested', async () => {
    const { service } = createService();
    let resolveResponse!: (response: Response) => void;
    const responsePromise = new Promise<Response>(resolve => {
      resolveResponse = resolve;
    });
    const fetchSpy = vi
      .fn()
      .mockReturnValueOnce(responsePromise)
      .mockResolvedValueOnce(new Response(new Blob(['png'], { type: 'image/png' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const first = service.fetch('images/shared.jpg', {
      url: 'http://static.aiao.io/images/shared.jpg',
      mimeType: 'image/jpeg'
    });
    const second = service.fetch('images/shared.jpg', {
      url: 'http://static.aiao.io/images/shared.jpg',
      mimeType: 'image/png'
    });

    resolveResponse(new Response(new Blob(['jpeg'], { type: 'image/jpeg' }), { status: 200 }));
    const [firstBlob, secondBlob] = await Promise.all([first, second]);

    // 首次网络写入生效；MIME 不一致的调用方会重新读取 OPFS 并重新设置 Blob 类型
    expect(firstBlob.type).toBe('image/jpeg');
    expect(secondBlob.type).toBe('image/png');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-TypeError/non-AbortError fetch failures as-is', async () => {
    const { service } = createService();
    const boom = new Error('unexpected fetch failure');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(boom));

    await expect(service.fetch('images/boom.jpg', { url: 'http://static.aiao.io/images/boom.jpg' })).rejects.toBe(boom);
  });

  it('updates existing meta contentVersion when fetch overwrites an OPFS path', async () => {
    const { service } = createService();
    await service.upload(new File(['seed'], 'seed.jpg', { type: 'image/jpeg' }), { path: '/images' });
    const seed = (await service.list()).find(meta => meta.name === 'seed.jpg');
    if (!seed) throw new Error('seed missing');
    const previousVersion = seed.contentVersion || 0;

    // 保留 meta 但移除 OPFS blob，使 fetch 进入 updateMeta 分支。
    const images = rootHandle.directories.get('files')?.directories.get('images');
    images?.files.delete('seed.jpg');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Blob(['refetched'], { type: 'image/jpeg' }), { status: 200 }))
    );
    await service.fetch('images/seed.jpg', { url: 'http://static.aiao.io/images/seed.jpg' });
    const updated = (await service.list()).find(meta => meta.name === 'seed.jpg');
    expect(updated?.contentVersion).toBe(previousVersion + 1);
  });
});

describe('storage path helpers', () => {
  it('should normalize root and directory paths', () => {
    expect(normalizeDirectoryPath()).toBe('/');
    expect(normalizeDirectoryPath('')).toBe('/');
    expect(normalizeDirectoryPath('avatars')).toBe('/avatars');
    expect(normalizeDirectoryPath('/avatars/')).toBe('/avatars');
    expect(toAbsoluteStoragePath()).toBe('/');
    expect(toAbsoluteStoragePath('avatars/photo.png')).toBe('/avatars/photo.png');
  });

  it('should join directory path and filename', () => {
    expect(joinDirectoryAndFileName('/avatars', 'photo.png')).toBe('avatars/photo.png');
    expect(joinDirectoryAndFileName('/', 'photo.png')).toBe('photo.png');
  });

  it.each(['a/b.txt', 'a\\b.txt', '.', '..', ' ', ' padded.txt '])('should reject invalid file name %j', name => {
    expect(() => joinDirectoryAndFileName('/avatars', name)).toThrow('Invalid storage path');
  });

  it.each(['/avatars/../secret', '/avatars/./photo', '/avatars\\photo', '/avatars//photo'])(
    'should reject invalid directory path %j',
    path => {
      expect(() => normalizeDirectoryPath(path)).toThrow('Invalid storage path');
    }
  );

  it.each(['../photo.png', 'avatars/../photo.png', 'avatars\\photo.png', 'avatars//photo.png'])(
    'should reject invalid relative OPFS path %j',
    path => {
      expect(() => normalizeRelativeOpfsPath(path)).toThrow('Invalid storage path');
    }
  );

  it('should derive directory path from opfs path', () => {
    expect(getDirectoryPathFromOpfsPath('photo.png')).toBe('/');
    expect(getDirectoryPathFromOpfsPath('avatars/photo.png')).toBe('/avatars');
  });

  it('should match exact, nested, and root directory checks', () => {
    expect(isOpfsPathInDirectory('avatars/photo.png', '/avatars')).toBe(true);
    expect(isOpfsPathInDirectory('avatars/nested/photo.png', '/avatars')).toBe(false);
    expect(isOpfsPathInsideDirectory('avatars/nested/photo.png', '/avatars')).toBe(true);
    expect(isOpfsPathInsideDirectory('avatars/nested/photo.png', '/')).toBe(true);
  });

  describe('回滚快照与临时命名', () => {
    /** 记录后端收到的调用路径；用来观察服务层做了几次快照。 */
    const recordingFilesystem = (record: { reads: string[]; writes: string[] }): StorageFilesystemFactory => {
      return (rootDir, context) => {
        const inner = createOpfsStorageFilesystem(rootDir, context);
        const openRead = inner.openRead.bind(inner);
        const openWrite = inner.openWrite.bind(inner);
        vi.spyOn(inner, 'openRead').mockImplementation(path => {
          record.reads.push(path);
          return openRead(path);
        });
        vi.spyOn(inner, 'openWrite').mockImplementation(path => {
          record.writes.push(path);
          return openWrite(path);
        });
        return inner;
      };
    };

    it('copyDirectory 对每个目标只取一次回滚快照', async () => {
      // 每次快照都要把已有内容整份转存到临时文件；取两次等于把同一份数据抄两遍，
      // 在桌面后端上还是两轮跨进程往返。
      const record = { reads: [] as string[], writes: [] as string[] };
      const { service } = createService({ filesystem: recordingFilesystem(record) });
      await service.upload(new File(['a'], 'a.txt', { type: 'text/plain' }), { path: '/docs' });
      await service.upload(new File(['b'], 'b.txt', { type: 'text/plain' }), { path: '/docs' });
      record.reads.length = 0;

      await service.renameDirectory('/docs', 'papers');

      expect(record.reads.filter(path => path.startsWith('papers/'))).toEqual(['papers/a.txt', 'papers/b.txt']);
    });

    it('临时文件名带随机段，同一毫秒内的两个上下文不会撞名', async () => {
      // 两个标签页各有一份从 0 开始的序号；只靠 `Date.now()-序号`，同毫秒启动的两页会
      // 生成同名临时文件，互相覆盖对方的回滚快照。
      vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      const record = { reads: [] as string[], writes: [] as string[] };
      const filesystem = recordingFilesystem(record);
      const first = createService({ filesystem }).service;
      const second = createService({ filesystem }).service;

      await first.upload(new File(['v1'], 'doc.txt', { type: 'text/plain' }));
      record.writes.length = 0;
      await first.upload(new File(['v2'], 'doc.txt', { type: 'text/plain' }), { overwrite: true });
      await second.upload(new File(['v3'], 'doc.txt', { type: 'text/plain' }), { overwrite: true });

      const temporaries = record.writes.filter(isTemporaryStorageName);
      expect(temporaries.length).toBeGreaterThanOrEqual(2);
      expect(new Set(temporaries).size).toBe(temporaries.length);
    });
  });
});
