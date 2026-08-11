import { AnyFunction } from '../types/index.js';

/**
 * 创建一个节流函数，确保函数在指定时间间隔内最多执行一次
 * 与防抖不同，节流会定期执行函数，而非等待最后一次调用后执行，适用于限制高频事件（如滚动、调整大小）的触发频率
 *
 * @template Func - 被节流的函数类型
 * @param func - 需要节流的函数
 * @param timeFrame - 时间间隔（毫秒），在此期间函数最多执行一次
 * @returns 节流后的函数
 * @example
 * // 基础用法
 * const handleScroll = throttle(() => {
 *   console.log('滚动位置:', window.scrollY);
 * }, 100);
 * window.addEventListener('scroll', handleScroll);
 * @example
 * // 带参数和this上下文
 * const logger = {
 *   prefix: 'Log:',
 *   log: throttle(function(message: string) {
 *     console.log(this.prefix, message);
 *   }, 200)
 * };
 * logger.log('Hello');
 * logger.log('World'); // 200ms内只会执行一次
 * **注意：** 节流函数会忽略在时间间隔内的调用，不累积执行
 * **注意：** 首次调用会立即执行，之后按时间间隔限制
 * **警告：** 确保timeFrame为正整数，否则可能导致意外行为
 */
export const throttle = <Func extends AnyFunction>(func: Func, timeFrame: number) => {
  let lastTime = 0;
  return function (this: ThisParameterType<Func>, ...args: Parameters<Func>) {
    const now = new Date().getTime();
    if (now - lastTime >= timeFrame) {
      func.apply(this, args);
      lastTime = now;
    }
  };
};
