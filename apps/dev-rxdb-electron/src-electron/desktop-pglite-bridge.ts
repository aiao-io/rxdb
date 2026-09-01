/**
 * @fileoverview 主进程侧 PGlite host 的接线：窗口归属记账 + 到 worker 线程的转发。
 *
 * @remarks
 * 结构与 `desktop-sqlite-bridge.ts` 逐条对应（归属表、越权拒绝、销毁竞态补判、退出前关停），
 * 差别只有两处，而且都来自「host 不在本线程」这一个事实：
 *
 * 1. 所有方法都是异步的——SQLite host 同步派发，PGlite host 隔着一条消息端口。
 * 2. `openSessionCount` 报的是**本表**的会话数，而不是 host 的。host 那份是权威值但取回来要
 *    一个来回，而这个 getter 的调用点（合流入口的同名 getter、退出前的关停检查）都要求同步。
 *    两者只在「应答在途」的那一拍里不同。
 *
 * 数据目录根与 SQLite 库目录、用户文件目录**三者互不相同**：PGlite 的数据目录是一棵会被整体
 * 删除/重建的树，混一层进去，一次重建就连带删掉另外两者。
 *
 * @module desktop-pglite-bridge
 */

import type { DesktopPgliteNotifyMessage, DesktopPgliteResponse } from '@aiao/rxdb-adapter-electron/pglite-host';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import {
  DESKTOP_PGLITE_WORKER_ROLE,
  isDesktopPgliteWorkerNotify,
  type DesktopPgliteWorkerCommand,
  type DesktopPgliteWorkerData,
  type DesktopPgliteWorkerMessage
} from './desktop-pglite-worker-protocol.js';
import { denyDestroyedTarget, denyForeignSession, readSessionId } from './desktop-session-ownership.js';
import { DESKTOP_HOST_CHANGE_CHANNEL } from './ipc-contract.js';

/**
 * PGlite 数据根在 `userData` 下的目录名。
 *
 * @remarks
 * 与 SQLite 侧同一条实测教训：**不能**叫 `databases`。Chromium 自己在 `userData` 下用着
 * 那个名字，启动时会清掉其中没在它的元数据里登记过的文件——而 PGlite 的数据目录整棵树
 * 在它眼里都是没登记过的。撞名的表征是「重启后数据没了」，且不报任何错。
 */
export const DESKTOP_PGLITE_DIRECTORY = 'rxdb-pglite';

/**
 * 把应用数据目录解析成 PGlite 数据根。
 *
 * @remarks
 * 只做拼接、不建目录：真正的落盘发生在 worker 里，那边拿得到具体的数据目录名，
 * 也才有校验它的依据。在这里提前 `mkdir` 只会让一个从未连过库的应用凭空多出一个空目录。
 *
 * @param userDataPath - `app.getPath('userData')`
 * @returns PGlite 数据根的绝对路径
 */
export function resolvePgliteDataRoot(userDataPath: string): string {
  return join(userDataPath, DESKTOP_PGLITE_DIRECTORY);
}

/**
 * 主线程侧的 worker 通道。
 *
 * @remarks
 * 真的 `node:worker_threads` `Worker` 结构上满足本接口。收窄成四个方法是为了让线程边界可测，
 * 理由见 `desktop-pglite-worker.ts` 的 `DesktopPgliteWorkerPort`。
 */
export interface DesktopPgliteWorkerChannel {
  /** 向 worker 投递一条指令。 */
  postMessage(command: DesktopPgliteWorkerCommand): void;
  /** 订阅 worker 发来的消息。 */
  on(event: 'message', listener: (message: DesktopPgliteWorkerMessage) => void): void;
  /**
   * 订阅 worker 的致命错误。
   *
   * @remarks
   * 用 `once` 而不是 `on`，既贴合语义（worker 出一次致命错误就没了），也避开了
   * `on` 的重载——一个接口里两个同名重载，实现方就没法用对象字面量写出来。
   */
  once(event: 'error', listener: (error: Error) => void): void;
  /** 终止 worker。 */
  terminate(): Promise<unknown>;
}

/**
 * 能接收 NOTIFY 的渲染进程窗口。
 *
 * @remarks
 * 比 SQLite 侧多一个 `id`：PGlite host 按**窗口**而不是按会话回收挂起的事务（AC#3），
 * 需要一个跨请求稳定、可比较的窗口身份。Electron 的 `WebContents.id` 正是如此，
 * 结构上直接满足。
 */
export interface DesktopPgliteEventTarget {
  /** 窗口身份，取 `WebContents.id`。 */
  readonly id: number;
  /** 窗口是否已被销毁。已销毁的窗口上调用 `send` 会抛。 */
  isDestroyed(): boolean;
  /** 向渲染进程推送一条消息。 */
  send(channel: string, message: DesktopPgliteNotifyMessage): void;
}

