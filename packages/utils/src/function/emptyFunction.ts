/**
 * 空函数，不执行任何操作
 * 常用作默认回调函数或占位符函数
 *
 * @returns {void}
 * @example
 * // 用作默认回调函数
 * function processData(data, callback = emptyFunction) {
 *   // 处理数据...
 *   callback();
 * }
 *
 * @example
 * // 用作占位符
 * const config = {
 *   onSuccess: emptyFunction,
 *   onError: emptyFunction
 * };
 */
export const emptyFunction = (): void => undefined;
