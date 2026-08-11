import { RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  initSQLiteCore: vi.fn(),
  useFsHandleStorage: vi.fn(),
  useIdbMemoryStorage: vi.fn(),
  useIdbStorage: vi.fn(),
  useMemoryStorage: vi.fn(),
  useOpfsStorage: vi.fn()
}));

vi.mock('@subframe7536/sqlite-wasm', () => ({
  initSQLiteCore: storageMocks.initSQLiteCore,
  useMemoryStorage: storageMocks.useMemoryStorage
}));
vi.mock('@subframe7536/sqlite-wasm/idb', () => ({ useIdbStorage: storageMocks.useIdbStorage }));
vi.mock('@subframe7536/sqlite-wasm/idb-memory', () => ({
  useIdbMemoryStorage: storageMocks.useIdbMemoryStorage
}));
vi.mock('@subframe7536/sqlite-wasm/opfs', () => ({ useOpfsStorage: storageMocks.useOpfsStorage }));
vi.mock('@subframe7536/sqlite-wasm/fs-handle', () => ({
  useFsHandleStorage: storageMocks.useFsHandleStorage
}));

import { checkVFSConfig, SQLITE_WASM_VFS_LIST, sqliteLoad } from '../sqlite-load.utils.js';
import type { LoadModuleOptions } from '../sqlite.interface.js';