/** {@link createDesktopPgliteBridge} 的入参。 */
export interface DesktopPgliteBridgeOptions {
  /**
   * 创建（或重建）到 worker 的通道。
   *
   * @remarks
   * 惰性调用：一个从不连 PGlite 的会话不该付出启动一条线程 + 一份 WASM 的代价。
   */
  readonly createChannel: () => DesktopPgliteWorkerChannel;
  /** NOTIFY 送达失败时的上报口；窗口已销毁属于预期竞态，不会走这里。 */
  readonly onDeliveryError?: (error: unknown) => void;
}

/** 绑定了窗口归属的桌面 PGlite host。 */
export interface DesktopPgliteBridge {
  /**
   * 代表某个窗口处理一条请求。
   *
   * @remarks
   * 与两个兄弟 bridge 一样**永不 reject**：worker 侧的失败也会被翻译成 `kind: 'error'` 应答。
   *
   * @param target - 发起请求的窗口，`pg.open` 成功后即成为该会话 NOTIFY 的收件人
   * @param request - 未经校验的请求负载
   * @returns 协议应答
   */
  handle(target: DesktopPgliteEventTarget, request: unknown): Promise<DesktopPgliteResponse>;
  /**
   * 关闭某个窗口名下尚未关闭的全部会话，并回滚它挂起的事务。
   *
   * @remarks
   * 对 PGlite 来说这是**前提而不是收尾**（AC#3）：一条挂起的事务独占着那个唯一实例的连接，
   * 不回收的话下一个窗口连不上——表征是「打开第二个窗口后整个应用不响应」，而不是某次报错。
   *
   * @param target - 已销毁（或即将销毁）的窗口
   * @returns 本次关掉的会话数
   */
  releaseTarget(target: DesktopPgliteEventTarget): Promise<number>;
  /** 当前登记在册的会话数，用于诊断与关停检查。 */
  readonly openSessionCount: number;
  /** 关闭全部会话并终止 worker，应用退出前调用。 */
  closeAll(): Promise<void>;
}

