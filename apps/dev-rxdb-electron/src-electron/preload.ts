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
  request: payload => ipcRenderer.invoke(DESKTOP_HOST_REQUEST_CHANNEL, payload),
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
