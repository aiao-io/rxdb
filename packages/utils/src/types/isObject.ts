/**
 * 检查值是否为纯对象（通过Object构造函数创建的对象）
 * 排除数组、null、日期、正则表达式等特殊对象
 *
 * @param value - 要检查的值
 * @returns 如果值是纯对象则返回true，否则返回false
 * @example
 * isObject({}); // 返回 true
 * @example
 * isObject({ a: 1 }); // 返回 true
 * @example
 * isObject([]); // 返回 false（数组不是纯对象）
 * @example
 * isObject(null); // 返回 false（null不是对象）
 * @example
 * isObject(new Date()); // 返回 false（日期对象不是纯对象）
 * @example
 * isObject(Object.create(null)); // 返回 false（没有constructor属性）
 * **注意：** 此函数使用value.constructor === Object进行判断，因此不识别通过Object.create(null)创建的对象
 * **注意：** 与isObjectLike的区别：isObjectLike仅检查值是否为非null的对象，而isObject还要求是通过Object构造函数创建的
 */
export const isObject = (value: unknown): value is object => !!value && value.constructor === Object;
