/**
 * 桌面 host 路由：把同一条 IPC 通道上的请求按 `kind` 分给 SQLite host 与文件 host。
 *
 * @remarks
 * 两个 host 共用一条通道而不是各开一条，是因为 preload 暴露的桥接方法名已被
 * `bridgeKeys` 断言冻结（恰为 `request` / `subscribe`），新增通道等于新增方法。
 *
 * 路由层**只看 `kind`**，不解析、不校验、不改写负载：校验归各 host 自己的信任边界，
 * 放在两处必然随版本漂移，届时通过路由层的请求与 host 认可的请求就不再是同一个集合。
 *
 * @module desktop-host-router
 */

import type { DesktopFileHost } from './desktop-file-host.js';
import {
  isDesktopHostFileRequestKind,
  type DesktopHostFileResponse,
  type DesktopHostResponse
} from './desktop-host-protocol.js';
import type { DesktopSqliteHost } from './desktop-sqlite-host.js';

/** {@link createDesktopHostRouter} 的入参。 */
export interface DesktopHostRouterOptions {
  /** SQLite host，接收所有非 `file.*` 请求。 */
  readonly sqlite: Pick<DesktopSqliteHost, 'handle' | 'closeAll'>;
  /** 文件 host，接收所有 `file.*` 请求。 */
  readonly file: Pick<DesktopFileHost, 'handle' | 'closeAll'>;
}

/** 合流后的 host 入口。 */
export interface DesktopHostRouter {
  /**
   * 处理一条来自 renderer 的请求。
   *
   * @remarks
   * **永不 reject**：这一点由下游两个 host 各自保证，路由层只负责不自己引入抛点——
   * 因此对非对象负载也只做取值判断，不做解构。
   *
   * @param request - 未经校验的请求负载
   * @returns 对应 host 的协议应答
   */
  handle(request: unknown): Promise<DesktopHostResponse | DesktopHostFileResponse>;
  /** 关停两个 host，通常在应用退出前调用。 */
  closeAll(): void;
}

/** 安全地取出 `kind`，负载不是对象时返回 `undefined`（由 host 去报 `protocol_violation`）。 */
const kindOf = (request: unknown): unknown =>
  typeof request === 'object' && request !== null ? (request as Record<string, unknown>)['kind'] : undefined;

/**
 * 创建 host 路由。
 *
 * @param options - 两个下游 host
 * @returns 可直接挂到 IPC 处理器上的路由
 */
export function createDesktopHostRouter(options: DesktopHostRouterOptions): DesktopHostRouter {
  const { sqlite, file } = options;

  return {
    handle(request: unknown): Promise<DesktopHostResponse | DesktopHostFileResponse> {
      return isDesktopHostFileRequestKind(kindOf(request)) ? file.handle(request) : sqlite.handle(request);
    },
    closeAll(): void {
      // finally 而不是 try/catch：关停发生在退出路径上，前一个 host 抛错不能让后一个漏关——
      // 文件 host 漏关会把未提交写入的临时文件留在磁盘上。错误照抛，不吞。
      try {
        sqlite.closeAll();
      } finally {
        file.closeAll();
      }
    }
  };
}
