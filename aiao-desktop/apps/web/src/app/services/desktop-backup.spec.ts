import '@angular/compiler';

import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { PlatformLocation } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_DESKTOP_BACKUP_BYTES, decodeDesktopBackup, encodeDesktopBackup } from '../data/desktop-backup-archive';
import { DesktopData } from '../data/desktop-data';
import { DesktopLocationGuard } from '../data/desktop-location-guard';
import { DESKTOP_SCHEMA_VERSION } from '../data/schema-version';
import { SystemPreference } from '../data/system-preference.entity';
import { configureServices } from '../testing/angular';
import { DesktopBackup } from './desktop-backup';
import { FileSystem } from './file-system';

const { filesystemFactory } = vi.hoisted(() => ({ filesystemFactory: vi.fn() }));
vi.mock('@aiao/rxdb-plugin-storage', async original => ({
  ...(await original<typeof import('@aiao/rxdb-plugin-storage')>()),
  createOpfsStorageFilesystem: filesystemFactory
}));

function setup() {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    }
  };
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('location', { origin: 'https://desktop.example' });
  const browserStorage = {
    estimate: vi.fn(async () => ({ usage: 20, quota: 100 })),
    persisted: vi.fn(async () => false),
    persist: vi.fn(async () => true),
    getDirectory: vi.fn(async () => ({}))
  };
  vi.stubGlobal('navigator', {
    storage: browserStorage,
    locks: { request: async (_name: string, _options: LockOptions, task: () => Promise<unknown>) => task() }
  });
  const bodies = new Map([
    ['blobs/file', new Blob(['abc'])],
    ['blobs/orphan', new Blob(['old'])],
    ['blobs/interrupted', new Blob(['left'])]
  ]);
  const metas = [
    { id: 'file', opfsPath: 'blobs/file', size: 3 },
    { id: 'orphan', opfsPath: 'blobs/orphan', size: 3 }
  ];
  const rows = [{ id: 'row', parentId: null, name: 'test.txt', type: 'file', contentId: 'file', size: 3 }];
  const order: string[] = [];
  const storage = {
    runExclusive: async <T>(task: () => Promise<T>) => {
      order.push('storage-lock');
      return task();
    },
    listAllMetas: async () => metas,
    read: vi.fn(async (id: string) => bodies.get(`blobs/${id}`) as Blob)
  };
  const adapter = Object.assign(Object.create(RxDBAdapterSqlite.prototype) as RxDBAdapterSqlite, {
    backup: vi.fn(async (sink: WritableStream<Uint8Array>) => {
      order.push('database-snapshot');
      const writer = sink.getWriter();
      await writer.write(new TextEncoder().encode('database bytes'));
      await writer.close();
    })
  });
  const database = { storage, getAdapter: vi.fn<() => Promise<RxDBAdapterSqlite>>(async () => adapter) };
  const repository = {
    find: vi.fn(async () => rows),
    remove: vi.fn(async (meta: { id: string }) => {
      metas.splice(
        metas.findIndex(item => item.id === meta.id),
        1
      );
    })
  };
  const data = {
    database,
    repository: async (type: unknown) =>
      type === SystemPreference ?
        { find: async () => [{ key: 'seed:disk', value: { version: 1, seededAt: 0 } }] }
      : repository,
    locationGuard: new DesktopLocationGuard(localStorage),
    tabs: { exclusive: async <T>(task: () => Promise<T>) => task() }
  };
  const filesystem = {
    list: async function* (path: string) {
      if (path === '/') yield { name: 'blobs', kind: 'directory' };
      else for (const key of bodies.keys()) yield { name: key.split('/')[1], kind: 'file' };
    },
    readBlob: async (path: string) => bodies.get(path) as Blob,
    removeFile: vi.fn(async (path: string) => {
      bodies.delete(path);
    }),
    dispose: vi.fn()
  };
  filesystemFactory.mockReturnValue(filesystem);
  configureServices([
    DesktopBackup,
    { provide: DesktopData, useValue: data },
    {
      provide: FileSystem,
      useValue: {
        run: async <T>(task: () => Promise<T>) => {
          order.push('disk-lock');
          return task();
        }
      }
    },
    { provide: PlatformLocation, useValue: { getBaseHrefFromDOM: () => '/' } }
  ]);
  return {
    backup: TestBed.inject(DesktopBackup),
    storage,
    adapter,
    browserStorage,
    order,
    rows,
    metas,
    bodies,
    filesystem,
    localStorage,
    database,
    repository
  };
}

beforeEach(() => vi.clearAllMocks());

