export type QueryValue = string | string[];

/**
 * 解析查询字符串，重复键聚合为字符串数组
 *
 * 返回对象以 `null` 为原型，因此 `__proto__` / `constructor` / `toString`
 * 等查询键只是普通数据键，既不会被原型链上的同名属性干扰，也无法篡改原型。
 *
 * @param query - 查询字符串
 * @returns 查询参数对象（原型为 `null`）
 */
export const queryParse = (query: string): Record<string, QueryValue> => {
  const result = Object.create(null) as Record<string, QueryValue>;
  const params = new URLSearchParams(query);
  params.forEach((value, key) => {
    // 用 hasOwn 判定「是否首次出现」：若沿用 `result[key] === undefined`，
    // 在普通对象上 `result['constructor']` 会读到 Object 构造函数，
    // 首次出现的值就会被错误地并进数组。
    if (!Object.hasOwn(result, key)) {
      result[key] = value;
      return;
    }
    const current = result[key];
    result[key] = Array.isArray(current) ? [...current, value] : [current, value];
  });
  return result;
};
