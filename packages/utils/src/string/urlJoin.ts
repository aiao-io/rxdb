import { isNumber, isString } from '../types/index.js';

const regPrefix = /^([^/:]+):\/*/;

/**
 * 剥掉末尾连续的 `/`
 *
 * 用线性扫描而不是 `replace(/\/+$/, '')`：后者在 `/` 串后面还有内容时
 * （`'a' + '/'.repeat(30000) + 'b'`），每个起点都要吃完整串再逐个回退，
 * 整体 O(n²)（CS-010 / CS-011）。开头的 `/^\/+/` 只有一个起点，不受影响。
 */
const stripTrailingSlash = (value: string): string => {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end--;
  }
  return end === value.length ? value : value.slice(0, end);
};

/**
 * 前缀之上是否还有可被 `..` 弹出的路径段
 *
 * 只有「绝对且不含路径段」的前缀（`/`、`//`、`scheme://host`）才是真正的根 ——
 * 此时 `..` 无处可去，保留它只会输出越过根的垃圾路径。
 * 相对前缀（`a/`）与含路径的前缀（`http://x.com/a/`）都可能被 `..` 抵消，
 * 但它们不在归一化栈里，因此原样保留 `..`，交给 URL 解析器处理（UTL-014）。
 */
const isRootPrefix = (prefix: string): boolean => {
  const isAbsolute = prefix.startsWith('/') || regPrefix.test(prefix);
  if (!isAbsolute) {
    return false;
  }
  const withoutScheme = prefix.replace(regPrefix, '');
  return !stripTrailingSlash(withoutScheme.replace(/^\/+/, '')).includes('/');
};

/**
 * 线性栈归一化：`.` 跳过，`..` 弹栈，无栈可弹时按前缀语义决定丢弃还是保留
 *
 * 取代原先的 `while (includes('/../')) { findIndex('..'); splice(index - 1, 2) }` ——
 * 当 `..` 位于 index 0 时 `splice(-1, 2)` 会从**末尾**删除，把无关的后续路径段吃掉（UTL-014）。
 */
const normalizeSegments = (pathStr: string, prefix: string, protectedSegments: number): string => {
  const dropEscapingParent = isRootPrefix(prefix);
  const stack: string[] = [];

  for (const segment of pathStr.split('/')) {
    if (segment === '.') {
      continue;
    }
    if (segment !== '..') {
      stack.push(segment);
      continue;
    }
    if (stack.length > protectedSegments && stack[stack.length - 1] !== '..') {
      stack.pop();
      continue;
    }
    if (!dropEscapingParent) {
      stack.push('..');
    }
  }

  return stack.join('/');
};

