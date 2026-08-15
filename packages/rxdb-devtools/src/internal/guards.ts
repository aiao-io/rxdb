/**
 * @fileoverview 跨协议版本共用的基础类型守卫。
 *
 * @remarks
 * v1（`types.ts`）与 v2（`v2/`）共用同一套底层判定。这些函数**不从包入口导出**：
 * 它们是实现细节，不是公开 API 表面。之所以单独成模块而不是各版本各写一份，是因为
 * 「多一个键就整条消息判非法」这条语义一旦两处实现漂移，两个协议版本对同一条 wire
 * 会给出不同结论，而这种分叉不会有任何一侧报错。
 *
 * @module @aiao/rxdb-devtools/internal/guards
 */

/** 判断值是不是普通对象（排除 `null` 与数组）。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断对象的键集合是否**恰好**由必填键与可选键构成。
 *
 * @remarks
 * 「恰好」是关键：多出任何一个键都返回 `false`。宽松匹配会让攻击者在合法消息上挂载
 * 额外字段穿过 guard，也会让协议演进时新旧两端对同一条消息的理解静默分叉。
 *
 * @param value - 待检查对象。
 * @param requiredKeys - 必须全部出现的键。
 * @param optionalKeys - 允许出现、但不强制的键。
 * @returns 键集合完全合规时为 `true`。
 */
export function hasExactKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): boolean {
  const allowedKeys = [...requiredKeys, ...optionalKeys];
  return (
    requiredKeys.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => allowedKeys.includes(key))
  );
}

/** 判断值是不是非负 safe integer（拒绝 NaN、Infinity、小数、数字字符串）。 */
export function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** 判断值是不是正 safe integer。 */
export function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

/** 判断值是不是去掉首尾空白后仍非空的字符串。 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
