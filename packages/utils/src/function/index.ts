/**
 * @fileoverview 函数工具模块
 *
 * @module function
 */

/**
 * 防抖函数
 */
export { debounce } from './debounce.js';

/**
 * 空函数（noop = no operation）
 */
export { emptyFunction, emptyFunction as noop } from './emptyFunction.js';

/**
 * 单次执行函数
 */
export { once } from './once.js';

/**
 * 节流函数
 */
export { throttle } from './throttle.js';
