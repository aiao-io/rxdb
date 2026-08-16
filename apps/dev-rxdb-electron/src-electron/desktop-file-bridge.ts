/**
 * @fileoverview US-504：主进程侧的桌面文件 host 接线。
 *
 * @remarks
 * 与 {@link module:desktop-sqlite-bridge} 分工一致：`@aiao/rxdb-adapter-desktop/host`
 * 负责协议校验、原子提交与锁仲裁，本文件只补它刻意不管的两件事——文件根放在哪，
 * 以及某个窗口消失时该回收哪些会话。这两件事都只有宿主应用知道。
 *
 * 本文件不 import `electron`：窗口在这里被收窄成 {@link DesktopFileEventTarget}，
 * 于是会话生命周期能在 vitest 里用真实文件系统驱动，不必启动一个 Electron。
 *
 * @module desktop-file-bridge
 */

import { createDesktopFileHost, type DesktopHostFileResponse } from '@aiao/rxdb-adapter-desktop/host';
import { mkdirSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 文件内容在应用数据目录下的子目录名。
 *
 * @remarks
 * 与 `DESKTOP_DATABASE_DIRECTORY` 同级而不是套在它里面：两者的生命周期不同，
 * 库可以整个删掉重建而文件不该跟着没，分开放才回答得了「库多大」「文件多大」。
 *
 * 名字同样**不能**撞上 Chromium 在 userData 下自用的目录（`File System`、`databases`…）——
 * 它的存储层启动时会把目录里没有登记过的文件全部删掉，而我们的文件正是「没登记过的」，
 * 全程没有任何报错。改动前先看 `desktop-file-bridge.spec.ts` 的
 * 「文件目录名不与 Chromium 在 userData 下自用的目录重名」那条 —— 撞名单即红。
 */
export const DESKTOP_STORAGE_DIRECTORY = 'rxdb-files';

/**
 * 造一个解析文件存储根的函数。
 *
 * @remarks
 * 返回的是函数而不是路径字符串：Electron 下 `app.getPath('userData')` 在 `app.ready`
 * 之前拿不到，提前求值会把「还没准备好」永久固化成一个错的根。
 *
 * @param userDataPath - 应用数据目录，Electron 下即 `app.getPath('userData')`
 * @returns 供 host 使用的根解析函数；调用时按需创建目录
 */
export function createStorageRootResolver(userDataPath: string): () => string {
  const root = join(userDataPath, DESKTOP_STORAGE_DIRECTORY);
  return () => {
    mkdirSync(root, { recursive: true });
    return root;
  };
}

/**
 * 能持有文件会话的渲染进程窗口。
 *
 * @remarks
 * 文件族没有主动推送，因此这里只需要一个身份标识；沿用 `isDestroyed()` 是为了与
 * SQLite 侧的 `DesktopChangeEventTarget` 结构相容，两边可以传同一个 `WebContents`。
 */
export interface DesktopFileEventTarget {
  /** 窗口是否已被销毁。 */
  isDestroyed(): boolean;
}

/** {@link createDesktopFileBridge} 的入参。 */
export interface DesktopFileBridgeOptions {
  /** 解析文件存储根，通常来自 {@link createStorageRootResolver}。 */
  readonly resolveStorageRoot: () => string;
}

/** 绑定了窗口归属的桌面文件 host。 */
export interface DesktopFileBridge {
  /**
   * 代表某个窗口处理一条文件请求。
   *
   * @remarks
   * 与 host 的 `handle` 一样**永不 reject**：失败以 `kind: 'error'` 的应答返回。
   *
   * @param target - 发起请求的窗口，`file.open` 成功后即成为该会话的归属者
   * @param request - 未经校验的请求负载
   * @returns 协议应答
   */
  handle(target: DesktopFileEventTarget, request: unknown): Promise<DesktopHostFileResponse>;
  /**
   * 关闭某个窗口名下尚未关闭的全部会话。
   *
   * @remarks
   * 会话一关，host 就会中止它名下未提交的写入（删掉临时文件）并释放它持有的全部锁。
   * 少了这一步，窗口崩溃会在磁盘上留下临时文件，并让别的窗口永远等在一把没人放的锁上。
   *
   * @param target - 已销毁（或即将销毁）的窗口
   * @returns 本次关掉的会话数；正常 `file.close` 过的窗口是 0
   */
  releaseTarget(target: DesktopFileEventTarget): number;
  /** 当前打开的会话数，用于诊断与关停检查。 */
  readonly openSessionCount: number;
  /**
   * 启动清扫的完成信号。
   *
   * @remarks
   * 清扫在后台跑，因此它不挡任何请求；暴露出来只为让测试与关停检查有个确定的等待点。
   * 失败不会 reject —— 见 {@link createDesktopFileBridge}。
   */
  readonly whenSwept: Promise<void>;
  /**
   * 关闭全部会话，应用退出前调用。
   *
   * @remarks
   * 必须等它落地：清理是异步的，不等就等于没清 —— 进程先一步退了。
   */
  closeAll(): Promise<void>;
}

/** 未提交写入在磁盘上的临时文件后缀，与 host 的 `.${writeId}.rxdb-tmp` 命名一致。 */
const TEMPORARY_SUFFIX = '.rxdb-tmp';

/**
 * 清掉上一轮进程留下的临时文件。
 *
 * @remarks
 * `closeAll` 只覆盖体面退出。进程被 SIGKILL、掉电、或渲染进程连主进程一起拖崩时，
 * 没有任何收尾代码跑得到，临时文件就永久留在磁盘上 —— 一次崩溃一份，只增不减。
 * 因此回收点放在启动：此刻还没有任何会话，根目录下带该后缀的文件必然是上一轮的遗留。
 *
 * 前提是本应用独占这个根。这在 Electron 下成立（根在自己的 userData 下），
 * 万一有第二个实例在同时写，被删掉的临时文件会让它的 commit 以 `file_not_found` 失败 ——
 * 是一个**报出来的**错误，而不是静默的坏数据。
 */
const sweepTemporaryFiles = async (directory: string): Promise<void> => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await sweepTemporaryFiles(path);
    } else if (entry.name.endsWith(TEMPORARY_SUFFIX)) {
      await rm(path, { force: true });
    }
  }
};

