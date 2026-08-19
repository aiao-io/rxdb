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

/**
 * 拼接 URL / 路径片段
 *
 * 首个片段决定前缀（协议、协议相对、根路径），其余片段做栈式归一化：
 * `.` 被跳过，`..` 弹出上一段；`..` 越过根（`/`、`//`、`scheme://host`）时丢弃，
 * 其余情况原样保留。
 *
 * @param paths - 片段，必须是 string 或 number
 * @returns 拼接后的 URL / 路径
 * @throws {Error} 片段不是 string 或 number
 *
 * @example
 * ```ts
 * urlJoin('http://x.com/', 'foo/bar', '?a=1'); // 'http://x.com/foo/bar?a=1'
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

  let prefix: string;
  const firstPath = `${paths[0]}`;
  // 协议相对 URL 的 authority 留在片段列表里，它不是路径段，`..` 不得把它弹掉
  let protectedSegments = 0;

  if (firstPath.startsWith('//')) {
    prefix = '//';
    protectedSegments = 1;
  } else if (firstPath.startsWith('/')) {
    prefix = '/';
  } else {
    if (firstPath.startsWith('file:') && paths.length > 1 && (firstPath + paths[1]).match(/^file:\/\/\//)) {
      prefix = firstPath.replace(regPrefix, '$1:///');
    } else {
      prefix = firstPath.replace(regPrefix, '$1://');
    }
    paths.shift();
  }

  if (prefix && !prefix.endsWith('/')) {
    prefix += '/';
  }

  const pathStr = normalizeSegments(
    paths
      .map(path => stripTrailingSlash(`${path}`.replace(/^\/+/, '').replace(/^\.\/+/, '')))
      .filter(d => d !== '')
      .join('/'),
    prefix,
    protectedSegments
  );

  let backStr = prefix + pathStr;
  if (backStr.includes('?')) {
    const parts = backStr.split('?').filter(d => d !== '');
    backStr = parts.shift() + '?';
    if (parts.length > 0) {
      backStr += parts.join('&');
    }
  }

  return backStr.replace(/\/(\?|&|#[^!])/g, '$1');
};
