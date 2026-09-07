// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./src/vite-env.d.ts" />
import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

/**
 * dev 变体的 vite mode；`project.json` 的 `build-desktop-dev` 传的就是这个值。
 *
 * @remarks
 * 它同时是变体名：`createManifest(DESKTOP_DEV_MODE)`。两处共用一个常量，避免
 * 「构建目标传了 mode、manifest 却没认出来」这种只在产物里才看得见的漂移。
 */
export const DESKTOP_DEV_MODE = 'desktop-dev';

/**
 * dev 变体那一条静态 host permission。
 *
 * @remarks
 * **不含端口**：Chrome 的 host pattern 本就不匹配端口，`nx serve` 的 4120 与 e2e 里的
 * 随机端口都覆盖得到。范围也只到 localhost —— 桌面应用的 `--serve` renderer 就在那儿。
 */
export const DESKTOP_DEV_HOST_PERMISSIONS = ['http://localhost/*'] as const;

/** manifest 变体：发布产物，或桌面端调试专用。 */
export type ManifestVariant = 'default' | typeof DESKTOP_DEV_MODE;

/**
 * 按变体产出 manifest。
 *
 * @param variant - `'default'` 出发布产物；{@link DESKTOP_DEV_MODE} 出桌面端调试变体。
 * @returns 该变体的完整 manifest。
 *
 * @remarks
 * 两个变体**只差 `host_permissions` 一个键**，由 `manifest.config.spec.ts` 的结构断言钉住。
 * 桌面开发者调的必须是将要发布的那个扩展，否则「桌面端能跑、浏览器端不能」会被错误地
 * 归因到宿主差异上。
 */
export function createManifest(variant: ManifestVariant) {
  return {
    manifest_version: 3 as const,
    name: 'RxDB DevTools',
    description: '检查 RxDB 本地优先数据库：实时事件流、实体数据、分支、OPFS 文件与存储管理。',
    version: pkg.version,
    icons: {
      16: 'public/icon-16.png',
      32: 'public/icon-32.png',
      48: 'public/icon-48.png',
      128: 'public/icon-128.png'
    },
    devtools_page: 'devtools.html',
    permissions: ['scripting'],
    // US-904 阶段 D 实测：**不要**为 Electron 往发布 manifest 里加 `host_permissions`。
    // 桌面应用生产入口是自定义 `app:` scheme，而自定义 scheme 不在 Chromium 扩展
    // match pattern 的合法 scheme 集里 —— `app://-/*`、`<all_urls>`、两者并列三种写法
    // 都实测无效，`chrome.scripting` 一律抛
    // 「Cannot access contents of the page. Extension manifest must request permission...」。
    // Electron 侧要跑通四段 relay，唯一成立的形态是 inspected page 本身走 http（`--serve`），
    // 且由**开发专用**的下面这条静态 host permission 承担（Electron 没有 `chrome.permissions`
    // 命名空间，optional 权限永远授不出去）。发布 manifest 保持 optional-only，
    // 见 US-904 阶段 A 记录的可容忍差异、US-906 的 dev 变体。
    optional_host_permissions: ['<all_urls>'],
    ...(variant === DESKTOP_DEV_MODE ? { host_permissions: [...DESKTOP_DEV_HOST_PERMISSIONS] } : {}),
    background: {
      service_worker: 'src/background/index.ts',
      type: 'module' as const
    }
  };
}

export default defineManifest(env => createManifest(env.mode === DESKTOP_DEV_MODE ? DESKTOP_DEV_MODE : 'default'));
