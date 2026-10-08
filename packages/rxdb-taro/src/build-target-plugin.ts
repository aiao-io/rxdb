import type { Plugin } from 'vite';

/** `@tarojs/vite-runner` 的 `taro:vite-mini-config` 写死的构建目标（Taro 4.2.1 / 4.3.0）。 */
export const TARO_DEFAULT_TARGET = 'es6';

/** 构建插件服务的 Taro 平台名。 */
export type BuildTargetPlatform = 'weapp' | 'tt' | 'alipay';

/**
 * 各平台实测过的构建目标。
 *
 * - 微信、抖音 es2020：demo 一直用它，开发者工具与 iOS 真机走查过（US-211）。
 * - 支付宝 es2018：开发者工具在 babel 7 档（`project.alipay.json` 的 `compileOptions.transpile`）下编译通过，更高的没验证过；
 *   babel 6 档连 `?.`、`??` 都报 CE1000.02。改写出的 `BigInt("…")` 由 host 的 `prepareRuntime` 补上全局后才求值。
 */
const PLATFORM_TARGETS: Readonly<Record<BuildTargetPlatform, string>> = {
  weapp: 'es2020',
  tt: 'es2020',
  alipay: 'es2018'
};

/**
 * 只把 Taro 写死的 `es6` 抬到平台实测过的构建目标，用户自己设的值不动。
 *
 * RxDB 栈模块顶层就有 BigInt 字面量。Taro 4.3 官方模板带的 vite 4（esbuild 0.18）在 es6 下改写不了它们，构建直接失败；
 * 新版 esbuild 会改写成 `BigInt("…")` 调用并告警。adapter 本就要求原生 `BigInt`，抬高目标不收窄支持面。
 * `enforce: 'post'` 排在 Taro 的 `config` 钩子之后，此时看到的仍是 `es6` 就说明没人改过。
 *
 * @param platform - Taro 平台名
 */
export function buildTargetVitePlugin(platform: BuildTargetPlatform): Plugin {
  return {
    name: 'aiao-rxdb-taro:build-target',
    enforce: 'post',
    config(config) {
      if (config.build?.target !== TARO_DEFAULT_TARGET) return;
      return { build: { target: PLATFORM_TARGETS[platform] } };
    }
  };
}
