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
