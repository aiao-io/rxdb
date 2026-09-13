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

export function rxdbBuildTargetVitePlugin(): Plugin {
  return {
    name: 'dev-rxdb-miniprogram:rxdb-es2020-target',
    enforce: 'post',
    config() {
      return { build: { target: 'es2020' } };
    }
  };
}
