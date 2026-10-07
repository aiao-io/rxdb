/**
 * 小程序 adapter 的 vite 构建插件（实验性）。
 *
 * 给不走 `@aiao/rxdb-taro` Taro 插件的项目用：支付宝（Taro 插件只开微信与抖音），或自己组装 vite 配置的项目。
 *
 * @packageDocumentation
 */
import type { Plugin } from 'vite';
import { miniProgramAssetsVitePlugin } from './assets-plugin.js';
import { realmVitePlugin } from './realm-plugin.js';
import { subframeGlueVitePlugin } from './subframe-glue-plugin.js';

export { ALIPAY_WORKER_PATH } from './constants.js';

/**
 * 构建插件支持的 Taro 平台名（即 `process.env.TARO_ENV`，不是 adapter 的平台 id）。
 *
 * @experimental
 */
export type MiniProgramBuildPlatform = 'weapp' | 'tt' | 'alipay';

/**
 * 按平台组装 adapter 的构建前提，返回的插件追加进 vite 的 `plugins`（Taro 里是 `compiler.vitePlugins`）。
 *
 * - 全部平台：抹掉 `@subframe7536/sqlite-wasm` glue 里的 `import.meta.url`；把 wasm 发到产物根的 `wa-sqlite/wa-sqlite.wasm`。
 * - 抖音、支付宝：模块里没有可用的 `globalThis`，产物里自由的 `globalThis` 构建期改指入口登记的真实全局对象（`rxdb-realm.js`）。
 * - 支付宝：另发 wasm 的 base64 文本副本与随机数 Worker（代码包路径 {@link ALIPAY_WORKER_PATH}，`app.config.ts` 要在
 *   `workers` 里声明）。懒加载分包、标签 `var` 提升与构建目标不在这里，见 adapter README「支付宝」。
 *
 * 不读不写 `build.target`。
 *
 * @param platform - Taro 平台名
 * @param appRoot - app 根目录（有 package.json 的那层），从这里解析 `@aiao/rxdb-adapter-miniprogram`
 * @returns 按顺序追加的 vite 插件
 * @throws 从 `appRoot` 解析不到 `@aiao/rxdb-adapter-miniprogram`
 * @experimental
 */
export function miniProgramVitePlugins(platform: MiniProgramBuildPlatform, appRoot: string): Plugin[] {
  const realm = platform === 'weapp' ? [] : [realmVitePlugin(platform)];
  return [subframeGlueVitePlugin(), ...realm, miniProgramAssetsVitePlugin(platform, appRoot)];
}
