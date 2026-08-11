import { AnyFunction } from '../types/index.js';

/**
 * 创建一个防抖函数，确保函数在最后一次调用后延迟指定时间才执行
 * 连续调用会重置计时器，适用于处理频繁触发的事件（如滚动、输入框输入）
 *
 * @template Func - 被防抖的函数类型
 * @param func - 需要防抖的函数
 * @param [waitMilliseconds=50] - 延迟执行的毫秒数，默认为50ms
 * @returns 防抖后的函数
 * @example
 * // 基础用法
 * const handleSearch = debounce((query: string) => {
 *   console.log('搜索:', query);
 * }, 300);
 * // 输入框变化时调用
 * input.addEventListener('input', (e) => handleSearch(e.target.value));
 * @example
 * // 带this上下文
 * const obj = {
 *   value: 10,
 *   getValue: debounce(function() {
 *     return this.value;
 *   })
 * };
 * **注意：** 防抖函数会忽略原始函数的返回值，因为它通过setTimeout异步执行
 * **注意：** 连续调用会重置延迟计时器，只有在停止调用后经过waitMilliseconds才会执行
 */
export const debounce = <Func extends AnyFunction>(
  func: Func,
  waitMilliseconds = 50
): ((this: ThisParameterType<Func>, ...args: Parameters<Func>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return function (this: ThisParameterType<Func>, ...args: Parameters<Func>) {
    const doLater = () => {
      timeoutId = undefined;
      func.apply(this, args);
    };
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(doLater, waitMilliseconds);
  };
};
