/**
 * @fileoverview 主进程侧桌面 host 的合流入口：一条 IPC 通道，两族请求。
 *
 * @remarks
 * 三族（SQLite / 文件 / PGlite）共用一条通道而不是各开一条，是因为 preload 暴露的桥接方法名
 * 已被 e2e 的 `bridgeKeys` 断言冻结（恰为 `request` / `subscribe`），新开通道等于新增方法。
 *
 * 分派判据用协议包导出的 `isDesktopHostFileRequestKind` / `isDesktopPgliteRequestKind`，
 * 与各 host 内部认可的请求集合同源；在这里自己列一份 `kind` 名单必然随协议版本漂移，
 * 届时「通过分派的请求」与「host 认可的请求」就不再是同一个集合。
 *
 * 分派顺序上 SQLite 只能垫底，因为它是唯一的**兜底分支**：那边把「不是 open/close/version 的」
 * 一律当 `execute` 处理。所以漏判一族的后果不是报错，而是一条文件请求或 PGlite 请求
 * 被当成 SQL 跑一遍。
 *
 * @module desktop-host-bridge
 */

import {
  isDesktopHostFileRequestKind,
  type DesktopHostFileResponse,
  type DesktopHostResponse
} from '@aiao/rxdb-adapter-electron/host';
import { isDesktopPgliteRequestKind, type DesktopPgliteResponse } from '@aiao/rxdb-adapter-electron/pglite-host';
import { createDesktopFileBridge, type DesktopFileBridge, type DesktopFileEventTarget } from './desktop-file-bridge.js';
import {
  createDesktopPgliteBridge,
  createPgliteWorkerChannel,
  type DesktopPgliteBridge,
  type DesktopPgliteEventTarget
} from './desktop-pglite-bridge.js';
import {
  createDesktopSqliteBridge,
  type DesktopChangeEventTarget,
  type DesktopSqliteBridge
} from './desktop-sqlite-bridge.js';
import { isKnownDesktopHostRequestKind } from './desktop-host-request-guard.js';

// 两族的路径解析器一并转发出去：`main.ts` 只能 import 打包产物（ELEC-23），
// 而 esbuild 只把**本入口**的导出面留在产物里。不转发的话 `main.ts` 就得从 tsc 的
// 逐文件产物里取它们，那份产物在打包后的应用里 `require` 不到 node_modules。
export { createStorageRootResolver, DESKTOP_STORAGE_DIRECTORY } from './desktop-file-bridge.js';
export { DESKTOP_PGLITE_DIRECTORY, resolvePgliteDataRoot } from './desktop-pglite-bridge.js';
export { createDatabasePathResolver, DESKTOP_DATABASE_DIRECTORY } from './desktop-sqlite-bridge.js';

/** 同时充当三族会话归属者的窗口；真实 `WebContents` 结构上满足它。 */
export type DesktopHostEventTarget = DesktopChangeEventTarget & DesktopFileEventTarget & DesktopPgliteEventTarget;

/** {@link createDesktopHostBridge} 的入参。 */
export interface DesktopHostBridgeOptions {
  /** 把逻辑库名解析成物理绝对路径。 */
  readonly resolveDatabasePath: (databaseName: string) => string;
  /** 解析文件存储根。 */
  readonly resolveStorageRoot: () => string;
  /**
   * PGlite 数据根，通常来自 {@link resolvePgliteDataRoot}。
   *
   * @remarks
   * 传的是**根**而不是解析函数：具体数据目录名的校验与落盘发生在 worker 线程里，
   * 那边才拿得到名字。主线程这边只把根原样递过去。
   */
  readonly pgliteDataRoot: string;
  /**
   * PGlite worker 入口的绝对路径。
   *
   * @remarks
   * 由调用方给而不是在这里推：主进程代码打包后是另一份 esbuild 产物，
   * 路径关系与源码树不同（ELEC-23）。
   */
  readonly pgliteWorkerPath: string;
  /** 变更事件送达失败时的上报口。 */
  readonly onDeliveryError?: (error: unknown) => void;
}

