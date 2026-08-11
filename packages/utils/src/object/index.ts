/**
 * @fileoverview 对象操作工具模块
 *
 * @module object
 */

/**
 * 深拷贝
 */
export * from './cloneDeep.js';

/**
 * 生成查询选项的比较 key，游标实体按 orderBy 字段投影
 */
export * from './createQueryOptionsKey.js';

/**
 * 生成内容稳定的比较 key
 */
export * from './createStableKey.js';

/**
 * 深度冻结对象
 */
export { deepFreeze } from './deepFreeze.js';

/**
 * 将扁平路径对象转换为普通对象
 */
export * from './flattenPathObjectToPlainObject.js';

/**
 * 安全获取对象属性值
 */
export * from './get.js';

/**
 * 检查对象是否有指定属性
 */
export * from './has.js';

/**
 * 判断两个值是否相等
 */
export * from './isEqual.js';

/**
 * 判断两个 Date 对象是否相等
 */
export * from './isEqualDate.js';

/**
 * 判断两个 Uint8Array 是否相等
 */
export * from './isEqualUint8Array.js';

/**
 * 排除指定属性
 */
export * from './omit.js';

/**
 * 根据条件排除属性
 */
export * from './omitBy.js';

/**
 * 选取指定属性
 */
export * from './pick.js';

/**
 * 根据条件选取属性
 */
export * from './pickBy.js';

/**
 * 将普通对象转换为扁平路径对象
 */
export * from './plainObjectToFlattenPathObject.js';

/**
 * 设置对象属性值
 */
export * from './set.js';

/**
 * 使用访问路径设置对象属性值
 */
export * from './setWith.js';

/**
 * 转换为普通对象（去除 Proxy）
 */
export * from './toPlainObject.js';

/**
 * 将两个数组合并为对象
 */
export * from './zipObject.js';
