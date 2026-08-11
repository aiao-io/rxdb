import { isArray } from '../types/index.js';

/**
 * 创建一个对象，将键数组和值数组/函数配对组合
 * 支持多种值来源：固定值、值数组或值生成函数
 * @template K - 键的类型，必须是字符串、数字或符号
 * @template V - 值的类型
 * @param keys - 键数组
 * @param values - 值来源，可以是：
 *   - 固定值：所有键都使用相同的值
 *   - 值数组：按索引对应键赋值
 *   - 值生成函数：根据键和索引动态生成值
 * @returns 组合后的对象
 * @example
 * zipObject(['a', 'b'], [1, 2]); // 返回 { a: 1, b: 2 }
 * @example
 * zipObject(['a', 'b'], (key, idx) => key + idx); // 返回 { a: 'a0', b: 'b1' }
 * @example
 * zipObject(['a', 'b'], 'default'); // 返回 { a: 'default', b: 'default' }
 * @example
 * zipObject([], [1, 2]); // 返回 {}（空键数组）
 * @example
 * zipObject(['x', 'y'], [10]); // 返回 { x: 10, y: undefined }（值数组长度不足）
 * **注意：** 如果值数组长度小于键数组，多余的键值为 undefined
 * **注意：** 如果值生成函数抛出错误，会传播该错误
 * **注意：** 空键数组返回空对象
 */
export function zipObject<K extends string | number | symbol, V>(
  keys: K[],
  values: V | ((key: K, idx: number) => V) | V[]
): Record<K, V> {
  if (!keys || !keys.length) {
    return {} as Record<K, V>;
  }

  const isValueFactory = (value: unknown): value is (key: K, idx: number) => V => typeof value === 'function';
  const getValue =
    isValueFactory(values) ? values
    : isArray(values) ? (_k: K, i: number) => values[i]
    : () => values;

  return keys.reduce(
    (acc, key, idx) => {
      acc[key] = getValue(key, idx);
      return acc;
    },
    {} as Record<K, V>
  );
}
