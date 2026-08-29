import { InjectionToken } from '@angular/core';

/**
 * 关于页展示的 DevTools 版本号，由**宿主**提供。
 *
 * @remarks
 * 它必须来自宿主的 `package.json`（Chrome 扩展侧与 `manifest.config.ts` 的
 * `version: pkg.version` 同源），而不是本 library 的 —— 本 library 是 `private: true`
 * 的内部包，版本号永远停在初始值，直接读它会让关于页显示的版本与 manifest 分叉，
 * 正是 P2-13 当初要消除的那种分叉。
 */
export const DEVTOOLS_PANEL_VERSION = new InjectionToken<string>('DEVTOOLS_PANEL_VERSION');
