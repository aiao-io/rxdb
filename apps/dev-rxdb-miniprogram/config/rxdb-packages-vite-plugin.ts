import type { Plugin } from 'vite';

/**
 * 覆盖 Taro 默认的 `build.target: 'es6'`。RxDB 栈（核心、sqlite-core、wa-sqlite）模块顶层就有 BigInt 字面量，
 * es2020 以下 esbuild 会把它们改写成 `BigInt("…")` 调用并告警，所以微信、抖音构建用 es2020。
 *
 * 支付宝构建用 es2018，这是实测过的组合：支付宝小程序开发者工具在 babel 7 档（`project.alipay.json` 的
 * `compileOptions.transpile`，见 `project.json` 的 `// build-alipay`）下编译通过，更高的 target 没验证过；
 * babel 6 档连 `?.`、`??`、省略 catch 绑定都报 CE1000.02 Unexpected token。改写出的 `BigInt("…")` 运行时才读全局：
 * 模拟器逻辑层没有 `BigInt`，由支付宝 host 的 `prepareRuntime` 补上，RxDB 栈留在懒加载 chunk 里等它补完才求值
 * （`lazy-chunk-vite-plugin.ts`），与探针（`apps/dev-rxdb-miniprogram-alipay-probe`）同一做法。
 */
export function rxdbBuildTargetVitePlugin(target: 'es2018' | 'es2020'): Plugin {
  return {
    name: 'dev-rxdb-miniprogram:build-target',
    enforce: 'post',
    config() {
      return { build: { target } };
    }
  };
}
