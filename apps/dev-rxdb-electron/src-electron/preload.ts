import { contextBridge, ipcRenderer } from 'electron';
// ELEC-15：preload 在 `sandbox: true` 下是**未 bundle** 的逐文件 tsc 产物，
// 不能对同目录文件做值导入（打包成 ASAR 后 `require("./ipc-contract")` 解析失败）。
// 类型导入会被擦除，常数字符串直接内联。
import type { ElectronAPI } from './ipc-contract';

/** `demo:run` 的 IPC 通道名，与 `ipc-contract.ts` 一一对应。见 ELEC-15。 */
const DEMO_RUN_CHANNEL = 'demo:run';

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

contextBridge.exposeInMainWorld('electron', electronAPI);
