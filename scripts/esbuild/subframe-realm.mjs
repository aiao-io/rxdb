import { transform } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** 将 Emscripten glue 的全局对象绑定到探针已确认的真实 realm。 */
export function subframeRealmPlugin(binding) {
  return {
    name: 'subframe-realm',
    setup(build) {
      build.onLoad(
        { filter: /[/\\]@subframe7536[/\\]sqlite-wasm[/\\]dist[/\\]wa-sqlite-[^/\\]+\.js$/ },
        async ({ path }) => {
          const source = await readFile(path, 'utf8');
          const { code } = await transform(source, { loader: 'js', define: { globalThis: binding } });
          return { contents: code, loader: 'js', resolveDir: dirname(path) };
        }
      );
    }
  };
}
