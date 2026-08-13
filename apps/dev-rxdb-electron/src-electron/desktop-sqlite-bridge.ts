/**
 * @fileoverview US-207：主进程侧的桌面 SQLite host 接线。
 *
 * @remarks
 * `@aiao/rxdb-adapter-desktop/host` 负责协议校验与 `node:sqlite` 连接，本文件只补它
 * 刻意不管的那两件事——库文件放在哪，以及变更事件该送给哪个窗口。这两件事都只有宿主应用知道。
 *
 * 本文件不 import `electron`：窗口在这里被收窄成 {@link DesktopChangeEventTarget}，
 * 于是整条会话生命周期能在 vitest 里用真实 `node:sqlite` 驱动，不必启动一个 Electron。
 * 真正的 `ipcMain` / `BrowserWindow` 接线留在 `main.ts`。
 *
 * @module desktop-sqlite-bridge
 */

import {
  assertValidDesktopDatabaseName,
  createDesktopSqliteHost,
  type DesktopHostChangeEventMessage,
  type DesktopHostResponse
} from '@aiao/rxdb-adapter-desktop/host';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DESKTOP_HOST_CHANGE_CHANNEL } from './ipc-contract';

/**
 * 库文件在应用数据目录下的子目录名。
 *
 * @remarks
 * 单独一层而不是直接铺在 `userData` 根下：那里还躺着 Chromium 的 Cache、Local Storage 等一堆东西，
 * 混在一起时「哪些文件是应用数据」这个问题没法回答，备份和迁移也就无从下手。
 */
export const DESKTOP_DATABASE_DIRECTORY = 'databases';

/**
 * 造一个把逻辑库名解析成绝对路径的函数。
 *
 * @param userDataPath - 应用数据目录，Electron 下即 `app.getPath('userData')`
 * @returns 供 host 使用的路径解析函数；调用时按需创建库目录
 */
export function createDatabasePathResolver(userDataPath: string): (databaseName: string) => string {
  const root = join(userDataPath, DESKTOP_DATABASE_DIRECTORY);
  return databaseName => {
    // 名字来自 renderer。host 已经校验过一遍，这里是落盘前的最后一道：
    // 漏一个 `../` 进 join()，写入位置就由调用方而不是应用决定了（AC#3）。
    // 校验必须在 mkdir 之前 —— 非法入参不该在磁盘上留下任何痕迹。
    assertValidDesktopDatabaseName(databaseName);
    mkdirSync(root, { recursive: true });
    return join(root, databaseName);
  };
}

/**
 * 能接收变更事件的渲染进程窗口。
 *
 * @remarks
 * Electron 的 `WebContents` 结构上满足本接口，直接传即可。收窄成两个方法是为了让
 * 会话与窗口的绑定关系可测：真的 `WebContents` 要先有一个真的窗口才构造得出来。
 */
export interface DesktopChangeEventTarget {
  /** 窗口是否已被销毁。已销毁的窗口上调用 `send` 会抛。 */
  isDestroyed(): boolean;
  /** 向渲染进程推送一条消息。 */
  send(channel: string, message: DesktopHostChangeEventMessage): void;
}

/** {@link createDesktopSqliteBridge} 的入参。 */
export interface DesktopSqliteBridgeOptions {
  /** 把逻辑库名解析成物理绝对路径，通常来自 {@link createDatabasePathResolver}。 */
  readonly resolveDatabasePath: (databaseName: string) => string;
  /** 变更事件送达失败时的上报口；窗口已销毁属于预期竞态，不会走这里。 */
  readonly onDeliveryError?: (error: unknown) => void;
}

/** 绑定了窗口归属的桌面 SQLite host。 */
export interface DesktopSqliteBridge {
  /**
   * 代表某个窗口处理一条请求。
   *
   * @remarks
   * 与 host 的 `handle` 一样**永不 reject**：失败以 `kind: 'error'` 的应答返回。
   *
   * @param target - 发起请求的窗口，`open` 成功后即成为该会话变更事件的收件人
   * @param request - 未经校验的请求负载
   * @returns 协议应答
   */
  handle(target: DesktopChangeEventTarget, request: unknown): Promise<DesktopHostResponse>;
  /**
   * 关闭某个窗口名下尚未关闭的全部会话。
   *
   * @param target - 已销毁（或即将销毁）的窗口
   * @returns 本次关掉的会话数；正常 `disconnect()` 过的窗口是 0
   */
  releaseTarget(target: DesktopChangeEventTarget): number;
  /** 当前打开的会话数，用于诊断与关停检查。 */
  readonly openSessionCount: number;
  /** 关闭全部会话，应用退出前调用。 */
  closeAll(): void;
}

/**
 * 创建主进程侧的桌面 SQLite host。
 *
 * @param options - 路径解析与错误上报
 * @returns 绑定了窗口归属的 host
 */
export function createDesktopSqliteBridge(options: DesktopSqliteBridgeOptions): DesktopSqliteBridge {
  const targets = new Map<string, DesktopChangeEventTarget>();

  const host = createDesktopSqliteHost({
    resolveDatabasePath: options.resolveDatabasePath,
    postChange: message => {
      const target = targets.get(message.sessionId);
      // 窗口已经没了：写入早已落库，事件无处可送。这是常规竞态而不是失败，
      // 往一个已销毁的 webContents 上 send 只会白抛一个异常出来。
      if (!target || target.isDestroyed()) return;
      target.send(DESKTOP_HOST_CHANGE_CHANNEL, message);
    },
    onDeliveryError: options.onDeliveryError
  });

  return {
    handle: async (target, request) => {
      const response = await host.handle(request);
      if (response.kind === 'open') targets.set(response.result.sessionId, target);
      // 能拿到 close 应答就说明请求过了协议校验，`sessionId` 一定是个字符串。
      if (response.kind === 'close') targets.delete((request as { sessionId: string }).sessionId);
      return response;
    },

    releaseTarget: target => {
      const owned = [...targets].filter(([, owner]) => owner === target).map(([sessionId]) => sessionId);
      for (const sessionId of owned) {
        targets.delete(sessionId);
        // host 的 handle 同步派发且永不 reject，因此这里不必也无从 await——
        // 调用点是 `webContents` 的 'destroyed' 事件，本身就不接受异步收尾。
        void host.handle({ kind: 'close', sessionId });
      }
      return owned.length;
    },

    get openSessionCount(): number {
      return host.openSessionCount;
    },

    closeAll: (): void => {
      targets.clear();
      host.closeAll();
    }
  };
}
