import { isObject } from '../types/index.js';

type TraversedObject = Record<string, unknown>;
type Callback = (key: string, value: unknown, object: TraversedObject) => void;

const traverseObject = (object: TraversedObject, callback: Callback, activeObjects: WeakSet<object>): void => {
  activeObjects.add(object);
  for (const key of Object.keys(object)) {
    const value = object[key];
    callback(key, value, object);
    traverseObjectKeys(value, callback, activeObjects);
  }
  activeObjects.delete(object);
};

/**
 * 深度优先遍历普通对象中的所有自有键
 *
 * @param value - 要遍历的对象或数组
 * @param callback - 每个对象属性对应的回调
 * @param activeObjects - 当前递归路径中的对象集合
 */
export const traverseObjectKeys = (
  value: unknown,
  callback: Callback,
  activeObjects: WeakSet<object> = new WeakSet<object>()
): void => {
  if (Array.isArray(value)) {
    if (activeObjects.has(value)) return;
    activeObjects.add(value);
    value.forEach(item => traverseObjectKeys(item, callback, activeObjects));
    activeObjects.delete(value);
    return;
  }

  if (!isObject(value) || activeObjects.has(value)) return;
  traverseObject(value as TraversedObject, callback, activeObjects);
};
