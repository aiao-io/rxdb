/**
 * renderer 入口的产物依赖图：从入口沿静态 / 动态 import 只走 `@aiao/` 范围内与入口所在目录下的文件，
 * 记下每个 Node 内建的引用处。`node:` 前缀与裸名（`fs`、`fs/promises`、`path`）一样算内建——
 * 裸名经 `createRequire().resolve()` 解析出来仍是 `'fs'` 这样的字符串，不判内建就会被当成外部依赖跳过。
 *
 * 函数体会原样（`Function.prototype.toString`）嵌进临时消费者项目的 `runtime.mjs` 执行，
 * 只能用参数里给的依赖，不能引用模块级变量或别的 helper。
 *
 * @param {string} entry renderer 入口的绝对路径
 * @param {{
 *   readFile: (file: string, encoding: 'utf8') => Promise<string>,
 *   createRequire: (url: URL) => NodeJS.Require,
 *   pathToFileURL: (file: string) => URL,
 *   isBuiltin: (specifier: string) => boolean,
 *   path: typeof import('node:path')
 * }} deps 读文件与模块解析所需的 Node API
 * @returns {Promise<{ files: Set<string>, builtins: Map<string, string> }>} 走过的文件与「内建 → 引用它的文件」
 */
export async function collectRendererGraph(entry, { readFile, createRequire, pathToFileURL, isBuiltin, path }) {
  const importPattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
  const seen = new Set();
  const builtins = new Map();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    const code = await readFile(current, 'utf8');
    const localRequire = createRequire(pathToFileURL(current));
    for (const [, specifier] of code.matchAll(importPattern)) {
      if (specifier.startsWith('node:') || isBuiltin(specifier)) {
        builtins.set(specifier, current);
        continue;
      }
      let resolved;
      try {
        resolved = localRequire.resolve(specifier);
      } catch {
        continue;
      }
      if (resolved.includes(path.join('node_modules', '@aiao')) || resolved.startsWith(path.dirname(entry))) {
        queue.push(resolved);
      }
    }
  }
  return { files: seen, builtins };
}
