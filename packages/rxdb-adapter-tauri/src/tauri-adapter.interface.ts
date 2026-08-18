/**
 * Tauri 适配器在本包内的身份。
 *
 * @remarks
 * 选项形状与逻辑文件名后缀已下沉到 `@aiao/rxdb-adapter-sqlite-core/desktop-host`
 * （两个桌面运行时共用同一份）；留在这里的只有**注册名**——它是每个运行时包各自的身份，
 * 共享层不替它们定名。
 *
 * 名字按 `<引擎>-<运行时>` 构成（与 `@aiao/rxdb-adapter-miniprogram` 的
 * `wa-sqlite-miniprogram` 同构）。它不能只叫 `tauri`：同一个运行时上将来可能不止一种引擎，
 * 名字里不带引擎就没有第二个位置可放。
 *
 * @module tauri-adapter.interface
 */

import type { DesktopHostAdapterName } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';

/**
 * 适配器在 `RxDBAdapters` 注册表中的名字。
 *
 * @remarks
 * `satisfies` 把它钉在共享层的登记表上：这个名字改了而 `DESKTOP_HOST_ADAPTER_NAMES` 没跟上，
 * 是编译错误而不是某个下游在运行期才发现的 `adapter_mismatch`。
 */
export const ADAPTER_NAME = 'sqlite-tauri' as const satisfies DesktopHostAdapterName;
