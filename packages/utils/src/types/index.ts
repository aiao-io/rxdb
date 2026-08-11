/**
 * @fileoverview 类型判断工具模块
 *
 * @module types
 */

/**
 * 任意函数类型
 */
export * from './AnyFunction.js';

/**
 * 深度部分类型
 */
export * from './DeepPartial.js';

/**
 * 是否是数组
 */
export * from './isArray.js';

/**
 * 是否是 ArrayBuffer
 */
export * from './isArrayBuffer.js';

/**
 * 是否是布尔值
 */
export * from './isBoolean.js';

/**
 * 是否是 Date 对象
 */
export * from './isDate.js';

/**
 * 是否为空（null、undefined、空字符串、空对象、空数组）
 */
export * from './isEmpty.js';

/**
 * 是否是浮点数
 */
export { isFloat } from './isFloat.js';

/**
 * 是否是函数
 */
export * from './isFunction.js';

/**
 * 是否是整数
 */
export * from './isInt.js';

/**
 * 是否是整数数组
 */
export * from './isIntArray.js';

/**
 * 是否是 null 或 undefined
 */
export * from './isNil.js';

/**
 * 是否是数字
 */
export * from './isNumber.js';

/**
 * 是否是数字数组
 */
export * from './isNumberArray.js';

/**
 * 是否是普通对象
 */
export * from './isObject.js';

/**
 * 是否是类对象（具有 [[Get]] 和 [[Set]] 行为）
 */
export * from './isObjectLike.js';

/**
 * 是否是纯对象（通过对象字面量或 new Object() 创建）
 */
export * from './isPlainObject.js';

/**
 * 是否是原始类型（string、number、boolean、symbol、bigint、null、undefined）
 */
export { isPrimitive } from './isPrimitive.js';

/**
 * 是否是 Promise
 */
export * from './isPromise.js';

/**
 * 是否是正则表达式
 */
export { isRegExp } from './isRegExp.js';

/**
 * 是否是字符串
 */
export * from './isString.js';

/**
 * 是否是字符串数组
 */
export * from './isStringArray.js';

/**
 * 是否是 Symbol
 */
export * from './isSymbol.js';

/**
 * 是否是 Uint8Array
 */
export { isUint8Array } from './isUint8Array.js';

/**
 * Repository 查询类型守卫
 */
export * from './repository-query.js';
