/**
 * @fileoverview 浏览器 `settings` provider。
 *
 * @remarks
 * 当前只声明 `export` 一个操作，而且它恒定失败——这不是占位，是 AC#43 的 connector 侧本体：
 * 面板禁用按钮只挡住 UI，绕过 UI 直接发命令的调用要在**对端**也碰壁。
 *
 * `export` 必须在任何 host 侧动作**之前**返回。写成「先取根目录、发现不支持再返回」会让
 * 「`navigator.storage.getDirectory()` / SQLite / WAL 读取次数为 0」这条判据退化成
 * 「实现恰好没读」——而恰好成立的东西下次重构就不成立了。
 *
 * `clear` 尚未声明：页内 connector 还没有接管清理路径（面板仍走 v1 脚本注入）。
 * 声明一个服务不了的操作等于让面板据此点亮按钮，所以宁可让授权层回
 * `provider_unsupported`，也不宣告。
 *
 * @module @aiao/rxdb-devtools/browser/settings-provider
 */

import type { DevToolsProviderDescriptor } from '../provider/descriptor.js';
import type { DevToolsProvider } from '../provider/types.js';
import { createProviderError } from '../v2/error-mapping.js';

/** 浏览器 settings provider 的 descriptor。 */
export const DEVTOOLS_BROWSER_SETTINGS_DESCRIPTOR: DevToolsProviderDescriptor = {
  domain: 'settings',
  version: 1,
  kind: 'opfs',
  operations: ['export'],
  runtime: 'browser',
  limits: { maxTransferBytes: 0 }
};

/**
 * 建一个浏览器 `settings` provider。
 *
 * @returns 对 `export` 恒回 `export_unsupported`、对其余操作回 `provider_unsupported` 的 provider。
 */
export function createDevToolsBrowserSettingsProvider(): DevToolsProvider {
  return {
    descriptor: DEVTOOLS_BROWSER_SETTINGS_DESCRIPTOR,
    invoke: operation =>
      Promise.resolve({
        outcome: 'failed',
        error: createProviderError(operation === 'export' ? 'export_unsupported' : 'provider_unsupported')
      })
  };
}
