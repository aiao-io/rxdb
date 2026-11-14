import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** 一个脚本静态 import 的同级脚本（`import…from"./x.js"` 与 `import"./x.js"`；动态 `import("./x.js")` 不算）。 */
export function staticImports(source) {
  const names = new Set();
  for (const match of source.matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g)) names.add(match[1]);
  return [...names];
}

/**
 * 首屏会下载的脚本（ADESK-US-206）：index.html 里的 `<script src>` 与 `modulepreload`，加上它们的静态 import 闭包。
 * 应用按需加载后，不在这个集合里的 chunk 都是「打开应用时才下载」的。
 *
 * @param {string} distRoot web 的构建产物目录
 * @returns {Set<string>} 文件名集合
 */
export function initialScripts(distRoot) {
  const html = readFileSync(join(distRoot, 'index.html'), 'utf8');
  const queue = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)]
    .map(match => match[1])
    .filter(name => !name.includes('/'));
  const seen = new Set();
  while (queue.length) {
    const name = queue.pop();
    // 产物里的字符串（示例代码、文档）也可能长得像 import，只认确实存在的 chunk 文件
    if (seen.has(name) || !existsSync(join(distRoot, name))) continue;
    seen.add(name);
    queue.push(...staticImports(readFileSync(join(distRoot, name), 'utf8')));
  }
  return seen;
}

/** 产物根目录下按需加载的脚本：不在首屏集合里、也不是工作线程脚本。 */
export function lazyScripts(distRoot) {
  const initial = initialScripts(distRoot);
  return new Set(
    readdirSync(distRoot).filter(name => name.endsWith('.js') && !initial.has(name) && !name.startsWith('worker'))
  );
}

/** 请求 URL 对应的产物根目录脚本名；不是同源根目录脚本时为 `null`。 */
export function scriptNameOf(url, origin) {
  if (!url.startsWith(`${origin}/`)) return null;
  const path = new URL(url).pathname.slice(1);
  return /^[\w.-]+\.js$/.test(path) ? path : null;
}

/** Angular 编译产物里的组件声明：`selectors:[["app-notes"]]`（字符串可能是反引号或双引号）。 */
const COMPONENT_SELECTOR = /selectors:\[\[[`"](app-[\w-]+)[`"]\]/g;
/** 数据域种子模块里的声明：`domain:`notes`,version:1`。 */
const SEED_DOMAIN = /domain:[`"]([a-z]+)[`"],version:\d+/g;

function declarations(distRoot, pattern) {
  const found = new Map();
  for (const name of readdirSync(distRoot).filter(file => file.endsWith('.js'))) {
    const names = [
      ...new Set([...readFileSync(join(distRoot, name), 'utf8').matchAll(pattern)].map(match => match[1]))
    ];
    if (names.length > 0) found.set(name, names);
  }
  return found;
}

/**
 * 构建里每个脚本声明的 `app-*` 组件选择器：脚本名 → 选择器。用来知道「某个应用的组件在哪个 chunk 里」，
 * 不需要 import web 的源码（D-02）。
 *
 * @param {string} distRoot
 * @returns {Map<string, string[]>}
 */
export const componentScripts = distRoot => declarations(distRoot, COMPONENT_SELECTOR);

/**
 * 构建里每个脚本声明的数据域种子：脚本名 → 数据域名。种子模块是动态导入的，数据域第一次被读取才会下载。
 *
 * @param {string} distRoot
 * @returns {Map<string, string[]>}
 */
export const seedScripts = distRoot => declarations(distRoot, SEED_DOMAIN);

/** 声明表里声明了 `name` 的脚本。 */
export const scriptsDeclaring = (table, name) =>
  [...table].filter(([, names]) => names.includes(name)).map(([script]) => script);

/** 首屏脚本闭包与样式的原始字节、逐文件 gzip 字节和摘要；不包含 HTML、工作线程和动态模块。 */
export function initialFootprint(distRoot) {
  const html = readFileSync(join(distRoot, 'index.html'), 'utf8');
  const styles = [...html.matchAll(/<link\b[^>]*href="([^"/]+\.css)"/g)].map(match => match[1]);
  const files = [...new Set([...initialScripts(distRoot), ...styles])].sort().map(name => {
    const content = readFileSync(join(distRoot, name));
    return {
      name,
      bytes: content.byteLength,
      gzipBytes: gzipSync(content, { level: 9 }).byteLength,
      sha256: createHash('sha256').update(content).digest('hex')
    };
  });
  return {
    files,
    rawBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    gzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0)
  };
}
