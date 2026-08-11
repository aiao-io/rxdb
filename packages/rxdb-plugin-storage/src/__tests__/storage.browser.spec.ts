import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StorageFetchError } from '../errors.js';
import { StorageFileMeta } from '../file-meta.entity.js';
import { createGateLockName, createPathLockName } from '../path-lock.js';
import { rxDBPluginStorage } from '../plugin.js';
import { RxdbFileStorage } from '../storage.service.js';

const STORAGE_LOCK_SCOPE = 'rxdb-storage:files';

/** 在真实 Chromium 的独立 worker 中持有 Web Lock，模拟另一个 tab 的临界区。 */
const holdBrowserLock = async (name: string): Promise<() => Promise<void>> => {
  const workerSource = `
    self.onmessage = event => {
      navigator.locks.request(event.data, async () => {
        self.postMessage('acquired');
        await new Promise(resolve => {
          self.onmessage = releaseEvent => {
            if (releaseEvent.data === 'release') resolve();
          };
        });
        self.postMessage('released');
      });
    };
  `;
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  const worker = new Worker(workerUrl);
  const acquired = new Promise<void>((resolve, reject) => {
    worker.onmessage = event => {
      if (event.data === 'acquired') resolve();
    };
    worker.onerror = event => reject(event.error ?? new Error(event.message));
  });
  const released = new Promise<void>(resolve => {
    const previous = worker.onmessage;
    worker.onmessage = event => {
      previous?.call(worker, event);
      if (event.data === 'released') resolve();
    };
  });

  worker.postMessage(name);
  await acquired;

  let finished = false;
  return async () => {
    if (finished) return;
    finished = true;
    worker.postMessage('release');
    await released;
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
  };
};

