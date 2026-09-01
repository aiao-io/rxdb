/**
 * @fileoverview Electron `settings` provider（US-904 阶段 D，AC#49）。
 *
 * @remarks
 * 与浏览器端**同一份**实现，只换 descriptor：`kind` 从 `opfs` 换成 `sqlite`，`runtime` 从
 * `browser` 换成 `electron`。行为一致是被验收的一部分——AC#49 要的是「下载禁用且强制命令
 * 返回 `export_unsupported`，未声明清理返回 `provider_unsupported`」，在两端读到不同的答案
 * 就意味着面板得按 runtime 分支处理同一个域。
 *
 * Electron 侧的诱惑更大：主进程手上就有 SQLite 句柄与 userData 路径，写成「先打开库、
 * 发现导出没实现再返回」几乎不费力。AC#49 明写「不读取 OPFS/SQLite/WAL 或其他目录」，
 * 所以这里连一个 ports 入参都不收——没有句柄可用，也就没有「顺手读一下」的可能。
 *
 * `maxTransferBytes: 0` 是这条禁令在协议上的形态：面板据此把下载按钮画成禁用态，
 * 而不是画出来再由对端拒绝。
 *
 * @module @aiao/rxdb-devtools/native/settings-provider
 */

import type { DevToolsProviderDescriptor } from '../provider/descriptor.js';
import { createDevToolsReadOnlySettingsProvider } from '../provider/read-only-settings.js';
import type { DevToolsProvider } from '../provider/types.js';

/** Electron settings provider 的 descriptor。 */
export const DEVTOOLS_ELECTRON_SETTINGS_DESCRIPTOR: DevToolsProviderDescriptor = {
  domain: 'settings',
  version: 1,
  kind: 'sqlite',
  operations: ['export'],
  runtime: 'electron',
  limits: { maxTransferBytes: 0 }
};

/**
 * 建一个 Electron `settings` provider。
 *
 * @returns 对 `export` 恒回 `export_unsupported`、对其余操作回 `provider_unsupported` 的 provider。
 */
export function createDevToolsElectronSettingsProvider(): DevToolsProvider {
  return createDevToolsReadOnlySettingsProvider(DEVTOOLS_ELECTRON_SETTINGS_DESCRIPTOR);
}
