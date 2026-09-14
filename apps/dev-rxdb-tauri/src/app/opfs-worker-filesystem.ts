/**
 * @fileoverview OPFS 写通道 filesystem：storage 插件的默认 OPFS 后端，写路径拆到 worker
 *
 * WKWebView 的页面上下文没有 `createWritable`，插件默认 OPFS 后端在 Tauri 窗口里
 * 写不进去（storage 探针会以 `r.createWritable is not a function` 把强制档三态全部打成
 * failed）。worker 上下文却有 `createSyncAccessHandle` —— 本工厂产出的后端把读与目录
 * 操作**原样委托**插件默认后端，只有 `openWrite` 拆到专用 worker 用同步句柄写。
 *
 * 委托而非继承换写路径：读与写解析的是同一套段列表（rootDir 段 + 文件段，从 OPFS 根
 * 出发），文件与 metadata 因此留在同一个 WebView 存储域里 —— AC#9 的备份域不裂开，
 * 换掉的是「怎么写」而不是「写在哪」。委托表逐方法列出，缺一个新接口方法会当场
 * 编译失败，而不是静默继承一份旧实现。
 *
 * abort 的语义比 base 更强：worker 端截断 + 关闭，文件停留在空态而非半写态；
 * 服务层自己在失败路径上做快照还原（见 `storage.ops.ts`），abort 不需要也不会
 * 还原内容。
 */

import type { StorageFilesystem, StorageFilesystemFactory } from '@aiao/rxdb-plugin-storage';
import { createOpfsStorageFilesystem } from '@aiao/rxdb-plugin-storage';
import type { OpfsWorkerPort } from './opfs-worker-protocol';
import { createWorkerOpenWrite } from './opfs-worker-protocol';

/** 装配选项：单测注入替身，运行时全部走缺省。 */
export interface OpfsWorkerFilesystemOptions {
  /** 被委托的 base 后端工厂；缺省为插件默认 OPFS 后端。 */
  readonly base?: StorageFilesystemFactory;
  /** 写通道的 worker 端口；缺省为本模块自建的专用 worker。 */
  readonly port?: OpfsWorkerPort;
  /**
   * 写前在主线程预建文件条目；缺省实现走异步 API（`getDirectoryHandle`/`getFileHandle`
   * 的 `create: true`）。原因见 `openWrite` 的 WebKit 注记，这里不重复。
   */
  readonly precreateEntry?: (segments: readonly string[]) => Promise<void>;
}

/**
 * 缺省预建：从 OPFS 根逐段建目录，最后建文件条目。幂等 —— 条目已存在时原样返回。
 *
 * @param segments - `openWrite` 拼出的完整段列表（rootDir 段 + 文件段），最后一个元素是文件名
 */
const defaultPrecreateEntry = async (segments: readonly string[]): Promise<void> => {
  let directory = await navigator.storage.getDirectory();
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  const fileName = segments[segments.length - 1];
  if (fileName !== undefined) {
    await directory.getFileHandle(fileName, { create: true });
  }
};

/**
 * 缺省 worker：本模块专用入口，与 wa-sqlite 的 worker 分离 —— 写通道的生命周期跟着
 * storage 服务走，不该绑在数据库 worker 的生死上。
 */
const defaultStorageWorker = (): OpfsWorkerPort => {
  const worker = new Worker(new URL('./opfs-storage.worker', import.meta.url), { type: 'module' });
  return {
    // TS 6.0 的 lib.dom 里 `Worker.postMessage` 只有 `StructuredSerializeOptions` 一种
    // 第二参数形态：transfer 列表放进 options，端口接口保持简化的位置参数签名。
    postMessage: (message, transfer) => worker.postMessage(message, transfer === undefined ? undefined : { transfer }),
    onMessage: listener => worker.addEventListener('message', listener),
    onError: listener => worker.addEventListener('error', listener),
    terminate: () => worker.terminate()
  };
};

/**
 * 创建写通道 OPFS 后端的工厂。
 *
 * @param options - 装配选项；单测注入 base 工厂与端口替身
 * @returns 直接交给 storage 插件 `filesystem` 选项的工厂
 *
 * @remarks
 * 路径不做校验：服务层已按 `StorageFilesystem` 的边界约定规范化后再传入（与 base 同
 * 一契约位置），这里只把段列表拼全 —— rootDir 段由本工厂持有（插件在 `rootDir` 参数
 * 里传进来），文件段来自 `openWrite` 的入参。
 */
export const createOpfsWorkerFilesystem =
  (options: OpfsWorkerFilesystemOptions = {}): StorageFilesystemFactory =>
  (rootDir, context): StorageFilesystem => {
    const base = (options.base ?? createOpfsStorageFilesystem)(rootDir, context);
    const port = options.port ?? defaultStorageWorker();
    const openWrite = createWorkerOpenWrite(port);
    const precreateEntry = options.precreateEntry ?? defaultPrecreateEntry;
    const rootSegments = rootDir.split('/').filter(Boolean);

    return {
      lockBackend: base.lockBackend,
      ensureRoot: () => base.ensureRoot(),
      ensureDirectory: directoryPath => base.ensureDirectory(directoryPath),
      directoryExists: directoryPath => base.directoryExists(directoryPath),
      removeDirectory: directoryPath => base.removeDirectory(directoryPath),
      list: directoryPath => base.list(directoryPath),
      fileExists: filePath => base.fileExists(filePath),
      readBlob: filePath => base.readBlob(filePath),
      openRead: filePath => base.openRead(filePath),
      // 段列表以 rootDir 打头：worker 从 OPFS 根解析，与 base 的物理布局一致。
      // WebKit 只把**异步 API 创建的**条目登记进持久命名空间：worker 用 sync handle 在
      // 子目录里新建的文件条目对任何 fresh handle（连 worker 自己重新 getFileHandle 也是）
      // 都不可见 —— base 的读路径因此会抛 NotFoundError（AC#6 opfs 档实测）。写前由
      // 主线程先用异步 API 把条目建出来，worker 只负责往已存在的条目里写字节。
      openWrite: async filePath => {
        const segments = [...rootSegments, ...filePath.split('/').filter(Boolean)];
        await precreateEntry(segments);
        return openWrite(segments);
      },
      removeFile: filePath => base.removeFile(filePath),
      supportsFileMove: filePath => base.supportsFileMove(filePath),
      moveFile: (fromPath, toPath) => base.moveFile(fromPath, toPath),
      supportsDirectoryMove: directoryPath => base.supportsDirectoryMove(directoryPath),
      moveDirectory: (fromPath, toPath) => base.moveDirectory(fromPath, toPath),
      dispose: () => {
        base.dispose();
        port.terminate();
      }
    };
  };
