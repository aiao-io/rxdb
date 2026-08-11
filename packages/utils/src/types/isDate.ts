/**
 * 检查值是否为Date对象
 * 使用instanceof和Object.prototype.toString.call()两种方式进行判断
 *
 * @param value - 要检查的值
 * @returns 如果值是Date对象则返回true，否则返回false
 * @example
 * isDate(new Date()); // 返回 true
 * @example
 * isDate(new Date('2023-01-01')); // 返回 true
 * @example
 * isDate('2023-01-01'); // 返回 false（字符串不是Date对象）
 * @example
 * isDate(null); // 返回 false（null不是Date对象）
 * @example
 * isDate(undefined); // 返回 false（undefined不是Date对象）
 * @example
 * isDate({}); // 返回 false（普通对象不是Date对象）
 * @example
 * isDate(new Date('invalid date')); // 返回 true（即使是无效日期也是Date对象）
 * **注意：** 函数使用两种方式判断：instanceof和Object.prototype.toString.call()
 * **注意：** 对于无效日期（Invalid Date），函数仍返回true，因为它仍是Date对象
 * **注意：** 与isDateString的区别：此函数检查是否为Date对象，而非日期字符串
 */
export function isDate(value: unknown): value is Date {
  return (
    value instanceof Date || (typeof value === 'object' && Object.prototype.toString.call(value) === '[object Date]')
  );
}
