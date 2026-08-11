import { set } from './set.js';
import { setWith } from './setWith.js';

/**
 * 将扁平路径对象转换为嵌套普通对象
 *
 * @param value - 键为点号或数组路径的对象
 * @returns 转换后的嵌套对象
 */
export const flattenPathObjectToPlainObject = (value: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const path of Object.keys(value)) {
    if (/[^\]]*\[\d+\]/.test(path)) {
      set(result, path, value[path]);
    } else {
      setWith(result, path, value[path], Object);
    }
  }
  return result;
};
