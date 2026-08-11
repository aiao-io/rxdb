import type { ElectronAPI } from '../src-electron/ipc-contract';

declare global {
  interface Window {
    /**
     * 由 preload 的 `contextBridge` 注入。
     *
     * @remarks
     * ELEC-06：**必须可选** —— 应用同时支持浏览器分支
     * （`home.page.html` 有「⚠️ 运行在浏览器环境」的 `@else`），
     * 此时 preload 根本没跑过，`window.electron` 不存在。
     * 早先声明为必填属于类型欺骗：`window.electron.runDemo(...)` 能通过编译、运行时直接崩。
     */
    electron?: ElectronAPI;
  }
}

export { };