/** 主线程侧待答复的指令。 */
interface PendingCommand {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

/**
 * worker 侧出岔子时的应答。
 *
 * @remarks
 * 恒为 `host_unavailable` 而不是 `host_internal_error`：走到这里说明**通道**没了或指令没答复，
 * 而不是 host 拒绝了某条请求（那种失败 host 自己会答出协议错误）。两者对 renderer 的含义
 * 完全不同——前者应当重连，后者应当放弃。
 */
const hostUnavailable = (error: unknown): DesktopPgliteResponse => ({
  kind: 'error',
  code: 'host_unavailable',
  message: error instanceof Error ? error.message : String(error)
});

/**
 * 用真的 worker 线程创建通道。
 *
 * @remarks
 * 入口路径由调用方给，而不是在这里从 `import.meta.url` 推：主进程代码在打包后是
 * 另一份 esbuild 产物，路径关系与源码树不同（见 ELEC-23）。
 *
 * @param workerPath - worker 入口的绝对路径
 * @param dataRoot - 解析数据目录用的物理根
 * @returns 与该 worker 相连的通道
 */
export function createPgliteWorkerChannel(workerPath: string, dataRoot: string): DesktopPgliteWorkerChannel {
  const data: DesktopPgliteWorkerData = { role: DESKTOP_PGLITE_WORKER_ROLE, dataRoot };
  const worker = new Worker(workerPath, { workerData: data });
  return {
    postMessage: command => worker.postMessage(command),
    on: (event, listener) => {
      worker.on(event, listener);
    },
    once: (event, listener) => {
      worker.once(event, listener);
    },
    terminate: () => worker.terminate()
  };
}

/**
 * 创建主进程侧的桌面 PGlite host 接线。
 *
 * @param options - 通道工厂与错误上报
 * @returns 绑定了窗口归属的 host
 */
export function createDesktopPgliteBridge(options: DesktopPgliteBridgeOptions): DesktopPgliteBridge {
  const targets = new Map<string, DesktopPgliteEventTarget>();
  const pending = new Map<number, PendingCommand>();
  let channel: DesktopPgliteWorkerChannel | undefined;
  let nextCommandId = 0;

  const deliverNotify = (message: DesktopPgliteNotifyMessage): void => {
    const target = targets.get(message.sessionId);
    // 窗口已经没了：NOTIFY 无处可送。这是常规竞态而不是失败。
    if (!target || target.isDestroyed()) return;
    try {
      // 与 SQLite 变更事件共用一条通道：preload 暴露的桥接方法名已被 e2e 冻结（恰为
      // `request` / `subscribe`），新开通道等于新增方法。renderer 侧按 `kind` 前缀分流。
      target.send(DESKTOP_HOST_CHANGE_CHANNEL, message);
    } catch (error) {
      options.onDeliveryError?.(error);
    }
  };

  const onMessage = (message: DesktopPgliteWorkerMessage): void => {
    if (isDesktopPgliteWorkerNotify(message)) {
      deliverNotify(message.message);
      return;
    }
    const slot = pending.get(message.id);
    // 已经被 abandonWorker 结算过：worker 死了之后又抖出来的迟到消息，丢掉即可。
    if (!slot) return;
    pending.delete(message.id);
    if (message.ok) slot.resolve(message.value);
    else slot.reject(new Error(message.message));
  };

  /**
   * worker 没了：结清在途请求，清空归属表。
   *
   * @remarks
   * 不在这里重启：下一次请求会经由 `requireChannel` 起一条新的，而新 worker 上没有任何会话，
   * renderer 拿到 `session_closed` 后按既有路径重连——与 host 重启走的是同一条路。
   * 在这里悄悄重启并假装什么都没发生，才是把「数据全丢了」藏起来。
   */
  const abandonWorker = (reason: Error): void => {
    channel = undefined;
    targets.clear();
    const inflight = [...pending.values()];
    pending.clear();
    for (const slot of inflight) slot.reject(reason);
  };

  const requireChannel = (): DesktopPgliteWorkerChannel => {
    if (channel) return channel;
    const created = options.createChannel();
    created.on('message', onMessage);
    created.once('error', error => abandonWorker(error));
    channel = created;
    return created;
  };

  const dispatch = (
    active: DesktopPgliteWorkerChannel,
    build: (id: number) => DesktopPgliteWorkerCommand
  ): Promise<unknown> =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++nextCommandId;
      pending.set(id, { resolve, reject });
      active.postMessage(build(id));
    });

  const send = (build: (id: number) => DesktopPgliteWorkerCommand): Promise<unknown> =>
    dispatch(requireChannel(), build);

  /** `pg.open` 成功后的归属登记；窗口已在这一拍里销毁则当场关掉会话。 */
  const registerSession = async (
    target: DesktopPgliteEventTarget,
    sessionId: string
  ): Promise<DesktopPgliteResponse | undefined> => {
    // 归属登记发生在应答之后，而回收扫的是登记表。两者撞在一起时回收先跑、看到的是一张
    // 还没有这条记录的表，随后的登记就把会话挂到了不会再有回收时机的窗口名下（见 denyDestroyedTarget）。
    if (!target.isDestroyed()) {
      targets.set(sessionId, target);
      return undefined;
    }
    await send(id => ({ id, op: 'request', request: { kind: 'pg.close', sessionId }, ownerId: target.id }));
    return denyDestroyedTarget(sessionId);
  };

  return {
    handle: async (target, request) => {
      // 会话 id 不是凭证：拿到别的窗口的 id 就能在它的库上跑任意 SQL、或直接把它关掉。
      const denial = denyForeignSession(targets, request, target);
      if (denial) return denial;

      let response: DesktopPgliteResponse;
      try {
        response = (await send(id => ({ id, op: 'request', request, ownerId: target.id }))) as DesktopPgliteResponse;
      } catch (error) {
        // worker 没了或指令本身崩了。host 的协议错误不会走到这里——那些是正常应答。
        return hostUnavailable(error);
      }

      if (response.kind === 'pg.open') {
        const rejected = await registerSession(target, response.result.sessionId);
        if (rejected) return rejected;
      }
      // 会话关掉了就销账。id 走 `readSessionId` 而不是断言：close 应答本身不带 id，
      // 只能回头读请求，而请求是 renderer 原文。
      if (response.kind === 'pg.close') {
        const sessionId = readSessionId(request);
        if (sessionId !== undefined) targets.delete(sessionId);
      }
      return response;
    },

    releaseTarget: async target => {
      const owned = [...targets].filter(([, owner]) => owner === target).map(([sessionId]) => sessionId);
      for (const sessionId of owned) targets.delete(sessionId);
      // worker 还没起过就没有可回收的东西，更不该为一次回收把它拉起来。
      if (channel === undefined) return owned.length;
      try {
        await send(id => ({ id, op: 'release', ownerId: target.id }));
      } catch (error) {
        // 回收失败只可能是 worker 已经没了，那它名下的一切本来就随之消失了。
        options.onDeliveryError?.(error);
      }
      return owned.length;
    },

    get openSessionCount(): number {
      return targets.size;
    },

    closeAll: async (): Promise<void> => {
      const active = channel;
      targets.clear();
      if (active === undefined) return;
      channel = undefined;
      try {
        await dispatch(active, id => ({ id, op: 'closeAll' }));
      } finally {
        // finally 而不是 catch：关停在退出路径上，前一步抛错不能让线程漏掉——
        // 漏掉的话进程会等在一条永不结束的 worker 上。
        pending.clear();
        await active.terminate();
      }
    }
  };
}
