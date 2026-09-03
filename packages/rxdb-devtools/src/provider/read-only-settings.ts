/**
 * @fileoverview 只读 `settings` provider 的共享实现（US-904 AC#43 / AC#49）。
 *
 * @remarks
 * 浏览器与 Electron 两端的 `settings` 只在 descriptor 上不同（`kind` 与 `runtime`），
 * 行为上要求一模一样：`export` 恒回 `export_unsupported`，未声明的操作回 `provider_unsupported`，
 * 而且**两者都必须在任何 host 侧动作之前返回**。
 *
 * 抽成一份不是为了省几行：两份各自维护的实现只要有一份先取了根目录再判不支持，
 * 「零 OPFS / SQLite / WAL 读取」这条判据在那一端就退化成「恰好没读」。共享一份之后，
 * 这条性质由**结构**保证——工厂里根本没有可以读取任何东西的入口。
 *
 * 工厂本身对外导出，descriptor 由调用方给：宿主可能在这两端之外（如 Tauri 的 wa-sqlite
 * 预览按真实选中的 VFS 得出 `kind: opfs | idb`），需要的是同一份行为配自己的 descriptor。
 * 反过来把 `export_unsupported` 的语义在宿主侧再写一遍，就等于多一个会漂移的副本。
 *
 * @module @aiao/rxdb-devtools/provider/read-only-settings
 */

import { createProviderError } from '../v2/error-mapping.js';
import type { DevToolsProviderDescriptor } from './descriptor.js';
import type { DevToolsProvider } from './types.js';

/**
 * 用给定 descriptor 建一个只读 `settings` provider。
 *
 * @param descriptor - 该端的 settings descriptor；`operations` 只应含 `export`。
 * @returns 对 `export` 恒回 `export_unsupported`、对其余操作回 `provider_unsupported` 的 provider。
 */
export function createDevToolsReadOnlySettingsProvider(descriptor: DevToolsProviderDescriptor): DevToolsProvider {
  return {
    descriptor,
    invoke: operation =>
      Promise.resolve({
        outcome: 'failed',
        error: createProviderError(operation === 'export' ? 'export_unsupported' : 'provider_unsupported')
      })
  };
}
