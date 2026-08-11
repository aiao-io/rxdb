import { RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';
import { describe, expect, it } from 'vitest';
import {
  checkVFSConfig,
  DEFAULT_LOCK_TIMEOUT_MS,
  DEFAULT_VFS,
  WA_SQLITE_VFS_LIST,
  waSqliteLoad
} from '../sqlite-load.utils.js';
import type { LoadModuleOptions } from '../sqlite.interface.js';
import { asyncWasmPath, syncWasmPath } from './wa-sqlite-wasm.js';

describe('sqlite-load.utils', () => {
  describe('WA_SQLITE_VFS_LIST', () => {
    it('应该包含 README 中列出的 9 个 VFS 支持项', () => {
      expect(WA_SQLITE_VFS_LIST).toHaveLength(9);
      const names = WA_SQLITE_VFS_LIST.map(v => v.name);
      expect(names).toContain('MemoryVFS');
      expect(names).toContain('MemoryAsyncVFS');
      expect(names).toContain('IDBBatchAtomicVFS');
      expect(names).toContain('IDBMirrorVFS');
      expect(names).toContain('AccessHandlePoolVFS');
      expect(names).toContain('OPFSAdaptiveVFS');
      expect(names).toContain('OPFSAnyContextVFS');
      expect(names).toContain('OPFSCoopSyncVFS');
      expect(names).toContain('OPFSWriteAheadVFS');
      expect(names).not.toContain('OPFSPermutedVFS');
    });

    it('公开注册表及条目在运行时不可变', () => {
      expect(Object.isFrozen(WA_SQLITE_VFS_LIST)).toBe(true);
      expect(WA_SQLITE_VFS_LIST.every(Object.isFrozen)).toBe(true);
    });

    it('应该包含 MemoryVFS', () => {
      const memoryVFS = WA_SQLITE_VFS_LIST.find(v => v.name === 'MemoryVFS');
      expect(memoryVFS).toBeDefined();
      expect(memoryVFS?.sync).toBe(true);
      expect(memoryVFS?.async).toBe(true);
      expect(memoryVFS?.worker).toBe(true);
      expect(memoryVFS?.jsContext).toBe(true);
      expect(memoryVFS?.sharedWorker).toBe(true);
      expect(memoryVFS?.multipleConnections).toBe(false);
    });

    it('应该包含 MemoryAsyncVFS', () => {
      const memoryAsyncVFS = WA_SQLITE_VFS_LIST.find(v => v.name === 'MemoryAsyncVFS');
      expect(memoryAsyncVFS).toBeDefined();
      expect(memoryAsyncVFS?.sync).toBe(false);
      expect(memoryAsyncVFS?.async).toBe(true);
    });

    it('所有 VFS 都应该有必需的属性', () => {
      WA_SQLITE_VFS_LIST.forEach(vfs => {
        expect(vfs.name).toBeDefined();
        expect(vfs.vfsModule).toBeTypeOf('function');
        expect(typeof vfs.sync).toBe('boolean');
        expect(typeof vfs.async).toBe('boolean');
        expect(typeof vfs.jsContext).toBe('boolean');
        expect(typeof vfs.worker).toBe('boolean');
        expect(typeof vfs.sharedWorker).toBe('boolean');
      });
    });

    it('应该正确标记 sharedWorker 支持', () => {
      const idbVFS = WA_SQLITE_VFS_LIST.find(v => v.name === 'IDBBatchAtomicVFS');
      expect(idbVFS?.sharedWorker).toBe(true);

      const idbMirrorVFS = WA_SQLITE_VFS_LIST.find(v => v.name === 'IDBMirrorVFS');
      expect(idbMirrorVFS?.sharedWorker).toBe(true);

      const opfsAdaptive = WA_SQLITE_VFS_LIST.find(v => v.name === 'OPFSAdaptiveVFS');
      expect(opfsAdaptive?.sharedWorker).toBe(false);

      const opfsAnyContext = WA_SQLITE_VFS_LIST.find(v => v.name === 'OPFSAnyContextVFS');
      expect(opfsAnyContext?.sharedWorker).toBe(true);
    });

    it('支持主线程加载的 VFS 的 vfsModule 都应该能动态加载出带 create 的工厂', async () => {
      // jsContext: false 的 VFS（如 OPFSAdaptiveVFS）模块顶层依赖 worker-only API，主线程 import 即抛错
      const mainThreadLoadable = WA_SQLITE_VFS_LIST.filter(vfs => vfs.jsContext);
      expect(mainThreadLoadable.length).toBeGreaterThan(0);
      for (const vfs of mainThreadLoadable) {
        const factory = (await vfs.vfsModule()) as { create?: unknown };
        expect(factory, vfs.name).toBeDefined();
        expect(typeof factory.create, vfs.name).toBe('function');
      }
    });

    it('应该正确标记多连接支持', () => {
      const memoryVFS = WA_SQLITE_VFS_LIST.find(v => v.name === 'MemoryVFS');
      expect(memoryVFS?.multipleConnections).toBe(false);

      const idbVFS = WA_SQLITE_VFS_LIST.find(v => v.name === 'IDBBatchAtomicVFS');
      expect(idbVFS?.multipleConnections).toBe(true);

      const idbMirrorVFS = WA_SQLITE_VFS_LIST.find(v => v.name === 'IDBMirrorVFS');
      expect(idbMirrorVFS?.multipleConnections).toBe(true);
    });
  });

  describe('checkVFSConfig', () => {
    it('缺省 vfs 使用明确的生产默认值', () => {
      expect(DEFAULT_VFS).toBe('IDBBatchAtomicVFS');
      expect(checkVFSConfig({}).name).toBe(DEFAULT_VFS);
    });

    it('应该验证有效的 VFS 配置', () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryAsyncVFS',
        async: true,
        worker: false
      };
      const config = checkVFSConfig(options);
      expect(config).toBeDefined();
      expect(config.name).toBe('MemoryAsyncVFS');
    });

    // 校验对象与被校验对象不是同一个值：checkVFSConfig 只断言**显式传入**的
    // options.async，不传时两条断言都不触发；而 waSqliteLoad 是
    // `options.async === false ? sync : async`，即默认加载 asyncify 构建。
    // 于是声明「不支持 async」的 VFS 在不传 async 时能顺利过校验，再被塞进 async 构建。
    it('不传 async 时按 VFS 能力解析，而非硬编码 async', () => {
      // OPFSWriteAheadVFS 声明 sync: true, async: false
      expect(checkVFSConfig({ vfs: 'OPFSWriteAheadVFS', worker: true }).useAsync).toBe(false);
      // IDBBatchAtomicVFS 声明 sync: false, async: true
      expect(checkVFSConfig({ vfs: 'IDBBatchAtomicVFS' }).useAsync).toBe(true);
    });

    it('显式传入的 async 优先于 VFS 默认能力', () => {
      // OPFSCoopSyncVFS 同时支持 sync 与 async，适配器无从猜测，必须尊重显式值
      expect(checkVFSConfig({ vfs: 'OPFSCoopSyncVFS', worker: true, async: false }).useAsync).toBe(false);
      expect(checkVFSConfig({ vfs: 'OPFSCoopSyncVFS', worker: true, async: true }).useAsync).toBe(true);
    });

    it('解析后的模式与 VFS 能力冲突时抛错', () => {
      // 不传 async 也要能拦住：解析结果才是真正会被使用的值
      expect(() => checkVFSConfig({ vfs: 'MemoryAsyncVFS', async: false })).toThrow('not support async: false');
    });

    it('当 VFS 不存在时应该抛出错误', () => {
      const options = {
        vfs: 'NonExistentVFS'
      } as unknown as LoadModuleOptions;
      expect(() => checkVFSConfig(options)).toThrow(RxDBAdapterSqliteError);
      expect(() => checkVFSConfig(options)).toThrow('vfs NonExistentVFS not found');
    });

    it('当 VFS 不支持 sync 但要求 async: false 时应该抛出错误', () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryAsyncVFS', // sync: false
        async: false
      };
      expect(() => checkVFSConfig(options)).toThrow(RxDBAdapterSqliteError);
      expect(() => checkVFSConfig(options)).toThrow('vfs MemoryAsyncVFS not support async: false');
    });

    it('当 VFS 同时支持 sync 和 async 时应该允许两种模式', () => {
      const asyncOptions: LoadModuleOptions = {
        vfs: 'MemoryVFS', // sync: true, async: true
        async: true
      };
      expect(() => checkVFSConfig(asyncOptions)).not.toThrow();

      const syncOptions: LoadModuleOptions = {
        vfs: 'MemoryVFS',
        async: false
      };
      expect(() => checkVFSConfig(syncOptions)).not.toThrow();
    });

    it('当在 worker 中使用支持 worker 的 VFS 时应该通过验证', () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryAsyncVFS',
        worker: true
      };
      expect(() => checkVFSConfig(options)).not.toThrow();
    });

    it('当在非 worker 环境使用仅支持 worker 的 VFS 时应该抛出错误', () => {
      const options: LoadModuleOptions = {
        vfs: 'OPFSAdaptiveVFS',
        worker: false
      };
      expect(() => checkVFSConfig(options)).toThrow(RxDBAdapterSqliteError);
      expect(() => checkVFSConfig(options)).toThrow('vfs OPFSAdaptiveVFS only support worker');
    });

    it('当在 sharedWorker 环境使用支持 sharedWorker 的 VFS 时应该通过验证', () => {
      const options: LoadModuleOptions = {
        vfs: 'IDBMirrorVFS',
        sharedWorker: true
      };
      expect(() => checkVFSConfig(options)).not.toThrow();
    });

    it('OPFSAnyContextVFS 在 SharedWorker 中通过能力校验', () => {
      expect(() => checkVFSConfig({ vfs: 'OPFSAnyContextVFS', async: true, sharedWorker: true })).not.toThrow();
    });

    it('当在 sharedWorker 环境使用不支持 sharedWorker 的 VFS 时应该抛出错误', () => {
      const options: LoadModuleOptions = {
        vfs: 'OPFSAdaptiveVFS',
        sharedWorker: true
      };
      expect(() => checkVFSConfig(options)).toThrow(RxDBAdapterSqliteError);
      expect(() => checkVFSConfig(options)).toThrow('vfs OPFSAdaptiveVFS not support sharedWorker');
    });

    it('当 async 参数未定义时应该通过验证', () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryAsyncVFS'
      };
      expect(() => checkVFSConfig(options)).not.toThrow();
    });

    it('当 worker 为 false 且 VFS 支持 jsContext 时应该通过验证', () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryAsyncVFS',
        worker: false
      };
      expect(() => checkVFSConfig(options)).not.toThrow();
    });

    it('应该返回正确的 vfsOptions', () => {
      const options: LoadModuleOptions = {
        vfs: 'IDBBatchAtomicVFS'
      };
      const config = checkVFSConfig(options);
      expect(config.vfsOptions).toEqual({ lockPolicy: 'shared+hint', lockTimeout: DEFAULT_LOCK_TIMEOUT_MS });
    });

    it('shared+hint 锁策略必须带有限的 lockTimeout，避免锁竞争下无限期挂起', () => {
      const hintVfsNames: Array<LoadModuleOptions['vfs']> = [
        'IDBBatchAtomicVFS',
        'OPFSAdaptiveVFS',
        'OPFSAnyContextVFS'
      ];

      for (const vfs of hintVfsNames) {
        const config = WA_SQLITE_VFS_LIST.find(candidate => candidate.name === vfs);
        expect(config?.vfsOptions?.lockPolicy).toBe('shared+hint');
        expect(config?.vfsOptions?.lockTimeout).toBeTypeOf('number');
        expect(config?.vfsOptions?.lockTimeout).toBeGreaterThan(0);
        expect(config?.vfsOptions?.lockTimeout).toBeLessThan(Infinity);
      }
    });

    it('当 VFS 没有 vfsOptions 时应该返回 undefined', () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryVFS'
      };
      const config = checkVFSConfig(options);
      expect(config.vfsOptions).toBeUndefined();
    });

    it('当同时支持 sync 和 async 的 VFS 应该通过验证', () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryVFS',
        async: true
      };
      expect(() => checkVFSConfig(options)).not.toThrow();
    });
  });

  describe('sqliteLoad', () => {
    it('应该加载 async SQLite 模块', async () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryAsyncVFS',
        async: true,
        wasmPath: asyncWasmPath
      };
      const { sqlite3 } = await waSqliteLoad(options);
      expect(sqlite3).toBeDefined();
      expect(sqlite3.vfs_register).toBeTypeOf('function');
    });

    it('应该加载 sync SQLite 模块', async () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryVFS',
        async: false,
        wasmPath: syncWasmPath
      };
      const { sqlite3 } = await waSqliteLoad(options);
      expect(sqlite3).toBeDefined();
      expect(sqlite3.vfs_register).toBeTypeOf('function');
    });

    // 不再硬编码 async：未指定时由 VFS 声明的能力决定。
    // MemoryAsyncVFS 声明 sync: false / async: true，故仍解析为 async。
    it('当 async 未定义时按 VFS 能力解析', async () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryAsyncVFS',
        wasmPath: asyncWasmPath
      };
      const { sqlite3 } = await waSqliteLoad(options);
      expect(sqlite3).toBeDefined();
    });

    // asyncify glue 与非 asyncify wasm 的 import/export 不兼容，混搭在实例化阶段才失败，
    // 报错出自 Emscripten 内部、极难归因。全仓 9 个 demo 的 OPFS 分支正是踩在这个组合上。
    it('wasmPath 指向对面那个构建时立即抛出可操作的错误', async () => {
      await expect(waSqliteLoad({ vfs: 'MemoryAsyncVFS', wasmPath: '/assets/wa-sqlite.wasm' })).rejects.toThrow(
        'is the sync build'
      );
      await expect(
        waSqliteLoad({ vfs: 'OPFSWriteAheadVFS', worker: true, wasmPath: '/assets/wa-sqlite-async.wasm' })
      ).rejects.toThrow('is the asyncify build');
    });

    it('data URI / 自定义文件名不受命名约定限制', async () => {
      // 带哈希的产物名、data URI、blob 都是合法用法，只拦「明确是对面构建」的已知不匹配
      const { sqlite3 } = await waSqliteLoad({ vfs: 'MemoryAsyncVFS', wasmPath: asyncWasmPath });
      expect(sqlite3).toBeDefined();
    });

    it('当 VFS 配置无效时应该抛出错误', async () => {
      const options = {
        vfs: 'NonExistentVFS'
      } as unknown as LoadModuleOptions;
      await expect(waSqliteLoad(options)).rejects.toThrow(RxDBAdapterSqliteError);
    });

    it('应该正确加载不同的内存 VFS', async () => {
      const vfsNames: Array<LoadModuleOptions['vfs']> = ['MemoryVFS', 'MemoryAsyncVFS'];

      for (const vfs of vfsNames) {
        const { sqlite3 } = await waSqliteLoad({ vfs, wasmPath: asyncWasmPath });
        expect(sqlite3).toBeDefined();
      }
    });

    it('持久化 VFS 配置应该保留特定参数', () => {
      const config = checkVFSConfig({ vfs: 'IDBBatchAtomicVFS' });
      expect(config.vfsOptions).toEqual({ lockPolicy: 'shared+hint', lockTimeout: DEFAULT_LOCK_TIMEOUT_MS });
    });

    it('返回已注册的 vfs 实例，供调用方在 disconnect 时关闭', async () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryAsyncVFS',
        async: true,
        wasmPath: asyncWasmPath
      };
      const { vfs } = await waSqliteLoad(options);
      expect(vfs).toBeDefined();
      expect(vfs.close).toBeTypeOf('function');
    });

    it('不需要写提示的 VFS 返回 undefined lockPolicy', async () => {
      const options: LoadModuleOptions = {
        vfs: 'MemoryAsyncVFS',
        async: true,
        wasmPath: asyncWasmPath
      };
      const { lockPolicy } = await waSqliteLoad(options);
      expect(lockPolicy).toBeUndefined();
    });

    it('shared+hint 锁策略的 VFS 会带回 lockPolicy 供客户端选择 BEGIN 语句', async () => {
      const options: LoadModuleOptions = {
        vfs: 'IDBBatchAtomicVFS',
        async: true,
        wasmPath: asyncWasmPath
      };
      const { vfs, lockPolicy } = await waSqliteLoad(options);
      try {
        expect(lockPolicy).toBe('shared+hint');
      } finally {
        await vfs.close();
      }
    });
  });
});
