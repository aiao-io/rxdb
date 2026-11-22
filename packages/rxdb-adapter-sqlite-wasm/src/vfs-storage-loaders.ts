/**
 * @fileoverview @subframe7536/sqlite-wasm 存储预设加载器聚合模块
 *
 * 将全部 VFS 预设（idb / idb-memory / opfs / fs-handle）的 `use*Storage`
 * 工厂函数聚合到单一模块内，供 {@link module:sqlite-load.utils} 通过 **一次**
 * 动态 `import()` 统一加载。
 *
 * ## 为什么需要聚合
 *
 * 若在多个 `import()` 站点分别懒加载各子路径，`idb`、`opfs`、`fs-handle`
 * 会共享底层的 `FacadeVFS` / `WebLocksMixin` 基类模块；在 Angular 22
 * （esbuild 0.28 code-splitting + 压缩）下，该共享基类会被拆分为一个
 * 「幽灵」共享 chunk：被 import 引用却未实际产出对应文件，导致运行时
 * `Failed to fetch dynamically imported module`。
 *
 * 通过将所有子路径收敛到本模块并以单一 `import()` 加载，共享基类只被一个
 * 懒加载 chunk 引用，esbuild 会将其内联进该 chunk，从而规避此上游缺陷，
 * 同时保留「未使用 sqlite-wasm 适配器时不进入首屏包」的懒加载收益。
 *
 * @module vfs-storage-loaders
 */

import { isOpfsAccessHandleBusy, openOpfsWithRetry, releaseOpfsCoopSyncHandles, RxDBAdapterSqliteError } from '@aiao/rxdb-adapter-sqlite-core';
import { initSQLiteCore, useMemoryStorage, type InitSQLiteOptions, type SQLiteDBCore } from '@subframe7536/sqlite-wasm';
import { useFsHandleStorage } from '@subframe7536/sqlite-wasm/fs-handle';
import { useIdbStorage } from '@subframe7536/sqlite-wasm/idb';
import { useIdbMemoryStorage } from '@subframe7536/sqlite-wasm/idb-memory';
import { useOpfsStorage } from '@subframe7536/sqlite-wasm/opfs';
import type { LoadModuleOptions } from './sqlite.interface.js';

/** 库名对应的数据库文件名。 */
const sqliteFileName = (dbName: string): string => `${dbName}.sqlite`;

/**
 * 根据 VFS 预设和选项生成 @subframe7536/sqlite-wasm 的 storage 初始化 options
 */
const buildStorageOptions = async (dbName: string, options: LoadModuleOptions): Promise<InitSQLiteOptions> => {
  const vfs = options.vfs ?? 'idb';
  const fileName = sqliteFileName(dbName);
  const base = {
    url: options.wasmUrl,
    readonly: options.readonly
  };

  switch (vfs) {
    case 'memory': {
      return useMemoryStorage(base);
    }
    case 'idb': {
      return useIdbStorage(fileName, {
        ...base,
        lockPolicy: options.idbLockPolicy,
        lockTimeout: options.idbLockTimeout
      });
    }
    case 'idb-memory': {
      return useIdbMemoryStorage(fileName, base);
    }
    case 'opfs': {
      return useOpfsStorage(fileName, base);
    }
    case 'fs-handle': {
      if (!options.fsRoot) {
        throw new RxDBAdapterSqliteError(`vfs ${vfs} requires options.fsRoot`);
      }
      return useFsHandleStorage(fileName, options.fsRoot, base);
    }
    default: {
      const _exhaustive: never = vfs;
      throw new RxDBAdapterSqliteError(`unsupported vfs: ${String(_exhaustive)}`);
    }
  }
};

/**
 * 打开一次 `opfs` 库；失败时交出这一次的 VFS 留下的同步访问句柄。
 *
 * @remarks
 * `opfs` 档是 `OPFSCoopSyncVFS`：打开失败留下的句柄要等垃圾回收才放开，同一个 Worker 里的重试会撞上自己
 * （见 {@link releaseOpfsCoopSyncHandles}）。VFS 在 `open_v2` 之前经 `beforeOpen` 交到这里；没走到那一步就没有句柄可交。
 */
const openOpfsOnce = async (storage: InitSQLiteOptions): Promise<SQLiteDBCore> => {
  let vfs: object | undefined;
  try {
    return await initSQLiteCore({
      ...storage,
      beforeOpen: opened => {
        vfs = opened;
      }
    });
  } catch (error) {
    if (vfs) releaseOpfsCoopSyncHandles(vfs);
    throw error;
  }
};

/** 在实际持有连接的线程里打开所选 VFS。 */
export const openSqlite = async (dbName: string, options: LoadModuleOptions): Promise<SQLiteDBCore> => {
  if ((options.vfs ?? 'idb') !== 'opfs') return initSQLiteCore(await buildStorageOptions(dbName, options));
  const fileName = sqliteFileName(dbName);
  const open = async () => openOpfsOnce(await buildStorageOptions(dbName, options));
  return openOpfsWithRetry(open, { fileName, isAccessHandleBusy: () => isOpfsAccessHandleBusy(fileName) });
};
