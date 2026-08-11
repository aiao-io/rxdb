const readProperty = (value: unknown, key: string): unknown => Reflect.get(Object(value), key) as unknown;

/**
 * 「未命中」的哨兵
 *
 * 不能用真值性或 `result === obj` 表达未命中：前者会把 `0`/`false`/`''` 当成没读到，
 * 后者会把自引用当成没读到（UTL-013）。
 */
const NOT_FOUND = Symbol('get.NOT_FOUND');

/**
 * 安全读取点号、方括号或逗号分隔的嵌套路径
 *
 * 解析顺序：先把整个 `path` 当作**字面量键**（只按 `,[]` 切分，点号保留在键名里），
 * 命中则直接返回；未命中才回退到**嵌套路径**（按 `,[].` 切分）。
 * 因此 `get({ 'a.b': 1, a: { b: 2 } }, 'a.b')` 得到 `1`。
 *
 * 命中判定逐段用 `in`，与值本身无关：`0`、`false`、`''`、`NaN`
 * 以及等于根对象的自引用都算命中，只有**读到的值是 `undefined`**
 * 或路径中断（段不存在 / 中途为 `null`）才返回 `defaultValue`。
 *
 * @template T - 调用方期望的返回类型
 * @param obj - 要查询的值
 * @param path - 属性路径
 * @param defaultValue - 路径不存在时的默认值
 * @returns 路径值或默认值
 *
 * @example
 * ```ts
 * get({ a: [{ b: { c: 1 } }] }, 'a[0].b.c'); // 1
 * get({ 'a.b': 0 }, 'a.b', 'D'); // 0
 * get({ a: null }, 'a.b', 'D'); // 'D'
 * ```
 */
export const get = <T = unknown>(obj: unknown, path: string, defaultValue?: T): T => {
  const travel = (regexp: RegExp): unknown => {
    const keys = path.split(regexp).filter(Boolean);
    if (keys.length === 0) {
      return NOT_FOUND;
    }

    let current: unknown = obj;
    for (const key of keys) {
      if (current === null || current === undefined || !(key in Object(current))) {
        return NOT_FOUND;
      }
      current = readProperty(current, key);
    }
    return current;
  };

  const literal = travel(/[,[\]]+?/);
  const result = literal === NOT_FOUND ? travel(/[,[\].]+?/) : literal;
  return (result === NOT_FOUND || result === undefined ? defaultValue : result) as T;
};