describe('桌面完整备份服务', () => {
  it('磁盘锁和文件体锁内导出完整数据库与文件，来源和版本可校验', async () => {
    const { backup, order } = setup();
    const blob = await backup.export();
    const decoded = await decodeDesktopBackup(blob, DESKTOP_SCHEMA_VERSION);
    expect(order).toEqual(['disk-lock', 'storage-lock', 'database-snapshot']);
    expect(decoded.manifest.sourceOrigin).toBe('https://desktop.example');
    expect(await decoded.database.text()).toBe('database bytes');
    expect(decoded.files.length).toBe(2);
    expect((await backup.inspect(blob)).manifest.schema).toBe(DESKTOP_SCHEMA_VERSION);
  });

  it('数据库超限、存储引用损坏和错误适配器都拒绝导出', async () => {
    const { backup, adapter, rows, database } = setup();
    rows[0].size = 6;
    await expect(backup.export()).rejects.toThrow('First Aid');
    vi.mocked(adapter.backup).mockImplementationOnce(async sink => {
      const writer = sink.getWriter();
      await writer.write({ byteLength: MAX_DESKTOP_BACKUP_BYTES + 1 } as Uint8Array);
      throw new Error('unreachable');
    });
    await expect(backup.export()).rejects.toThrow('256 MiB');
    database.getAdapter.mockResolvedValueOnce({} as RxDBAdapterSqlite);
    await expect(backup.export()).rejects.toThrow('adapter');
  });

  it('空间和持久性来自浏览器接口；权限失败明确报告', async () => {
    const { backup, browserStorage } = setup();
    expect(await backup.health()).toEqual({ usage: 20, quota: 100, persisted: false, opfs: true, error: null });
    expect(await backup.persist()).toBe(true);
    browserStorage.getDirectory.mockRejectedValueOnce(new Error('OPFS blocked'));
    expect(await backup.health()).toMatchObject({ opfs: false, error: 'OPFS blocked' });
    browserStorage.estimate.mockResolvedValueOnce({} as StorageEstimate as { usage: number; quota: number });
    expect(await backup.health()).toMatchObject({ usage: null, quota: null });
  });

  it('First Aid 查出两类孤儿，修复只删除无引用内容，保留有效文件', async () => {
    const { backup, bodies, metas, filesystem } = setup();
    const report = await backup.check();
    expect(report.orphanMetaIds).toEqual(['orphan']);
    expect(report.orphanPaths).toEqual(['blobs/interrupted']);
    expect(filesystem.removeFile).not.toHaveBeenCalled();
    expect(await backup.check(true)).toMatchObject({ issues: [], orphanMetaIds: [], orphanPaths: [] });
    expect([...bodies.keys()]).toEqual(['blobs/file']);
    expect(metas.map(meta => meta.id)).toEqual(['file']);
    expect(filesystem.dispose).toHaveBeenCalledTimes(2);
  });

  it('引用损坏时拒绝修复，不删除任何无引用内容', async () => {
    const { backup, rows, filesystem, repository } = setup();
    rows[0].size = 100;
    await expect(backup.check(true)).rejects.toThrow('references are damaged');
    expect(repository.remove).not.toHaveBeenCalled();
    expect(filesystem.removeFile).not.toHaveBeenCalled();
  });

  it('修复失败传播错误并释放文件系统，不报告成功', async () => {
    const { backup, filesystem } = setup();
    filesystem.removeFile.mockRejectedValueOnce(new Error('storage denied'));
    await expect(backup.check(true)).rejects.toThrow('storage denied');
    expect(filesystem.dispose).toHaveBeenCalledOnce();
  });

  it('恢复先校验再起 Worker，成功后切换代际，清理中断只针对临时目标', async () => {
    const { backup, localStorage } = setup();
    const messages: { worker?: string; data: unknown }[] = [];
    class WorkerStub {
      onMessage?: (event: MessageEvent) => void;

      constructor(
        _url: URL,
        private readonly options: WorkerOptions
      ) {}

      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        if (type === 'message') this.onMessage = listener;
      }
      postMessage(message: unknown) {
        messages.push({ worker: this.options.name, data: message });
        queueMicrotask(() => this.onMessage?.({ data: { ok: true } } as MessageEvent));
      }
      terminate() {
        /* 子进程替身没有资源。 */
      }
    }
    vi.stubGlobal('Worker', WorkerStub);
    await expect(backup.restore(new Blob(['broken']))).rejects.toThrow();
    expect(messages).toEqual([]);
    const archive = await encodeDesktopBackup({
      schema: DESKTOP_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      sourceOrigin: 'https://old.example',
      database: new Blob(['db']),
      files: []
    });
    await backup.restore(archive);
    const active = JSON.parse(localStorage.getItem('aiao-desktop:data-location') ?? '{}').active;
    expect(active).toMatch(/^[a-f0-9]{12}$/);
    localStorage.setItem('aiao-desktop:restore-pending', JSON.stringify({ version: 1, generation: 'abcdef123456' }));
    await backup.cleanupInterruptedRestore();
    expect(messages).toEqual([
      { worker: 'aiao-desktop-restore', data: { generation: active, baseHref: '/', archive } },
      { worker: 'aiao-desktop-restore-discard', data: { generation: 'abcdef123456', baseHref: '/' } }
    ]);
  });
});