describe('sqlite-load.utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.initSQLiteCore.mockResolvedValue({ pointer: 1, sqlite: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('SQLITE_WASM_VFS_LIST', () => {
    it('包含全部 5 个预设存储', () => {
      expect(SQLITE_WASM_VFS_LIST.map(vfs => vfs.name)).toEqual(['memory', 'idb', 'idb-memory', 'opfs', 'fs-handle']);
    });

    it('声明 memory、idb、opfs 的运行环境能力', () => {
      expect(SQLITE_WASM_VFS_LIST.find(vfs => vfs.name === 'memory')).toMatchObject({
        jsContext: true,
        worker: true,
        sharedWorker: true,
        multipleConnections: false
      });
      expect(SQLITE_WASM_VFS_LIST.find(vfs => vfs.name === 'idb')).toMatchObject({ multipleConnections: true });
      expect(SQLITE_WASM_VFS_LIST.find(vfs => vfs.name === 'opfs')).toMatchObject({
        jsContext: false,
        worker: true,
        sharedWorker: false
      });
    });

    // SWM-004：根入口导出的是**可变数组**，而 `checkVFSConfig()` 读的就是同一份。
    // 消费者把 opfs 的 `jsContext` 改成 true，即可绕过「OPFS 必须在 Worker 里」这道环境守卫；
    // splice 掉条目则能制造 `vfs not found`。校验表必须是模块私有且不可变的。
    it('导出的 VFS 表不可被消费者篡改', () => {
      const mutable = SQLITE_WASM_VFS_LIST as unknown as Array<Record<string, unknown>>;

      expect(() => mutable.splice(0, 1)).toThrow(TypeError);
      const opfs = SQLITE_WASM_VFS_LIST.find(vfs => vfs.name === 'opfs');
      expect(() => {
        (opfs as unknown as Record<string, unknown>)['jsContext'] = true;
      }).toThrow(TypeError);
    });

    it('篡改尝试不得影响 checkVFSConfig 的环境守卫', () => {
      const opfs = SQLITE_WASM_VFS_LIST.find(vfs => vfs.name === 'opfs');
      try {
        (opfs as unknown as Record<string, unknown>)['jsContext'] = true;
      } catch {
        // 冻结后抛错即符合预期，守卫断言仍需成立
      }

      expect(() => checkVFSConfig({ vfs: 'opfs' })).toThrow(RxDBAdapterSqliteError);
    });
  });

  describe('checkVFSConfig', () => {
    it('默认 vfs 为 idb', () => {
      expect(checkVFSConfig({}).name).toBe('idb');
    });

    it('拒绝未知 VFS', () => {
      const options = { vfs: 'unknown' } as unknown as LoadModuleOptions;
      expect(() => checkVFSConfig(options)).toThrow(RxDBAdapterSqliteError);
      expect(() => checkVFSConfig(options)).toThrow('vfs unknown not found');
    });

    it('拒绝在主线程使用 opfs', () => {
      expect(() => checkVFSConfig({ vfs: 'opfs' })).toThrow('vfs opfs only support worker');
    });

    it('主线程谎报 worker 不得绕过 opfs 守卫', () => {
      expect(() => checkVFSConfig({ vfs: 'opfs', worker: true })).toThrow(/actual environment is main thread/);
    });

    it('真实 Worker 不传 transport 标志也允许 opfs', () => {
      class WorkerScope {
        static [Symbol.hasInstance](value: unknown): boolean {
          return value === globalThis;
        }
      }
      vi.stubGlobal('WorkerGlobalScope', WorkerScope);

      expect(() => checkVFSConfig({ vfs: 'opfs' })).not.toThrow();
    });

    it('真实 SharedWorker 按 sharedWorker 能力校验', () => {
      class WorkerScope {
        static [Symbol.hasInstance](value: unknown): boolean {
          return value === globalThis;
        }
      }
      class SharedWorkerScope {
        static [Symbol.hasInstance](value: unknown): boolean {
          return value === globalThis;
        }
      }
      vi.stubGlobal('WorkerGlobalScope', WorkerScope);
      vi.stubGlobal('SharedWorkerGlobalScope', SharedWorkerScope);

      expect(() => checkVFSConfig({ vfs: 'idb' })).not.toThrow();
      expect(() => checkVFSConfig({ vfs: 'opfs' })).toThrow(/not support sharedWorker/);
    });

    it('拒绝在 SharedWorker 使用 fs-handle', () => {
      class SharedWorkerScope {
        static [Symbol.hasInstance](value: unknown): boolean {
          return value === globalThis;
        }
      }
      vi.stubGlobal('SharedWorkerGlobalScope', SharedWorkerScope);

      expect(() => checkVFSConfig({ vfs: 'fs-handle' })).toThrow('vfs fs-handle not support sharedWorker');
    });
  });

  describe('sqliteLoad 存储分派', () => {
    it('memory 传递 wasmUrl 与 readonly', async () => {
      const storage = { kind: 'memory' };
      storageMocks.useMemoryStorage.mockReturnValue(storage);

      await sqliteLoad('db', { vfs: 'memory', wasmUrl: 'data:wasm', readonly: true });

      expect(storageMocks.useMemoryStorage).toHaveBeenCalledWith({ url: 'data:wasm', readonly: true });
      expect(storageMocks.initSQLiteCore).toHaveBeenCalledWith(storage);
    });

    it('idb 传递文件名与锁配置', async () => {
      const storage = { kind: 'idb' };
      storageMocks.useIdbStorage.mockReturnValue(storage);

      await sqliteLoad('db', {
        vfs: 'idb',
        idbLockPolicy: 'exclusive',
        idbLockTimeout: 250,
        readonly: false,
        wasmUrl: 'data:wasm'
      });

      expect(storageMocks.useIdbStorage).toHaveBeenCalledWith('db.sqlite', {
        url: 'data:wasm',
        readonly: false,
        lockPolicy: 'exclusive',
        lockTimeout: 250
      });
      expect(storageMocks.initSQLiteCore).toHaveBeenCalledWith(storage);
    });

    it('idb-memory 传递文件名与基础配置', async () => {
      const storage = { kind: 'idb-memory' };
      storageMocks.useIdbMemoryStorage.mockReturnValue(storage);

      await sqliteLoad('db', { vfs: 'idb-memory', wasmUrl: 'data:wasm' });

      expect(storageMocks.useIdbMemoryStorage).toHaveBeenCalledWith('db.sqlite', {
        url: 'data:wasm',
        readonly: undefined
      });
      expect(storageMocks.initSQLiteCore).toHaveBeenCalledWith(storage);
    });

    it('opfs 在 Worker 配置下分派到 OPFS storage', async () => {
      class WorkerScope {
        static [Symbol.hasInstance](value: unknown): boolean {
          return value === globalThis;
        }
      }
      vi.stubGlobal('WorkerGlobalScope', WorkerScope);
      const storage = { kind: 'opfs' };
      storageMocks.useOpfsStorage.mockReturnValue(storage);

      await sqliteLoad('db', { vfs: 'opfs', worker: true, readonly: true });

      expect(storageMocks.useOpfsStorage).toHaveBeenCalledWith('db.sqlite', {
        url: undefined,
        readonly: true
      });
      expect(storageMocks.initSQLiteCore).toHaveBeenCalledWith(storage);
    });

    it('fs-handle 缺少 fsRoot 时 fail-fast', async () => {
      await expect(sqliteLoad('db', { vfs: 'fs-handle' })).rejects.toThrow('vfs fs-handle requires options.fsRoot');
      expect(storageMocks.useFsHandleStorage).not.toHaveBeenCalled();
      expect(storageMocks.initSQLiteCore).not.toHaveBeenCalled();
    });

    it('fs-handle 传递目录句柄', async () => {
      const storage = { kind: 'fs-handle' };
      const fsRoot = {} as FileSystemDirectoryHandle;
      storageMocks.useFsHandleStorage.mockReturnValue(storage);

      await sqliteLoad('db', { vfs: 'fs-handle', fsRoot, wasmUrl: 'data:wasm' });

      expect(storageMocks.useFsHandleStorage).toHaveBeenCalledWith('db.sqlite', fsRoot, {
        url: 'data:wasm',
        readonly: undefined
      });
      expect(storageMocks.initSQLiteCore).toHaveBeenCalledWith(storage);
    });
  });
});
