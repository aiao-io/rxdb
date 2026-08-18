/**
 * Tauri 适配器的选项形状。
 *
 * @module tauri-options.interface
 */

import type { DesktopHostTransport, DesktopOptions } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';

/**
 * Tauri 适配器选项。
 *
 * @remarks
 * 与共享的 {@link DesktopOptions} 只差一处：`transport` 是**必填**的。
 *
 * Electron 侧可以省略它，因为 preload 用 `contextBridge` 把传输层挂在了 renderer 的全局键上，
 * 适配器自己去取即可。Tauri 没有 preload 这一层——`invoke` / `listen` 是 renderer 直接 import
 * 的模块，那个全局键**永远不会**存在。若沿用可选签名，省略它的代价是运行期一句
 * `host_unavailable`，而且要等到第一次查询才炸；写成必填，同一个错误在编译期就现形。
 *
 * 显式注入还有第二个理由：US-505 要求 SQLite 与文件两族请求共用**同一条** transport，
 * 这样 host 侧的会话表才知道它们本属同一个窗口。适配器自建一条就没得共用了。
 */
export interface TauriOptions extends Omit<DesktopOptions, 'transport'> {
  /**
   * 与 Rust 宿主通信的传输层，通常由 {@link createTauriHostTransport} 建。
   *
   * @remarks
   * 包本身不依赖 `@tauri-apps/api`：`invoke` / `listen` 由应用注入，包保持运行时无关。
   */
  readonly transport: DesktopHostTransport;
}
