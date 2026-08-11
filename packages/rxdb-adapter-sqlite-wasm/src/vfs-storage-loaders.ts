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

import { useMemoryStorage } from '@subframe7536/sqlite-wasm';
import { useFsHandleStorage } from '@subframe7536/sqlite-wasm/fs-handle';
import { useIdbStorage } from '@subframe7536/sqlite-wasm/idb';
import { useIdbMemoryStorage } from '@subframe7536/sqlite-wasm/idb-memory';
import { useOpfsStorage } from '@subframe7536/sqlite-wasm/opfs';

/**
 * 聚合的存储预设工厂函数集合。
 */
export const vfsStorageLoaders = {
  useMemoryStorage,
  useIdbStorage,
  useIdbMemoryStorage,
  useOpfsStorage,
  useFsHandleStorage
} as const;
