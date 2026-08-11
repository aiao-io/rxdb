/**
 * 检查值是否为纯对象（通过Object构造函数创建的普通对象）
 * 排除数组、日期、正则表达式、Map、Set等特殊对象
 *
 * @param object - 要检查的值
 * @returns 如果值是纯对象则返回true，否则返回false
 * @example
 * isPlainObject({}); // 返回 true（空对象）
 * @example
 * isPlainObject({ name: 'John', age: 30 }); // 返回 true（带属性的普通对象）
 * @example
 * isPlainObject(new Object()); // 返回 true（通过Object构造函数创建的对象）
 * @example
 * isPlainObject([]); // 返回 false（数组不是纯对象）
 * @example
 * isPlainObject(new Date()); // 返回 false（日期对象不是纯对象）
 * @example
 * isPlainObject(null); // 返回 false（null不是对象）
 * @example
 * isPlainObject(Object.create(null)); // 返回 true（原型为null的对象视为纯对象）
 * @example
 * isPlainObject(new Map()); // 返回 false（Map对象不是纯对象）
 * **注意：** 函数通过检查 toString 标签和原型链来判断是否为纯对象
 * **注意：** 与 isObject 的区别：isObject 包含所有对象类型，而 isPlainObject 仅包含普通对象
 * **注意：** 原型为 null 的对象（Object.create(null)）也被视为纯对象
 */
export function isPlainObject(object: unknown): object is object {
  if (Object.prototype.toString.call(object) !== '[object Object]') {
    return false;
  }

  const prototype = Object.getPrototypeOf(object);
  return prototype === null || prototype === Object.prototype;
}
