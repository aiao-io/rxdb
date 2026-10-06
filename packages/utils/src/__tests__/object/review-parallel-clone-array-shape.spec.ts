import { describe, expect, it } from 'vitest';
import { cloneDeep } from '../../object/cloneDeep.js';

describe('cloneDeep 保留数组索引结构', () => {
  it('稀疏数组保留长度、空洞和元素索引', () => {
    const input: string[] = new Array(3);
    input[2] = 'tail';
    const result = cloneDeep(input);

    expect(result).not.toBe(input);
    expect(result).toHaveLength(3);
    expect(Object.hasOwn(result, 0)).toBe(false);
    expect(Object.hasOwn(result, 1)).toBe(false);
    expect(result[2]).toBe('tail');
  });

  it('密集数组仍深拷贝元素并保留重复引用', () => {
    const shared = { value: 1 };
    const result = cloneDeep([shared, shared]);
    expect(result).toHaveLength(2);
    expect(result[0]).not.toBe(shared);
    expect(result[0]).toBe(result[1]);
  });

  it('数组自引用仍收敛到克隆后的数组', () => {
    const input: unknown[] = [];
    input.push(input);
    const result = cloneDeep(input);
    expect(result).not.toBe(input);
    expect(result[0]).toBe(result);
  });
});