/** 合流后的主进程 host。 */
export interface DesktopHostBridge {
  /**
   * 代表某个窗口处理一条请求。
   *
   * @remarks
   * **永不 reject**：两族 host 各自保证，本层只负责不自己引入抛点。
   *
   * @param target - 发起请求的窗口
   * @param request - 未经校验的请求负载
   * @returns 对应 host 的协议应答
   */
  handle(
    target: DesktopHostEventTarget,
    request: unknown
  ): Promise<DesktopHostResponse | DesktopHostFileResponse | DesktopPgliteResponse>;
  /**
   * 关闭某个窗口名下三族尚未关闭的全部会话。
   *
   * @remarks
   * 返回 Promise 而不是数字，是因为 PGlite 那族的回收隔着一条 worker 线程。调用点
   * （`webContents` 的 'destroyed' / 'render-process-gone'）本身不接受异步收尾，
   * 但**必须**给出这个句柄：挂起的事务独占着 PGlite 唯一实例的连接，
   * 退出路径上不等它落地，下一次关停就会跑在一个还没放手的连接上。
   *
   * @param target - 已销毁（或即将销毁）的窗口
   * @returns 本次关掉的会话总数
   */
  releaseTarget(target: DesktopHostEventTarget): Promise<number>;
  /** 三族当前打开的会话总数。 */
  readonly openSessionCount: number;
  /**
   * 关闭全部会话，应用退出前调用。
   *
   * @remarks
   * 必须等它落地：文件族的清理是异步的、PGlite 族还要终止一条 worker 线程，
   * 不等就等于没清 —— 进程先一步退了，或者干脆卡在一条永不结束的线程上。
   */
  closeAll(): Promise<void>;
}

/** 安全地取出 `kind`，负载不是对象时返回 `undefined`（由 host 去报 `protocol_violation`）。 */
const kindOf = (request: unknown): unknown =>
  typeof request === 'object' && request !== null ? (request as Record<string, unknown>)['kind'] : undefined;

/**
 * 创建合流后的主进程 host。
 *
 * @param options - 路径解析与错误上报
 * @returns 绑定了窗口归属的 host
 */
export function createDesktopHostBridge(options: DesktopHostBridgeOptions): DesktopHostBridge {
  const sqlite: DesktopSqliteBridge = createDesktopSqliteBridge({
    resolveDatabasePath: options.resolveDatabasePath,
    onDeliveryError: options.onDeliveryError
  });
  const file: DesktopFileBridge = createDesktopFileBridge({ resolveStorageRoot: options.resolveStorageRoot });
  const pglite: DesktopPgliteBridge = createDesktopPgliteBridge({
    // 通道工厂惰性调用：只用 SQLite 的会话不该付出启动一条线程 + 一份 PostgreSQL WASM 的代价。
    createChannel: () => createPgliteWorkerChannel(options.pgliteWorkerPath, options.pgliteDataRoot),
    onDeliveryError: options.onDeliveryError
  });

  return {
    handle: (target, request) => {
      // AC#50：分派前的显式拒绝。三族里 SQLite 是唯一兜底分支，未知 kind 会落进它的
      // execute 路径再被 parse 拒掉——结果一样，但「任何 host 被触碰之前就收口」让这道闸
      // 与 preload 内联副本、connector 授权构成三层，未知 kind 因此不可能被错当成一条 SQL。
      if (!isKnownDesktopHostRequestKind(request)) {
        return Promise.resolve({ kind: 'error', code: 'protocol_violation', message: 'unknown desktop host request kind' });
      }
      const kind = kindOf(request);
      if (isDesktopHostFileRequestKind(kind)) return file.handle(target, request);
      if (isDesktopPgliteRequestKind(kind)) return pglite.handle(target, request);
      return sqlite.handle(target, request);
    },

    releaseTarget: async target =>
      sqlite.releaseTarget(target) + file.releaseTarget(target) + (await pglite.releaseTarget(target)),

    get openSessionCount(): number {
      return sqlite.openSessionCount + file.openSessionCount + pglite.openSessionCount;
    },

    closeAll: async (): Promise<void> => {
      // finally 而不是 try/catch：关停在退出路径上，前一个 host 抛错不能让后面的漏关——
      // 文件 host 漏关会把未提交写入的临时文件留在磁盘上，PGlite 漏关会留一条不结束的线程。
      // 错误照抛，不吞。
      try {
        sqlite.closeAll();
      } finally {
        try {
          await file.closeAll();
        } finally {
          await pglite.closeAll();
        }
      }
    }
  };
}
