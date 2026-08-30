/**
 * @fileoverview 主进程 ↔ PGlite worker 线程之间的消息契约。
 *
 * @remarks
 * 单独一个模块而不是并进 worker 实现，为的是**依赖方向**：主线程侧的 bridge 只需要这份契约，
 * 而 worker 实现 import 了 `@electric-sql/pglite`。合并的话，bridge 会把整个 PostgreSQL WASM
 * 拉进主进程 bundle —— 那正好是本故事要避免的事（AC#7 要求 WASM 只活在 worker 里）。
 *
 * 这一层刻意**只搬数据**：`DesktopPgliteRequest` / `DesktopPgliteResponse` 本身已经是
 * 结构化克隆搬得动的形状（协议模块的既有约束），所以 worker 边界不需要额外的序列化。
 * 反过来，`ElectronPgliteRuntime.transaction(callback)` 这类带回调的接口**过不去**线程边界，
 * 因此整个 `ElectronPgliteHost` 连同它挂起回调的那套机关都留在 worker 里，主线程只做转发。
 *
 * @module desktop-pglite-worker-protocol
 */

import type { DesktopPgliteNotifyMessage } from '@aiao/rxdb-adapter-electron/pglite-host';

/**
 * worker 启动数据里的角色标记。
 *
 * @remarks
 * worker 实现模块在被 import 时会检查 `workerData`，符合本角色才自举成端点。
 * 只判 `parentPort !== null` 是不够的：vitest 默认就把测试跑在 worker 线程里，
 * 那样一 import 这个模块就会去劫持 vitest 自己的 `parentPort`。
 */
export const DESKTOP_PGLITE_WORKER_ROLE = 'aiao-rxdb-pglite-host';

/** worker 的启动数据。 */
export interface DesktopPgliteWorkerData {
  /** 恒为 {@link DESKTOP_PGLITE_WORKER_ROLE}。 */
  readonly role: string;
  /** 解析数据目录用的物理根，由主进程从 `app.getPath('userData')` 算出。 */
  readonly dataRoot: string;
}

/** 主线程发给 worker 的指令。 */
export type DesktopPgliteWorkerCommand =
  /** 转发一条 renderer 请求；`ownerId` 是 `webContents.id`。 */
  | { readonly id: number; readonly op: 'request'; readonly request: unknown; readonly ownerId: number }
  /** 回收某个窗口名下的全部会话（含回滚它挂起的事务）。 */
  | { readonly id: number; readonly op: 'release'; readonly ownerId: number }
  /** 关停全部会话与实例，应用退出前调用。 */
  | { readonly id: number; readonly op: 'closeAll' };

/** worker 回给主线程的消息。 */
export type DesktopPgliteWorkerMessage =
  /** 某条指令的结果；`value` 的具体类型由 `op` 决定，主线程按发出的指令自行收窄。 */
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  /**
   * 某条指令**自身**失败。
   *
   * @remarks
   * 与协议里的 `{ kind: 'error' }` 应答不是一回事：那种失败是 host 正常答出来的，
   * 走 `ok: true`。走到这里说明 worker 侧出了协议之外的岔子（host 抛了、克隆失败了），
   * 主线程据此报 `host_internal_error`，而不是把它伪装成一条业务错误。
   */
  | { readonly id: number; readonly ok: false; readonly message: string }
  /** host 主动推来的 NOTIFY，没有对应的指令 id。 */
  | { readonly op: 'notify'; readonly message: DesktopPgliteNotifyMessage };

/**
 * 判断一条 worker 消息是不是主动推送。
 *
 * @param message - worker 发来的消息
 * @returns 是 NOTIFY 推送则为真
 */
export function isDesktopPgliteWorkerNotify(
  message: DesktopPgliteWorkerMessage
): message is { readonly op: 'notify'; readonly message: DesktopPgliteNotifyMessage } {
  return 'op' in message && message.op === 'notify';
}