describe('storage browser integration', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterWaSqlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'storage_browser_' + Math.random().toString(36).substring(7),
      entities: [StorageFileMeta],
      sync: {
        type: SyncType.None,
        local: {
          adapter: 'wa-sqlite'
        }
      }
    });

    rxdb.use(rxDBPluginStorage).adapter(
      'wa-sqlite',
      db =>
        new RxDBAdapterWaSqlite(db, {
          vfs: 'MemoryAsyncVFS'
        })
    );

    adapter = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
    rxdb.init();
  });

  afterAll(async () => {
    await rxdb.storage.destroy();
    adapter.rxdb.entityManager.cleanAllCache();
    adapter.cleanAllCache();
  });

  const cleanFiles = async () => {
    await rxdb.storage.clear();
  };

  const makeFile = (name: string, content = 'hello', type = 'text/plain') => new File([content], name, { type });

  const expectNoTemporaryEntries = async (): Promise<void> => {
    const storageRoot = await navigator.storage.getDirectory();
    const filesRoot = await storageRoot.getDirectoryHandle('files');
    const names: string[] = [];
    for await (const [name] of filesRoot.entries()) {
      names.push(name);
    }
    expect(names.filter(name => name.startsWith('.rxdb-storage-'))).toEqual([]);
  };

  describe('init -> upload -> read smoke', () => {
    afterAll(cleanFiles);

    it('should upload a file and read it back', async () => {
      const file = makeFile('smoke.txt', 'smoke test content');
      const meta = await rxdb.storage.upload(file);

      expect(meta).toBeTruthy();
      expect(meta.name).toBe('smoke.txt');
      expect(meta.mimeType).toBe('text/plain');
      expect(meta.size).toBe(file.size);
      expect(meta.opfsPath).toBe('smoke.txt');

      const blob = await rxdb.storage.read(meta.id);
      const text = await blob.text();
      expect(text).toBe('smoke test content');
    });
  });

  describe('full lifecycle', () => {
    afterAll(cleanFiles);

    it('should upload, list, read, preview, delete', async () => {
      const file1 = makeFile('a.txt', 'aaa');
      const file2 = makeFile('b.txt', 'bbb');

      const meta1 = await rxdb.storage.upload(file1);
      const meta2 = await rxdb.storage.upload(file2);
      expect(meta2.name).toBe('b.txt');

      // 列出文件。
      const allFiles = await rxdb.storage.list();
      expect(allFiles).toHaveLength(2);
      expect(allFiles.map(m => m.name).sort()).toEqual(['a.txt', 'b.txt']);

      // 读取文件。
      const blob1 = await rxdb.storage.read(meta1.id);
      expect(await blob1.text()).toBe('aaa');

      // 预览文件。
      const preview = await rxdb.storage.preview(meta1.id);
      expect(preview.url).toBeTruthy();
      expect(preview.type).toBe('text/plain');
      preview.dispose();

      // 获取元数据。
      const fetched = await rxdb.storage.getMeta(meta1.id);
      expect(fetched).toBeTruthy();
      expect(fetched!.name).toBe('a.txt');

      // 删除文件。
      await rxdb.storage.delete(meta1.id);
      const afterDelete = await rxdb.storage.list();
      expect(afterDelete).toHaveLength(1);
      expect(afterDelete[0].name).toBe('b.txt');

      // 清空文件。
      await rxdb.storage.clear();
      const afterClear = await rxdb.storage.list();
      expect(afterClear).toHaveLength(0);
    });
  });

  describe('upload conflict and overwrite', () => {
    afterAll(cleanFiles);

    it('should reject duplicate upload without overwrite flag', async () => {
      const file = makeFile('dup.txt', 'first');
      await rxdb.storage.upload(file);

      await expect(rxdb.storage.upload(makeFile('dup.txt', 'second'))).rejects.toThrow(/already exists/);
    });

    it('should allow overwrite when flag is set', async () => {
      const file = makeFile('over.txt', 'v1');
      await rxdb.storage.upload(file);

      const updated = await rxdb.storage.upload(makeFile('over.txt', 'v2'), { overwrite: true });
      expect(updated.contentVersion).toBe(2);

      const blob = await rxdb.storage.read(updated.id);
      expect(await blob.text()).toBe('v2');
    });

    it('should replace a file and remove the target metadata on rename overwrite', async () => {
      const source = await rxdb.storage.upload(makeFile('source.txt', 'source'), { path: '/rename' });
      const target = await rxdb.storage.upload(makeFile('target.txt', 'target'), { path: '/rename' });

      const renamed = await rxdb.storage.rename(source.id, 'target.txt', { overwrite: true });

      expect(renamed.id).toBe(source.id);
      expect(await (await rxdb.storage.read(source.id)).text()).toBe('source');
      await expect(rxdb.storage.read(target.id)).rejects.toThrow(/not found/i);
      expect(await rxdb.storage.list({ path: '/rename' })).toHaveLength(1);
      await expectNoTemporaryEntries();
    });

    it('should replace a directory tree instead of merging target-only files', async () => {
      await rxdb.storage.upload(makeFile('source.txt', 'source'), { path: '/source-tree' });
      await rxdb.storage.upload(makeFile('target.txt', 'target'), { path: '/target-tree' });
      await rxdb.storage.upload(makeFile('stale.txt', 'stale'), { path: '/target-tree/nested' });

      await rxdb.storage.renameDirectory('/source-tree', 'target-tree', { overwrite: true });

      const files = await rxdb.storage.list({ path: '/target-tree', recursive: true });
      expect(files.map(meta => meta.name)).toEqual(['source.txt']);
      expect(await (await rxdb.storage.read(files[0].id)).text()).toBe('source');
      await expectNoTemporaryEntries();
    });
  });

  describe('browser failure and concurrency gates', () => {
    afterEach(async () => {
      vi.unstubAllGlobals();
      await cleanFiles();
    });

    it('keeps metadata and files consistent under same-path concurrent uploads', async () => {
      const results = await Promise.allSettled([
        rxdb.storage.upload(makeFile('race.txt', 'first'), { path: '/race' }),
        rxdb.storage.upload(makeFile('race.txt', 'second'), { path: '/race' })
      ]);

      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      const files = await rxdb.storage.list({ path: '/race' });
      expect(files).toHaveLength(1);
      await expect(rxdb.storage.read(files[0].id)).resolves.toBeInstanceOf(Blob);
      await expectNoTemporaryEntries();
    });

    it('serializes rename and upload from two services behind a cross-context gate', async () => {
      expect(navigator.locks).toBeDefined();
      const secondary = new RxdbFileStorage(rxdb);
      await secondary.init();
      const source = await rxdb.storage.upload(makeFile('source.txt', 'source'), { path: '/cross-context' });
      const releaseGate = await holdBrowserLock(createGateLockName(STORAGE_LOCK_SCOPE));
      try {
        let renameSettled = false;
        let uploadSettled = false;

        const rename = rxdb.storage.rename(source.id, 'target.txt').finally(() => {
          renameSettled = true;
        });
        const upload = secondary.upload(makeFile('target.txt', 'upload'), { path: '/cross-context' }).finally(() => {
          uploadSettled = true;
        });
        void upload.catch(() => undefined);

        await new Promise(resolve => setTimeout(resolve, 20));
        expect(renameSettled).toBe(false);
        expect(uploadSettled).toBe(false);

        await releaseGate();
        const [renameResult, uploadResult] = await Promise.allSettled([rename, upload]);
        expect([renameResult.status, uploadResult.status].sort()).toEqual(['fulfilled', 'rejected']);
        const files = await rxdb.storage.list({ path: '/cross-context' });
        expect(files.length).toBeGreaterThanOrEqual(1);
        expect(files.length).toBeLessThanOrEqual(2);
        const contents = await Promise.all(files.map(async file => (await rxdb.storage.read(file.id)).text()));
        expect(contents).toEqual(expect.arrayContaining(['source']));
        if (files.length === 2) expect(contents).toEqual(expect.arrayContaining(['upload']));
        if (uploadResult.status === 'rejected') {
          expect(uploadResult.reason).toMatchObject({ name: 'StorageConflictError' });
        } else if (renameResult.status === 'rejected') {
          expect(renameResult.reason).toMatchObject({ name: 'StorageConflictError' });
        } else {
          throw new Error('expected one cross-context operation to reject');
        }
        await expectNoTemporaryEntries();
      } finally {
        await releaseGate();
        await secondary.destroy();
      }
    });

    it('honors a real worker path lock before committing a fetch', async () => {
      expect(navigator.locks).toBeDefined();
      const opfsPath = 'worker-lock/blocked.txt';
      const releasePath = await holdBrowserLock(createPathLockName(STORAGE_LOCK_SCOPE, opfsPath));
      try {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(
            new Response('worker bytes', {
              headers: { 'content-type': 'text/plain' }
            })
          )
        );
        let settled = false;
        const pending = rxdb.storage.fetch(opfsPath, { url: 'https://example.test/worker-lock.txt' }).finally(() => {
          settled = true;
        });

        await new Promise(resolve => setTimeout(resolve, 20));
        expect(settled).toBe(false);

        await releasePath();
        await expect(pending).resolves.toBeInstanceOf(Blob);
        expect(await (await pending).text()).toBe('worker bytes');
        await expectNoTemporaryEntries();
      } finally {
        await releasePath();
      }
    });

    it('rejects a different URL while the same-path fetch is in flight', async () => {
      let releaseFetch!: () => void;
      const fetchGate = new Promise<void>(resolve => {
        releaseFetch = resolve;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          await fetchGate;
          return new Response('first url', { headers: { 'content-type': 'text/plain' } });
        })
      );

      const first = rxdb.storage.fetch('fetch-race/shared.txt', {
        url: 'https://example.test/first.txt'
      });
      await Promise.resolve();
      await expect(
        rxdb.storage.fetch('fetch-race/shared.txt', {
          url: 'https://example.test/second.txt'
        })
      ).rejects.toMatchObject({ name: 'StorageFetchUrlConflictError' });

      releaseFetch();
      await expect(first).resolves.toBeInstanceOf(Blob);
      expect(await (await first).text()).toBe('first url');
      await expectNoTemporaryEntries();
    });

    it('does not leave files or metadata after an HTTP fetch failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('unavailable', {
            status: 503,
            headers: { 'content-type': 'text/plain' }
          })
        )
      );

      await expect(
        rxdb.storage.fetch('fetch-failure/unavailable.txt', {
          url: 'https://example.test/unavailable.txt'
        })
      ).rejects.toBeInstanceOf(StorageFetchError);
      expect(await rxdb.storage.list({ path: '/fetch-failure' })).toEqual([]);
      await expectNoTemporaryEntries();
    });

    it('aborts a streamed fetch without publishing partial bytes', async () => {
      const encoder = new TextEncoder();
      let firstPull = true;
      let markSecondPull!: () => void;
      let releaseSecondPull!: () => void;
      const secondPull = new Promise<void>(resolve => {
        markSecondPull = resolve;
      });
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (firstPull) {
            firstPull = false;
            controller.enqueue(encoder.encode('partial'));
            return;
          }

          markSecondPull();
          return new Promise<void>(resolve => {
            releaseSecondPull = resolve;
          });
        }
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/plain' } }))
      );
      const abortController = new AbortController();
      const pending = rxdb.storage.fetch('fetch-abort/partial.txt', {
        url: 'https://example.test/partial.txt',
        signal: abortController.signal
      });

      await secondPull;
      abortController.abort(new DOMException('aborted by test', 'AbortError'));
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      releaseSecondPull();

      expect(await rxdb.storage.list({ path: '/fetch-abort' })).toEqual([]);
      await expectNoTemporaryEntries();
    });

    it('removes orphan entries when clear scans the real OPFS directory', async () => {
      const storageRoot = await navigator.storage.getDirectory();
      const filesRoot = await storageRoot.getDirectoryHandle('files', { create: true });
      await filesRoot.getFileHandle('orphan-a.txt', { create: true });
      await filesRoot.getFileHandle('orphan-b.txt', { create: true });
      await filesRoot.getDirectoryHandle('orphan-dir', { create: true });

      await rxdb.storage.clear();

      const names: string[] = [];
      for await (const [name] of filesRoot.entries()) names.push(name);
      expect(names).toEqual([]);
    });

    it('restores the previous file when the real metadata update fails', async () => {
      const original = await rxdb.storage.upload(makeFile('rollback.txt', 'before'), { path: '/rollback' });
      const repository = adapter.getRepository(StorageFileMeta);
      const updateError = new Error('browser metadata update failed');
      const updateSpy = vi.spyOn(repository, 'update').mockRejectedValueOnce(updateError);

      try {
        await expect(
          rxdb.storage.upload(makeFile('rollback.txt', 'after'), { path: '/rollback', overwrite: true })
        ).rejects.toBe(updateError);
      } finally {
        updateSpy.mockRestore();
      }

      expect(await (await rxdb.storage.read(original.id)).text()).toBe('before');
      const restored = await rxdb.storage.list({ path: '/rollback' });
      expect(restored).toHaveLength(1);
      expect(restored[0].opfsPath).toBe('rollback/rollback.txt');
      await expectNoTemporaryEntries();
    });

    it('restores a directory tree when a real metadata move fails', async () => {
      const first = await rxdb.storage.upload(makeFile('first.txt', 'first'), { path: '/rollback-dir' });
      const second = await rxdb.storage.upload(makeFile('second.txt', 'second'), { path: '/rollback-dir/nested' });
      const repository = adapter.getRepository(StorageFileMeta);
      const update = repository.update.bind(repository);
      const updateError = new Error('browser directory metadata update failed');
      const updateSpy = vi
        .spyOn(repository, 'update')
        .mockImplementationOnce(update)
        .mockRejectedValueOnce(updateError);

      try {
        await expect(rxdb.storage.renameDirectory('/rollback-dir', 'rollback-target')).rejects.toBe(updateError);
      } finally {
        updateSpy.mockRestore();
      }

      expect(await (await rxdb.storage.read(first.id)).text()).toBe('first');
      expect(await (await rxdb.storage.read(second.id)).text()).toBe('second');
      expect(await rxdb.storage.listEntries()).toEqual([
        { kind: 'directory', name: 'rollback-dir', path: '/rollback-dir' }
      ]);
      await expectNoTemporaryEntries();
    });

    it('waits for an in-flight streamed fetch before destroy releases the service', async () => {
      const isolated = new RxDB({
        dbName: 'storage_browser_destroy_' + Math.random().toString(36).substring(7),
        entities: [StorageFileMeta],
        sync: {
          type: SyncType.None,
          local: {
            adapter: 'wa-sqlite'
          }
        }
      });
      isolated.use(rxDBPluginStorage).adapter(
        'wa-sqlite',
        db =>
          new RxDBAdapterWaSqlite(db, {
            vfs: 'MemoryAsyncVFS'
          })
      );
      const isolatedAdapter = (await isolated.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
      isolated.init();
      const encoder = new TextEncoder();
      let sentFirstChunk = false;
      let markSecondPull!: () => void;
      let releaseSecondPull!: () => void;
      const secondPull = new Promise<void>(resolve => {
        markSecondPull = resolve;
      });
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sentFirstChunk) {
            sentFirstChunk = true;
            controller.enqueue(encoder.encode('partial'));
            return;
          }
          markSecondPull();
          return new Promise<void>(resolve => {
            releaseSecondPull = () => {
              controller.enqueue(encoder.encode('-done'));
              controller.close();
              resolve();
            };
          });
        }
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/plain' } }))
      );

      const pending = isolated.storage.fetch('destroy/pending.txt', { url: 'https://example.test/pending.txt' });
      await secondPull;
      let destroyed = false;
      const destroying = isolated.storage.destroy().then(() => {
        destroyed = true;
      });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(destroyed).toBe(false);
      releaseSecondPull();
      await expect(pending).resolves.toBeInstanceOf(Blob);
      await destroying;
      expect(destroyed).toBe(true);
      await expect(isolated.storage.list()).rejects.toThrow(/destroyed/i);
      isolatedAdapter.rxdb.entityManager.cleanAllCache();
      isolatedAdapter.cleanAllCache();
      vi.unstubAllGlobals();
    });
  });

  describe('path-based operations', () => {
    afterAll(cleanFiles);

    it('should upload to sub-path and list by path', async () => {
      await rxdb.storage.upload(makeFile('root.txt'), { path: '/' });
      await rxdb.storage.upload(makeFile('sub.txt'), { path: '/docs' });

      const rootFiles = await rxdb.storage.list({ path: '/' });
      expect(rootFiles).toHaveLength(1);
      expect(rootFiles[0].name).toBe('root.txt');

      const docFiles = await rxdb.storage.list({ path: '/docs' });
      expect(docFiles).toHaveLength(1);
      expect(docFiles[0].name).toBe('sub.txt');

      // 仅清空 /docs。
      await rxdb.storage.clear('/docs');
      const afterClear = await rxdb.storage.list();
      expect(afterClear).toHaveLength(1);
      expect(afterClear[0].name).toBe('root.txt');
    });
  });

  describe('error paths', () => {
    it('should throw when reading non-existent file', async () => {
      await expect(rxdb.storage.read('non-existent-id')).rejects.toThrow(/not found/i);
    });

    it('should return null for getMeta of non-existent file', async () => {
      const meta = await rxdb.storage.getMeta('non-existent-id');
      expect(meta).toBeNull();
    });
  });

  describe('watch', () => {
    afterAll(cleanFiles);

    it('should emit meta updates via watch', async () => {
      const file = makeFile('watch.txt', 'initial');
      const meta = await rxdb.storage.upload(file);

      const emissions: (StorageFileMeta | null)[] = [];
      const sub = rxdb.storage.watch(meta.id).subscribe(val => emissions.push(val));

      // 等待初始发射。
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(emissions.length).toBeGreaterThanOrEqual(1);
      expect(emissions[0]?.name).toBe('watch.txt');

      sub.unsubscribe();
    });
  });
});
