/**
 * @fileoverview 主进程侧桌面 host 的合流入口：一条 IPC 通道，两族请求。
 *
 * @remarks
 * SQLite 与文件共用一条通道而不是各开一条，是因为 preload 暴露的桥接方法名已被
 * e2e 的 `bridgeKeys` 断言冻结（恰为 `request` / `subscribe`），新开通道等于新增方法。
 *
 * 分派判据用协议包导出的 `isDesktopHostFileRequestKind`，与 host 内部认可的请求集合同源；
 * 在这里自己列一份 `kind` 名单必然随协议版本漂移，届时「通过分派的请求」与
 * 「host 认可的请求」就不再是同一个集合。
 *
 * 分派若漏掉 `file.*`，请求会掉进 SQLite host —— 那里把「不是 open/close/version 的」
 * 一律当 `execute` 处理，于是一条文件请求会被当成 SQL 跑一遍。
 *
 * @module desktop-host-bridge
 */

import {
  isDesktopHostFileRequestKind,
  type DesktopHostFileResponse,
  type DesktopHostResponse
} from '@aiao/rxdb-adapter-desktop/host';
import {
  createDesktopFileBridge,
  type DesktopFileBridge,
  type DesktopFileEventTarget
} from './desktop-file-bridge.js';
import {
  createDesktopSqliteBridge,
  type DesktopChangeEventTarget,
  type DesktopSqliteBridge
} from './desktop-sqlite-bridge.js';

// 两族的路径解析器一并转发出去：`main.ts` 只能 import 打包产物（ELEC-23），
// 而 esbuild 只把**本入口**的导出面留在产物里。不转发的话 `main.ts` 就得从 tsc 的
// 逐文件产物里取它们，那份产物在打包后的应用里 `require` 不到 node_modules。
export { DESKTOP_STORAGE_DIRECTORY, createStorageRootResolver } from './desktop-file-bridge.js';
export { DESKTOP_DATABASE_DIRECTORY, createDatabasePathResolver } from './desktop-sqlite-bridge.js';

/** 同时充当两族会话归属者的窗口；真实 `WebContents` 结构上满足它。 */
export type DesktopHostEventTarget = DesktopChangeEventTarget & DesktopFileEventTarget;

/** {@link createDesktopHostBridge} 的入参。 */
export interface DesktopHostBridgeOptions {
  /** 把逻辑库名解析成物理绝对路径。 */
  readonly resolveDatabasePath: (databaseName: string) => string;
  /** 解析文件存储根。 */
  readonly resolveStorageRoot: () => string;
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
  handle(target: DesktopHostEventTarget, request: unknown): Promise<DesktopHostResponse | DesktopHostFileResponse>;
  /**
   * 关闭某个窗口名下两族尚未关闭的全部会话。
   *
   * @param target - 已销毁（或即将销毁）的窗口
   * @returns 本次关掉的会话总数
   */
  releaseTarget(target: DesktopHostEventTarget): number;
  /** 两族当前打开的会话总数。 */
  readonly openSessionCount: number;
  /** 关闭全部会话，应用退出前调用。 */
  closeAll(): void;
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

  return {
    handle: (target, request) =>
      isDesktopHostFileRequestKind(kindOf(request)) ? file.handle(target, request) : sqlite.handle(target, request),

    releaseTarget: target => sqlite.releaseTarget(target) + file.releaseTarget(target),

    get openSessionCount(): number {
      return sqlite.openSessionCount + file.openSessionCount;
    },

    closeAll: (): void => {
      // finally 而不是 try/catch：关停在退出路径上，前一个 host 抛错不能让后一个漏关——
      // 文件 host 漏关会把未提交写入的临时文件留在磁盘上。错误照抛，不吞。
      try {
        sqlite.closeAll();
      } finally {
        file.closeAll();
      }
    }
  };
}