/** 查询串开始之后，以这些字符开头的片段属于查询串或锚点 */
const QUERY_CONTINUATION = /^[?&#]/;

const isNonEmpty = (part: string): boolean => part !== '';

/**
 * 把查询串从路径段里分出来
 *
 * 整串拼好再按第一个 `?` 切分时，查询串之后的路径段会被并进查询值
 * （`'http://x.com/a?x=1', 'b'` → `http://x.com/a?x=1/b`）。改为逐片段在首个 `?` 处切开：
 * 之前的部分留在路径里，`?` 起的部分按原顺序放进查询片段；查询串开始后以 `?` / `&` / `#`
 * 开头的片段是查询串或锚点的延续，整段归入查询片段。
 * 查询片段不参与路径归一化：其中的 `.` / `..` / `/` 是参数值，不是路径段。
 */
const splitQueries = (parts: readonly string[]): { pathParts: string[]; queryParts: string[] } => {
  const pathParts: string[] = [];
  const queryParts: string[] = [];
  for (const part of parts) {
    const index = queryParts.length > 0 && QUERY_CONTINUATION.test(part) ? 0 : part.indexOf('?');
    if (index < 0) {
      pathParts.push(part);
      continue;
    }
    pathParts.push(part.slice(0, index));
    queryParts.push(part.slice(index));
  }
  return { pathParts: pathParts.filter(isNonEmpty), queryParts: queryParts.filter(isNonEmpty) };
};

/**
 * 把查询片段拼成查询串，片段内部一个字符都不动
 *
 * 每个片段都以 `?` / `&` / `#` 开头（`splitQueries` 保证），所以只看片段开头：
 * 首段原样保留（含它的 `?`，单独的 `?` 也留着）；后续以 `?` 开头的片段改以 `&` 接上，
 * 其中只有一个 `?` 的空段不贡献内容；以 `&` / `#` 开头的片段原样追加。
 * 值里的 `/`（含末尾的）、`?`、`&`、`#` 都是参数值或锚点，不能再被当成路径分隔符处理。
 */
const joinQueries = (queryParts: readonly string[]): string => {
  const [first, ...rest] = queryParts;
  let queryStr = first;
  for (const part of rest) {
    if (!part.startsWith('?')) {
      queryStr += part;
    } else if (part.length > 1) {
      queryStr += `&${part.slice(1)}`;
    }
  }
  return queryStr;
};

/**
 * 折叠路径部分里紧挨在 `&` 或 `#`（`#!` 除外）之前的 `/`，让锚点贴在前一段之后
 *
 * 只作用于路径部分（前缀 + 归一化后的路径段）。查询片段在 `splitQueries` 里就已分走，
 * 其中的 `/&`、`/#` 是参数值，不得经过这里；路径部分本身不含 `?`（`splitQueries` 在首个 `?` 处切开）。
 */
const foldAnchorSlash = (pathPart: string): string => pathPart.replace(/\/(&|#[^!])/g, '$1');

/**
 * 拼接路径片段：首段决定前缀（协议、协议相对、根路径），其余片段做栈式归一化
 *
 * @returns 前缀（非空时以 `/` 结尾）与归一化后的路径部分；没有路径片段时两者都为空
 */
const joinPathParts = (parts: readonly string[]): { prefix: string; pathStr: string } => {
  if (parts.length === 0) {
    return { prefix: '', pathStr: '' };
  }

  let prefix: string;
  let rest = parts;
  const firstPath = parts[0];
  // 协议相对 URL 的 authority 留在片段列表里，它不是路径段，`..` 不得把它弹掉
  let protectedSegments = 0;

  if (firstPath.startsWith('//')) {
    prefix = '//';
    protectedSegments = 1;
  } else if (firstPath.startsWith('/')) {
    prefix = '/';
  } else {
    if (firstPath.startsWith('file:') && parts.length > 1 && (firstPath + parts[1]).match(/^file:\/\/\//)) {
      prefix = firstPath.replace(regPrefix, '$1:///');
    } else {
      prefix = firstPath.replace(regPrefix, '$1://');
    }
    rest = parts.slice(1);
  }

  if (!prefix.endsWith('/')) {
    prefix += '/';
  }

  const pathStr = normalizeSegments(
    rest
      .map(path => stripTrailingSlash(path.replace(/^\/+/, '').replace(/^\.\/+/, '')))
      .filter(isNonEmpty)
      .join('/'),
    prefix,
    protectedSegments
  );
  return { prefix, pathStr };
};

/**
 * 拼接 URL / 路径片段
 *
 * 首个片段决定前缀（协议、协议相对、根路径），其余片段做栈式归一化：
 * `.` 被跳过，`..` 弹出上一段；`..` 越过根（`/`、`//`、`scheme://host`）时丢弃，
 * 其余情况原样保留。
 *
 * 任一片段里的查询串（`?` 起）都移到全部路径段之后，不参与路径归一化。
 * 查询串与路径之间只在三处会被改动：
 * - 多段合并：首段原样保留，后续以 `?` 开头的片段改以 `&` 接上（只有一个 `?` 的空段不贡献内容），
 *   以 `&` / `#` 开头的片段原样追加；
 * - 路径与查询串的接缝：前缀自带的末尾 `/` 不留在 `?` 之前（`'http://x.com/'` + `'?a=1'` 得 `'http://x.com?a=1'`）；
 * - 路径部分：紧挨在 `&` 或 `#`（`#!` 除外）之前的 `/` 被折叠，锚点贴在前一段之后。
 *
 * 其余一律原样保留，包括查询片段与锚点内部的 `.` / `..` / `/`（含末尾的 `/`）、字面的 `?` / `&` / `#`
 * 与已编码字符：`'?next=/a/../b'`、`'?next=/a/&b'`、`'?r=/s?q=1'`、`'#/route/'` 都不会变。
 *
 * @param paths - 片段，必须是 string 或 number
 * @returns 拼接后的 URL / 路径
 * @throws {Error} 片段不是 string 或 number
 *
 * @example
 * ```ts
 * urlJoin('http://x.com/', 'foo/bar', '?a=1'); // 'http://x.com/foo/bar?a=1'
 * urlJoin('http://x.com/a?x=1', 'b', '?y=2'); // 'http://x.com/a/b?x=1&y=2'
 * urlJoin('http://x.com', '?next=/a/&b', '?r=/s?q=1'); // 'http://x.com?next=/a/&b&r=/s?q=1'
 * urlJoin('/a/b/c/d', '..', '..', 'e'); // '/a/b/e'
 * ```
 */
export const urlJoin = (...paths: Array<string | number>) => {
  paths = paths.filter(d => d !== '');
  if (paths.length === 0) {
    return '';
  }

  const findIndex = paths.findIndex(d => !(isString(d) || isNumber(d)));
  if (findIndex >= 0) {
    throw new Error('paths must be a string or number');
  }
  const { pathParts, queryParts } = splitQueries(paths.map(path => `${path}`));
  // 没有路径片段（只有查询串）时也就没有前缀
  const { prefix, pathStr } = joinPathParts(pathParts);

  if (queryParts.length === 0) {
    return foldAnchorSlash(prefix + pathStr);
  }
  // 前缀恒以 `/` 结尾，路径为空时这个 `/` 不能留在 `?` 之前；路径非空时两者直接相接
  const head = pathStr === '' ? prefix.slice(0, -1) : prefix + pathStr;
  return foldAnchorSlash(head) + joinQueries(queryParts);
};
