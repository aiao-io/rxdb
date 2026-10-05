import { transformAsync } from '@babel/core';
import type { Plugin } from 'vite';

function isLinkedPackageDist(id: string): boolean {
  const cleanId = id.split('?')[0];
  return cleanId.includes('/packages/') && cleanId.includes('/dist/') && cleanId.endsWith('.js');
}

export function rxdbPackagesVitePlugin(): Plugin {
  return {
    name: 'dev-rxdb-miniprogram:rxdb-private-members',
    enforce: 'pre',
    async transform(code, id) {
      if (!isLinkedPackageDist(id) || !code.includes('#')) return null;
      const result = await transformAsync(code, {
        babelrc: false,
        configFile: false,
        filename: id.split('?')[0],
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }]
        ],
        sourceMaps: true,
        sourceType: 'module'
      });
      if (!result?.code) return null;
      return { code: result.code, map: result.map };
    }
  };
}

/** `@subframe7536/sqlite-wasm` 的 Emscripten glue 文件名带内容哈希，只认前缀。 */
const SUBFRAME_GLUE_PATTERN = /[\\/]@subframe7536[\\/]sqlite-wasm[\\/]dist[\\/]wa-sqlite-[^\\/]+\.js$/;

function isSubframeGlue(id: string): boolean {
  return SUBFRAME_GLUE_PATTERN.test(id.split('?')[0]);
}

/**
 * 把 subframe glue 里的 `import.meta.url` 抹成空串。
 *
 * 小程序运行时没有 `import.meta`，而这个包发的是 ESM。glue 里只有两处用到它：
 * 模块初始化时的 `_scriptName`，和 `findWasmBinary()` 里的默认 wasm 定位；后者在我们
 * 显式传 `locateFile` + `instantiateWasm` 时根本走不到，前者只在 web / worker 分支被读。
 * 所以换成空串既能过小程序的解析，又不改变实际行为。
 */
export function subframeSqliteWasmVitePlugin(): Plugin {
  return {
    name: 'dev-rxdb-miniprogram:subframe-sqlite-wasm',
    enforce: 'pre',
    transform(code, id) {
      if (!isSubframeGlue(id) || !code.includes('import.meta.url')) return null;
      return { code: code.replace(/import\.meta\.url/g, '""'), map: null };
    }
  };
}

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
