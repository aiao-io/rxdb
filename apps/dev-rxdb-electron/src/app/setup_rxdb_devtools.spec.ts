/**
 * Electron 渲染进程侧 DevTools provider 装配（US-908 AC#2）。
 *
 * @remarks
 * 只验装配层的一件事：**主窗口刷新时 host 文件会话被释放**。它与 RxDB 无关，却只会以
 * 「用过一阵子之后上传卡住」的形态暴露——泄掉的会话还攥着路径锁，而那把锁没有超时能解开。
 *
 * 判据取 host 侧的 `openSessionCount`，而不是「`dispose()` 被调用过」：后者在「调了但 host
 * 没释放」的实现下同样成立。因此这里接的是**真** `createDesktopFileBridge`——它刻意不 import
 * `electron`（见该模块的 fileoverview），于是整条会话生命周期能在 vitest 里用真实文件系统驱动。
 *
 * 跨进程边界的 import 是有意的：要验的正是 renderer 的装配与主进程 host 合起来的行为，
 * 两边各测各的就恰好漏掉这条缝。
 */
import type { DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDesktopFileBridge,
  createStorageRootResolver,
  DESKTOP_STORAGE_DIRECTORY,
  type DesktopFileBridge,
  type DesktopFileEventTarget
} from '../../src-electron/desktop-file-bridge';
import { createDesktopDevToolsProviders, DESKTOP_STORAGE_ROOT_DIR } from './setup_rxdb_desktop';

/** 快照用不到的 storage 桩：本文件的用例都不触发 capture。 */
const neverCalledStorage = (): never => {
  throw new Error('storage MUST NOT be read at assembly time');
};

/**
 * 窗口替身。
 *
 * @remarks
 * 全程**同一个**：刷新用的就是同一个 `WebContents`，`main.ts` 挂在它 `'destroyed'` 上的
 * `releaseTarget` 一次都不会跑。换一个替身等于把窗口销毁也一并模拟了，而那条路本来就没问题。
 */
const WINDOW: DesktopFileEventTarget = { isDestroyed: () => false };

/** 跳过一整轮宏任务，让 `dispose()` 那条 fire-and-forget 的 `file.close` 真正送达。 */
function macrotask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * 给 node 环境装上页面生命周期事件源。
 *
 * @remarks
 * 本项目的 vitest 跑在 `environment: 'node'` 下，而 node 的 `globalThis` 不是 `EventTarget`
 * ——`addEventListener` 根本不存在。装配层用的是浏览器的那一个，这里把它补上。
 *
 * 一个事件源贯穿整条用例即可：装配层挂的是 `{ once: true }`，每一页的监听器只会响一次并自摘，
 * 因此任一时刻至多有当前这一页的监听器在——与真实刷新一致。
 *
 * @returns 触发一次 `pagehide`（即模拟刷新）的函数
 */
function installPageLifecycle(): () => void {
  const lifecycle = new EventTarget();
  Object.assign(globalThis, {
    addEventListener: lifecycle.addEventListener.bind(lifecycle),
    removeEventListener: lifecycle.removeEventListener.bind(lifecycle),
    dispatchEvent: lifecycle.dispatchEvent.bind(lifecycle)
  });
  return () => void lifecycle.dispatchEvent(new Event('pagehide'));
}

describe('createDesktopDevToolsProviders', () => {
  let workspace: string;
  let bridge: DesktopFileBridge;
  let refresh: () => void;

  /** 把 renderer 的 `file.*` 请求直接喂给主进程 host，代表同一个窗口。 */
  const transport: DesktopHostTransport = {
    request: payload => bridge.handle(WINDOW, payload),
    subscribe: () => () => undefined
  };

  /** 装配一次 provider 并让它真的开出一条 host 会话（会话是惰性开的）。 */
  const loadPage = async (): Promise<void> => {
    const providers = createDesktopDevToolsProviders({ transport, getStorage: neverCalledStorage });
    await providers.nativeFiles.filesystem.list([]);
  };

  beforeEach(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'electron-devtools-providers-'));
    // 真实运行里这层由 storage 插件建出来（`rootDir` 同一个常量）；这里没有 RxDB，自己补上，
    // 否则 `list([])` 会以 ENOENT 失败，测到的就不是会话生命周期了。
    mkdirSync(join(workspace, DESKTOP_STORAGE_DIRECTORY, DESKTOP_STORAGE_ROOT_DIR), { recursive: true });
    bridge = createDesktopFileBridge({ resolveStorageRoot: createStorageRootResolver(workspace) });
    await bridge.whenSwept;
    refresh = installPageLifecycle();
  });

  afterEach(async () => {
    await bridge.closeAll();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('刷新主窗口时释放 host 文件会话，会话数不随刷新增长（US-908 AC#2）', async () => {
    await loadPage();
    expect(bridge.openSessionCount, '第一次装配没有开出 host 会话，后面的断言就无从证伪').toBe(1);

    for (let index = 1; index <= 3; index += 1) {
      refresh();
      await macrotask();
      await loadPage();
      // 刷新既不触发 `webContents` 的 'destroyed'（同一个 WebContents），也没有别的回收时机：
      // 少了 `pagehide → dispose()`，每刷一次就多攥住一条会话和它持有的路径锁。
      expect(bridge.openSessionCount, `刷新 ${index} 次后 host 会话数涨了`).toBe(1);
    }
  });

  it('与 storage 插件共用同一个逻辑根', () => {
    // 两边各写一个字面量的话，面板与应用会看着两个同名却不同的目录。
    expect(DESKTOP_STORAGE_ROOT_DIR).toBe('files');
  });

  it('装配时不读 storage：快照来源延迟到 capture 那一刻', () => {
    // `rxdb.storage` 要等 `connect()` 才挂上。装配期就读的话，快照拿到的是一个还没连上的
    // storage——而那条错误只会在有人翻诊断快照时才出现。`neverCalledStorage` 一被调用就抛。
    expect(() => createDesktopDevToolsProviders({ transport, getStorage: neverCalledStorage })).not.toThrow();
  });
});
