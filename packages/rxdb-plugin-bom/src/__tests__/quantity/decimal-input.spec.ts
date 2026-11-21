/**
 * @fileoverview 十进制入口规范化的指数上限（US-511 十进制值合同的入口段）
 *
 * 指数写法在展开前按 decimal128 的指数范围（±6144）拒绝：外部载荷（导入 / 公式参数）里的
 * `1e1000000000` 不得展开成 GB 级字符串，统一以 BomDecimalFormatError 点名字段。
 */

import { describe, expect, it } from 'vitest';
import { normalizeDecimalString } from '../../decimal.utils.js';
import { BomDecimalFormatError } from '../../types.js';

const rejection = (input: string): unknown => {
  try {
    normalizeDecimalString(input, 'qty');
    return null;
  } catch (error) {
    return error;
  }
};

describe('十进制入口：指数上限', () => {
  it('超大正 / 负指数在展开前拒绝，抛 BomDecimalFormatError 并点名字段', () => {
    for (const input of ['1e1000000000', '1E-1000000000', '1e99999999999999999999999', '0.5e+6145', '7e-6145']) {
      const error = rejection(input);
      expect(error, input).toBeInstanceOf(BomDecimalFormatError);
      expect((error as BomDecimalFormatError).field, input).toBe('qty');
      expect(String((error as Error).message), input).toContain('6144');
    }
  });

  it('上限边界内照常展开：负向 1e-6144 接受；正向幅值仍由 34 位规则把关（1e33 接受、1e6144 按位数拒绝）', () => {
    expect(normalizeDecimalString('1e-6144', 'qty')).toBe(`0.${'0'.repeat(6143)}1`);
    expect(normalizeDecimalString('1e33', 'qty')).toBe(`1${'0'.repeat(33)}`);
    const wide = rejection('1e6144');
    expect(wide).toBeInstanceOf(BomDecimalFormatError);
    expect(String((wide as Error).message)).toContain('34 位有效数字');
  });

  it('常规指数写法不受影响', () => {
    expect(normalizeDecimalString('1.5E-3', 'qty')).toBe('0.0015');
    expect(normalizeDecimalString('2.50e+2', 'qty')).toBe('250');
  });
});
