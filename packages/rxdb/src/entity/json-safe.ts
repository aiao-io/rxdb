/**
 * @packageDocumentation
 * JSON 形状判定的内部共享实现。
 *
 * @remarks
 * 字段描述解析器（`entity-field.utils.ts`）与值校验（`entity-value.utils.ts`）都要判断
 * 「这是不是一个纯 JSON 对象」。两边各写一份原型检查迟早会漂移，因此收在这里作为唯一真相源。
 * 本模块**不从包入口导出**：它是实现细节，不进 api-baseline。
 */

/** 判断是否为纯 JSON 对象：类实例、`Date`、`Uint8Array`、`Map` 与数组一律不算。 */
export const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * 递归路径上的祖先容器集合，用于识别循环引用。
 *
 * @remarks
 * 是「当前路径」而不是「已访问过」：`{ a: shared, b: shared }` 里同一个对象出现两次并不是环，
 * 按已访问集合判会把合法的 DAG 误判成不可序列化。
 */
export type JsonWalkPath = WeakSet<object>;

/**
 * 在递归路径上下钻一层容器，回溯时移除；容器已在路径上（循环引用）时改走 `onCycle`。
 *
 * @param container - 即将下钻的数组或记录
 * @param path - 当前递归路径
 * @param visit - 下钻动作，只在非循环时执行
 * @param onCycle - 命中循环时的产出；三个消费者的失败约定各不相同（返回 `false` / 返回哨兵 / 抛错）
 *
 * @remarks
 * 三个 JSON 遍历器（`assertJsonSafe`、`isStrictJsonValue`、`normalizeJsonValue`）共用这一份
 * 进出场纪律。各自再写一遍 `add` / `delete` 就会漏 `delete`——漏了不会报错，只会把合法 DAG
 * 静默判成循环，是最难在测试里看出来的那类分叉。
 */
export const walkJsonContainer = <T>(container: object, path: JsonWalkPath, visit: () => T, onCycle: () => T): T => {
  if (path.has(container)) return onCycle();
  path.add(container);
  const result = visit();
  path.delete(container);
  return result;
};
