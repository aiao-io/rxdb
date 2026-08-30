/**
 * @fileoverview PGlite host 的 worker 线程实现：整个 host 连同 WASM 一起活在这里。
 *
 * @remarks
 * **为什么必须是 worker**（US-208 线 G 实验冻结的第三条实现约束）：PGlite 的 WASM 在
 * 调用线程上**同步**跑完整条查询。实验里一条 2 秒的查询把主进程堵了 2007 毫秒——窗口不重绘、
 * 菜单不响应、IPC 全排队。放在主进程里「持有单实例」（AC#7）与「主进程不能被堵住」这两条
 * 无法同时成立，所以单实例挪到一条自己的线程上，主进程只留一层转发。
 *
 * **为什么整个 host 都在这边**，而不是只把 PGlite 放过来：`ElectronPgliteRuntime.transaction`
 * 收的是一个回调，回调过不了线程边界（和它过不了 IPC 边界是同一个原因，也正是线 G 要解决的问题）。
 * 把 host 留在主线程就得再发明一次「跨边界挂起回调」的机关；把 host 搬过来，边界上流动的
 * 就只剩 `DesktopPgliteRequest` / `DesktopPgliteResponse` 这类纯数据。
 *
 * 本模块 import `@electric-sql/pglite`（几十兆 WASM），因此**只能**被 worker 入口加载，
 * 主线程侧请用 `./desktop-pglite-bridge.js`。
 *
 * @module desktop-pglite-worker
 */

import {
  assertValidDesktopDatabaseName,
  createElectronPgliteHost,
  type ElectronPgliteHost,
  type ElectronPgliteRuntime
} from '@aiao/rxdb-adapter-electron/pglite-host';
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import {
  DESKTOP_PGLITE_WORKER_ROLE,
  type DesktopPgliteWorkerCommand,
  type DesktopPgliteWorkerData,
  type DesktopPgliteWorkerMessage
} from './desktop-pglite-worker-protocol.js';

/**
 * worker 侧的消息端口。
 *
 * @remarks
 * 收窄成两个方法而不是直接写 `MessagePort`，为的是让线程边界可测：单测用一条真的
 * `MessageChannel` 把两端接起来，跑的就是**同一套结构化克隆**（AC#1 的判据正是逐值保真），
 * 而 `new Worker(...)` 找不找得到那份打包产物是另一件事，归 e2e 管。
 */
export interface DesktopPgliteWorkerPort {
  /** 向主线程投递一条消息。 */
  postMessage(message: DesktopPgliteWorkerMessage): void;
  /** 订阅主线程发来的指令。 */
  on(event: 'message', listener: (command: DesktopPgliteWorkerCommand) => void): void;
}

/**
 * 在给定数据根上创建 PGlite 运行时。
 *
 * @remarks
 * 目录名在协议层（`parseDesktopPgliteRequest`）已经校验过一次，这里落盘前再校验一次。
 * 不是冗余：协议校验管的是「renderer 发来的请求合法」，这里管的是「拼进 `join()` 的东西
 * 不会越出数据根」。漏一个 `../` 进来，数据目录的位置就由调用方而不是应用决定了。
 *
 * `mkdirSync` 放在校验**之后**——顺序反过来，一个非法名字也会先在磁盘上留下一个空目录。
 */
const createRuntime = async (dataRoot: string, dataDirectoryName: string): Promise<ElectronPgliteRuntime> => {
  assertValidDesktopDatabaseName(dataDirectoryName);
  mkdirSync(dataRoot, { recursive: true });
  return new PGlite(join(dataRoot, dataDirectoryName));
};

/**
 * 把一个 PGlite host 接到消息端口上。
 *
 * @remarks
 * 端点本身不持有状态：会话、实例、挂起事务全在 host 里；端点只负责把指令翻译成 host 调用，
 * 再把结果按 id 送回去。因此「worker 崩了」与「host 全丢了」是同一件事，主线程侧据此处理。
 *
 * @param port - 与主线程相连的消息端口
 * @param dataRoot - 解析数据目录用的物理根
 * @returns 端点持有的 host，便于调用方在同进程内做关停
 */
export function createPgliteWorkerEndpoint(port: DesktopPgliteWorkerPort, dataRoot: string): ElectronPgliteHost {
  const host = createElectronPgliteHost({
    createRuntime: dataDirectoryName => createRuntime(dataRoot, dataDirectoryName),
    postNotify: message => port.postMessage({ op: 'notify', message }),
    // worker 的 stderr 由父进程接管，这里 console 出去就是主进程的日志。
    onDeliveryError: error => console.error('[pglite-worker] failed to deliver a notification', error)
  });

  const run = async (command: DesktopPgliteWorkerCommand): Promise<unknown> => {
    switch (command.op) {
      case 'request':
        return host.handle(command.request, command.ownerId);
      case 'release':
        return host.releaseOwner(command.ownerId);
      case 'closeAll':
        return host.closeAll();
      default: {
        // 穷尽性检查：新增一种指令而这里忘了处理时，编译期就会报出来。
        const unexpected: never = command;
        throw new Error(`unknown pglite worker command: ${JSON.stringify(unexpected)}`);
      }
    }
  };

  port.on('message', command => {
    void run(command).then(
      value => port.postMessage({ id: command.id, ok: true, value }),
      (error: unknown) =>
        port.postMessage({ id: command.id, ok: false, message: error instanceof Error ? error.message : String(error) })
    );
  });

  return host;
}

/** 启动数据是不是给本 worker 的。 */
const isPgliteWorkerData = (value: unknown): value is DesktopPgliteWorkerData => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record['role'] === DESKTOP_PGLITE_WORKER_ROLE && typeof record['dataRoot'] === 'string';
};

// 自举：本模块既是 worker 入口，也被单测直接 import。用 `workerData` 的角色标记区分两者——
// 只判 `parentPort !== null` 会在 vitest 里成立（它的测试本身就跑在 worker 线程上），
// 于是一 import 就去接管了 vitest 自己的端口。
if (parentPort !== null && isPgliteWorkerData(workerData)) {
  createPgliteWorkerEndpoint(parentPort, workerData.dataRoot);
}
