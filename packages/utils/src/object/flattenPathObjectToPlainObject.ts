import { assertSafePath, isArrayIndex } from './object-path.js';

type Container = Record<string, unknown> | unknown[];

interface PathSegment {
  readonly key: string;
  /** 方括号里的规范下标：所在容器必须是数组；其余段（含 `.0`、`[01]`）所在容器必须是对象 */
  readonly isIndex: boolean;
}

const fail = (path: string, reason: string): TypeError =>
  new TypeError(`flattenPathObjectToPlainObject: 路径 "${path}" ${reason}`);

const OVERLAP = '与另一条路径重叠：同一位置不能既是叶子又是容器';

/**
 * 切分路径并记下每段是否写在方括号里
 *
 * 分段与 set 一致（`[` 作分隔符、删掉 `]`、丢弃空段），但容器类型要按语法定：
 * 只看段内容会把 `a.0[1]` 里的对象层 `0` 也建成数组，还原结果与扁平化前不一致。
 */
const parsePath = (path: string): PathSegment[] =>
  path
    .split('.')
    .flatMap(part => part.split('[').map((piece, index) => ({ key: piece.replaceAll(']', ''), bracketed: index > 0 })))
    .filter(({ key }) => key !== '')
    .map(({ key, bracketed }) => ({ key, isIndex: bracketed && isArrayIndex(key) }));

/**
 * 段与所在容器的类型必须一致
 *
 * 数组上写进的属性名不计入 length、JSON 也看不见，等于静默丢数据；
 * 根恒为普通对象（返回类型），根级下标同样无处安放。
 */
const assertFits = (container: Container, segment: PathSegment, path: string): void => {
  if (Array.isArray(container) !== segment.isIndex) {
    throw fail(path, `在段 "${segment.key}" 处数组 / 对象冲突：数组只收规范下标 [n]，对象（含根）只收属性名`);
  }
};

/**
 * 进入下一层容器，不存在则按下一段的语法创建
 *
 * 只进入本次创建的容器：已有的值是另一条路径的叶子（哪怕它本身是数组 / 对象），
 * 往里写会改动调用方传入的值，并让两条路径互相覆盖。
 */
const descend = (
  container: Container,
  segment: PathSegment,
  next: PathSegment,
  path: string,
  created: Set<unknown>
): Container => {
  assertFits(container, segment, path);
  const record = container as Record<string, unknown>;
  if (Object.hasOwn(record, segment.key)) {
    const existing = record[segment.key];
    if (!created.has(existing)) throw fail(path, OVERLAP);
    return existing as Container;
  }
  const child: Container = next.isIndex ? [] : {};
  created.add(child);
  record[segment.key] = child;
  return child;
};

const writePath = (root: Container, path: string, leaf: unknown, created: Set<unknown>): void => {
  const segments = parsePath(path);
  if (segments.length === 0) throw fail(path, '没有任何路径段，值无处写入');
  assertSafePath(segments.map(segment => segment.key));

  let container = root;
  for (let index = 0; index < segments.length - 1; index++) {
    container = descend(container, segments[index], segments[index + 1], path, created);
  }
  const last = segments[segments.length - 1];
  assertFits(container, last, path);
  if (Object.hasOwn(container, last.key)) throw fail(path, OVERLAP);
  (container as Record<string, unknown>)[last.key] = leaf;
};

/**
 * 将扁平路径对象转换为嵌套普通对象，是 {@link plainObjectToFlattenPathObject} 的逆运算
 *
 * 容器类型由路径语法决定：规范下标 `[n]` 所在的容器是数组，属性名（含 `a.0`、`a[01]`）
 * 所在的容器是对象；根恒为普通对象。路径之间互相矛盾时直接抛错，不静默丢数据。
 *
 * @param value - 键为点号或方括号路径的对象
 * @returns 转换后的嵌套对象
 * @throws {TypeError} 路径含 `__proto__` / `prototype` / `constructor` 段
 * @throws {TypeError} 路径为空，或根级段是数组下标（如 `[0]`）
 * @throws {TypeError} 同一容器混用下标与属性名（`a[0]` 与 `a.b`），或同一位置既是叶子又是容器（`a` 与 `a.b`）
 *
 * @example
 * ```ts
 * flattenPathObjectToPlainObject({ 'a.b[0]': 1, 'a.c.0': 2 }); // { a: { b: [1], c: { '0': 2 } } }
 * ```
 */
export const flattenPathObjectToPlainObject = (value: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  const created = new Set<unknown>();
  for (const path of Object.keys(value)) {
    writePath(result, path, value[path], created);
  }
  return result;
};
