import type { Plugin } from 'vite';

/** `@subframe7536/sqlite-wasm` 的 Emscripten glue 文件名带内容哈希，只认前缀。 */
const SUBFRAME_GLUE_PATTERN = /[\\/]@subframe7536[\\/]sqlite-wasm[\\/]dist[\\/]wa-sqlite-[^\\/]+\.js$/;

function isSubframeGlue(id: string): boolean {
  return SUBFRAME_GLUE_PATTERN.test(id.split('?')[0]);
}

/**
 * 把 subframe glue 里的 `import.meta.url` 抹成空串。
 *
 * 小程序运行时没有 `import.meta`，而这个包发的是 ESM。glue 里只有两处用到它：
 * 模块初始化时的 `_scriptName`，和 `findWasmBinary()` 里的默认 wasm 定位；后者在 adapter
 * 显式传 `locateFile` + `instantiateWasm` 时根本走不到，前者只在 web / worker 分支被读。
 * 所以换成空串既能过小程序的解析，又不改变实际行为；vite 也就不会再把 wasm 以 base64 内联进产物。
 */
export function subframeGlueVitePlugin(): Plugin {
  return {
    name: 'aiao-rxdb-taro:subframe-glue',
    enforce: 'pre',
    transform(code, id) {
      if (!isSubframeGlue(id) || !code.includes('import.meta.url')) return null;
      return { code: code.replace(/import\.meta\.url/g, '""'), map: null };
    }
  };
}
