/**
 * 桌面宿主的 `settings` provider（US-904 阶段 D AC#49；US-905 阶段 2 复用）。
 *
 * @remarks
 * 与浏览器端**同一份**实现，只换 descriptor：`kind` 从 `opfs` 换成 `sqlite`，`runtime` 由
 * 调用方声明（`electron` / `tauri`）。行为一致是被验收的一部分——AC#49 要的是「下载禁用且
 * 强制命令返回 `export_unsupported`，未声明清理返回 `provider_unsupported`」，在两端读到
 * 不同的答案就意味着面板得按 runtime 分支处理同一个域。
 *
 * **runtime 是参数而不是两份实现**：Electron 与 Tauri 的 settings 语义完全相同，各写一份
 * 就给了 `kind` / `operations` / `limits` 三处分叉的机会，而分叉正是这条 AC 要排除的东西。
 *
 * 桌面端的诱惑更大：主进程 / Rust 侧手上就有 SQLite 句柄与应用数据目录，写成「先打开库、
 * 发现导出没实现再返回」几乎不费力。AC#49 明写「不读取 OPFS/SQLite/WAL 或其他目录」，
 * 所以这里除 runtime 外连一个 ports 入参都不收——没有句柄可用，也就没有「顺手读一下」的可能。
 *
 * `maxTransferBytes: 0` 是这条禁令在协议上的形态：面板据此把下载按钮画成禁用态，
 * 而不是画出来再由对端拒绝。
 *
 * @module @aiao/rxdb-devtools/native/settings-provider
 */

import type { DevToolsProviderDescriptor, DevToolsProviderRuntime } from '../provider/descriptor.js';
import { createDevToolsReadOnlySettingsProvider } from '../provider/read-only-settings.js';
import type { DevToolsProvider } from '../provider/types.js';

/**
 * 桌面 settings provider 的 descriptor。
 *
 * @param runtime - 显示用的宿主来源；只进 descriptor，不参与任何行为分支。
 * @returns 该宿主的 settings descriptor。
 */
export function createDevToolsDesktopSettingsDescriptor(runtime: DevToolsProviderRuntime): DevToolsProviderDescriptor {
  return {
    domain: 'settings',
    version: 1,
    kind: 'sqlite',
    operations: ['export'],
    runtime,
    limits: { maxTransferBytes: 0 }
  };
}

/**
 * 建一个桌面 `settings` provider。
 *
 * @param runtime - 显示用的宿主来源（`electron` / `tauri`）。
 * @returns 对 `export` 恒回 `export_unsupported`、对其余操作回 `provider_unsupported` 的 provider。
 */
export function createDevToolsDesktopSettingsProvider(runtime: DevToolsProviderRuntime): DevToolsProvider {
  return createDevToolsReadOnlySettingsProvider(createDevToolsDesktopSettingsDescriptor(runtime));
}