/**
 * 创建主进程侧的桌面文件 host。
 *
 * @param options - 存储根解析
 * @returns 绑定了窗口归属的 host
 */
export function createDesktopFileBridge(options: DesktopFileBridgeOptions): DesktopFileBridge {
  const targets = new Map<string, DesktopFileEventTarget>();
  const host = createDesktopFileHost({ resolveStorageRoot: options.resolveStorageRoot });
  // 清扫失败只记一笔：它是一次垃圾回收，不是功能路径。让它把 bridge 的创建带崩，
  // 等于一个没人读的临时文件就能让应用打不开自己的文件。
  const whenSwept = sweepTemporaryFiles(options.resolveStorageRoot()).catch((error: unknown) => {
    console.error('[dev-rxdb-electron] 清理上一轮残留的临时文件失败：', error);
  });

  return {
    whenSwept,

    handle: async (target, request) => {
      const response = await host.handle(request);
      if (response.kind === 'file.open') targets.set(response.result.sessionId, target);
      // 能拿到 file.close 应答就说明请求过了协议校验，`sessionId` 一定是个字符串。
      if (response.kind === 'file.close') targets.delete((request as { sessionId: string }).sessionId);
      return response;
    },

    releaseTarget: target => {
      const owned = [...targets].filter(([, owner]) => owner === target).map(([sessionId]) => sessionId);
      for (const sessionId of owned) {
        targets.delete(sessionId);
        // 调用点是 `webContents` 的 'destroyed' 事件，本身就不接受异步收尾；
        // host 的 handle 永不 reject，因此这里不必也无从 await。
        void host.handle({ kind: 'file.close', sessionId });
      }
      return owned.length;
    },

    get openSessionCount(): number {
      return host.openSessionCount;
    },

    closeAll: async (): Promise<void> => {
      targets.clear();
      await host.closeAll();
    }
  };
}
