/**
 * US-208 线 G：对照实验的 preload。
 *
 * 与生产 preload（`apps/dev-rxdb-electron/src-electron/preload.ts`）遵守同一条边界：
 * `contextIsolation: true` + `sandbox: true`，渲染进程只拿到三个具名方法，
 * 拿不到原始 `ipcRenderer`，也就发不了实验通道之外的任何消息。
 *
 * 这不是形式主义 —— 本实验要量的是**真实 `ipcRenderer.invoke` 的 structured clone 行为**
 * （bigint / Uint8Array / Date 逐值保真）。放宽隔离会换掉序列化路径，量出来的数就不作数了。
 *
 * CommonJS（`.cjs`）是硬要求：`sandbox: true` 下的 preload 由 Electron 以 CJS 加载，
 * ESM 会以 "Cannot use import statement outside a module" 直接失败，而报错只出现在
 * 渲染进程 console —— 主进程那侧看到的只是「桥接没挂上」。
 */

const { contextBridge, ipcRenderer } = require('electron');

/** 两条请求通道与一条事件通道，与 `probe.mjs` 里的字面量一一对应。 */
const CHANNEL_A = 'pglite-tx-experiment:a';
const CHANNEL_B = 'pglite-tx-experiment:b';
const CHANNEL_EVENT = 'pglite-tx-experiment:event';

contextBridge.exposeInMainWorld('__txExperiment', {
  /** 方案 A：低层 `begin` / `exec` / `commit` / `rollback`。 */
  invokeA: payload => ipcRenderer.invoke(CHANNEL_A, payload),
  /** 方案 B：高层「跑名为 X 的那件事」。 */
  invokeB: payload => ipcRenderer.invoke(CHANNEL_B, payload),
  /** 主进程转发的 PG 变更通知。只转消息体，不把 `IpcRendererEvent`（带 `sender`）交出去。 */
  onEvent: listener => {
    ipcRenderer.on(CHANNEL_EVENT, (_event, message) => listener(message));
  }
});
