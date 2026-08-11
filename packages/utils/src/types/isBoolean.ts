/**
 * 检查值是否为布尔原始值。
 *
 * **只接纳原始值**：`new Boolean(false)` 返回 `false`。包装对象恒为 truthy、
 * 也不与 `false` 全等，若把它收窄成 `boolean`，`value === false` 恒假、
 * `if (value)` 恒真 —— 编译器认知与运行时语义相反（UTL-007）。
 * 需要同时接纳包装对象时改用 {@link isBooleanLike}。
 *
 * @param value - 要检查的值
 * @returns 是否为布尔原始值
 * @example
 * isBoolean(false);              // true
 * isBoolean(new Boolean(false)); // false
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** 持有 `[[BooleanData]]` 内部槽的包装对象。 */
export type BooleanObject = object & { valueOf(): boolean };

/**
 * 检查值是否为布尔原始值**或** `Boolean` 包装对象。
 *
 * 谓词收窄为 `boolean | BooleanObject`，调用方必须显式 `.valueOf()` 才能取到布尔值，
 * 因此不会出现「包装对象被当成原始 `false`」的静默错误。
 *
 * 按 `Object.prototype.toString` 标签判定而非调用 `value.valueOf()`：
 * 只有真正持有 `[[BooleanData]]` 的对象返回该标签，且 null 原型对象没有 `valueOf`，
 * 调用即 `TypeError`。
 *
 * @param value - 要检查的值
 * @returns 是否为布尔原始值或布尔包装对象
 * @example
 * const raw: unknown = new Boolean(false);
 * if (isBooleanLike(raw) && raw.valueOf() === false) { ... }
 */
export function isBooleanLike(value: unknown): value is boolean | BooleanObject {
  if (typeof value === 'boolean') return true;
  return Object.prototype.toString.call(value) === '[object Boolean]';
}
