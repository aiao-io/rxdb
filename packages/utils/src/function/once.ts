/**
 * 创建一个只执行一次的函数，后续调用将返回第一次执行的结果
 * 适用于初始化函数、资源加载等只需要执行一次的场景
 *
 * @template F - 被包装的函数类型，必须是无参数函数
 * @param func - 需要限制只执行一次的函数
 * @returns 包装后的函数，与原函数类型相同
 * @example
 * // 基础用法
 * const initialize = once(() => {
 *   console.log('初始化');
 *   return '完成';
 * });
 * initialize(); // 输出 '初始化' 并返回 '完成'
 * initialize(); // 直接返回 '完成'，不执行函数体
 * @example
 * // 带返回值的场景
 * const getConfig = once(() => {
 *   return fetch('/config').then(res => res.json());
 * });
 * // 多次调用只会发起一次请求
 * getConfig();
 * getConfig();
 * **注意：** 该实现仅支持无参数函数，如需处理带参数的函数，请使用其他实现
 * **注意：** 第一次执行的结果会被缓存，后续调用返回相同结果
 */
export function once<F extends () => unknown>(func: F): F {
  let called = false; // 标记是否已执行
  let cache: ReturnType<F> | undefined; // 缓存第一次执行的结果
  return function () {
    if (called) {
      return cache;
    }
    const result = func() as ReturnType<F>;
    called = true;
    cache = result;
    return result;
  } as F;
}
