import { setBase } from './set.js';

type MutableContainer = Record<string, unknown> | unknown[];

/**
 * 使用自定义容器工厂设置嵌套路径。
 *
 * @param object - 要修改的对象
 * @param path - 点号或方括号路径
 * @param value - 要设置的值
 * @param customFun - 中间路径不存在或不是容器时调用
 * @returns 原对象
 */
export function setWith<T extends object>(
  object: T,
  path: string,
  value: unknown,
  customFun: (currentValue: unknown, key: string, object: MutableContainer) => unknown
): T {
  return setBase(object, path, value, customFun);
}
