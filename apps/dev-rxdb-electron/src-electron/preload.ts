import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
// ELEC-15：preload 在 `sandbox: true` 下是**未 bundle** 的逐文件 tsc 产物，
// 不能对同目录文件做值导入（打包成 ASAR 后 `require("./ipc-contract")` 解析失败）。
// 类型导入会被擦除，常数字符串直接内联。
import type { DesktopHostBridge, ElectronAPI } from './ipc-contract';

/** `demo:run` 的 IPC 通道名，与 `ipc-contract.ts` 一一对应。见 ELEC-15。 */
const DEMO_RUN_CHANNEL = 'demo:run';

/** 桌面 SQLite host 的三个字面量，同样与 `ipc-contract.ts` 一一对应。见 ELEC-15。 */
const DESKTOP_HOST_REQUEST_CHANNEL = 'desktop-sqlite:request';
const DESKTOP_HOST_CHANGE_CHANNEL = 'desktop-sqlite:change';
const DESKTOP_HOST_BRIDGE_KEY = '__aiaoRxdbDesktopHost__';

/**
 * 三族 host 请求 kind 的闭集，与 `desktop-host-request-guard.ts` 逐字一致。
 *
 * 见 ELEC-15：preload 在 `sandbox: true` 下是未 bundle 的逐文件 tsc 产物，不能值导入
 * 同目录文件（`require("./desktop-host-request-guard")` 打进 ASAR 后解析失败），也不能
 * require 一个会被 electron-builder 从包里排除的 node_modules 包。所以这里的闸**逐字内联**，
 * 由 `desktop-host-request-guard.spec.ts` 把两份名单钉住，改协议 kind 时三处（协议包 / guard /
 * 这里）必须同步。
 *
 * AC#50：这是 connector / preload / host 三层校验里的**第二道**——只验 kind 是否在闭集内，
 * 挡的是「同源脚本绕过 connector 直接打桥」与「未知 kind 落进主进程 SQLite 兜底分支」。
 * 深层的路径 / 绑定值 / SQL 校验留在 host。
 */
const DESKTOP_HOST_REQUEST_KINDS: ReadonlySet<string> = new Set<string>([
  'handshake',
  'open',
  'execute',
  'version',
  'close',
  'file.open',
  'file.close',
  'file.stat',
  'file.list',
  'file.mkdir',
  'file.rmdir',
  'file.remove',
  'file.move',
  'file.read',
  'file.writeBegin',
  'file.writeChunk',
  'file.writeCommit',
  'file.writeAbort',
  'file.lockAcquire',
  'file.lockRelease',
  'pg.handshake',
  'pg.open',
  'pg.query',
  'pg.exec',
  'pg.begin',
  'pg.commit',
  'pg.rollback',
  'pg.version',
  'pg.close'
]);

/** 读请求的 `kind` 字段；形状不符时返回 `undefined`。 */
const requestKindOf = (payload: unknown): string | undefined => {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const kind = (payload as Record<string, unknown>)['kind'];
  return typeof kind === 'string' ? kind : undefined;
};

/**
 * 通过 `contextBridge` 暴露给渲染进程的 API 表，落在 `window.electron` 上。
 *
 * 这是 renderer 能触达主进程的**唯一**通道：`contextIsolation: true` +
 * `sandbox: true` 下渲染进程没有 Node 能力，凡是要新增的能力都必须
 * 先进 `ipc-contract.ts` 的类型、再在这里显式转发，不能整个暴露 `ipcRenderer`。
 */
const electronAPI: ElectronAPI = {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  runDemo: request => ipcRenderer.invoke(DEMO_RUN_CHANNEL, request)
};

/**
 * US-207：桌面 SQLite 适配器与主进程 host 之间的传输层。
 *
 * 单独挂一个全局而不是塞进 `window.electron`，是因为键名由适配器包定义
 * （`DESKTOP_HOST_TRANSPORT_KEY`）：它自己去 `globalThis` 上按名字找，
 * 不认识本应用的 API 表长什么样。
 *
 * 暴露面仍然只有两个方法，renderer 拿不到原始 `ipcRenderer`，
 * 也就无法向 `desktop-sqlite:request` 之外的任何通道发消息。
 */
const desktopHostBridge: DesktopHostBridge = {
  request: payload => {
    // AC#50：preload 的第二道闸。connector 在页内已做 capability × mutationPolicy 三层授权，
    // host 在特权侧做协议 / 会话归属 / 越界路径 / 脱敏；这里只验 kind 闭集，未知 kind 不再
    // 跨进 IPC 去撞主进程的 SQLite 兜底分支。拒绝应答不回显 `kind` 值——那可能是攻击者
    // 塞进来的任意文本，回显等于把它原样读回给渲染进程。
    const kind = requestKindOf(payload);
    if (kind === undefined || !DESKTOP_HOST_REQUEST_KINDS.has(kind)) {
      return Promise.resolve({ kind: 'error', code: 'protocol_violation', message: 'unknown desktop host request kind' });
    }
    return ipcRenderer.invoke(DESKTOP_HOST_REQUEST_CHANNEL, payload);
  },
  subscribe: listener => {
    // 只把消息本体转出去：`IpcRendererEvent` 带着 `sender`，交给 renderer 等于把通道能力一并送出。
    const forward = (_event: IpcRendererEvent, message: unknown): void => listener(message);
    ipcRenderer.on(DESKTOP_HOST_CHANGE_CHANNEL, forward);
    return () => {
      ipcRenderer.removeListener(DESKTOP_HOST_CHANGE_CHANNEL, forward);
    };
  }
};

contextBridge.exposeInMainWorld('electron', electronAPI);
contextBridge.exposeInMainWorld(DESKTOP_HOST_BRIDGE_KEY, desktopHostBridge);
