/**
 * @fileoverview 单位换算单测（US-511 阶段 A：AC#5 / AC#10 的换算面）
 *
 * 同量纲用 metric 标准系数；跨量纲只经行级 / 物料级显式换算率
 * （1 目标单位含多少源单位），缺换算率拒绝、不默认 1。
 */

import { describe, expect, it } from 'vitest';
import { convertUom } from '../../quantity/uom.js';
import { BomQuantityError } from '../../types.js';

describe('单位换算：同量纲标准系数（AC#5 的标准系数段）', () => {
  it('g → kg 与 kg → g', () => {
    expect(convertUom('1000', 'g', 'kg')).toBe('1');
    expect(convertUom('1', 'kg', 'g')).toBe('1000');
    expect(convertUom('250', 'g', 'kg')).toBe('0.25');
  });

  it('m → mm 与 cm → m', () => {
    expect(convertUom('1', 'm', 'mm')).toBe('1000');
    expect(convertUom('150', 'cm', 'm')).toBe('1.5');
  });

  it('同单位恒等', () => {
    expect(convertUom('3', 'pcs', 'pcs')).toBe('3');
  });

  it('34 位精度：换算不丢位', () => {
    expect(convertUom('1', 'kg', 'g')).toBe('1000');
    expect(convertUom('0.000000000000000000000000000000001', 'kg', 'g')).toBe('0.000000000000000000000000000001');
  });
});

describe('单位换算：显式换算率（AC#5 的跨量纲段）', () => {
  it('行级换算率：1 盒 = 4 件 → 4 件 ÷ 4 = 1 盒（AC#9 的行级覆盖）', () => {
    expect(convertUom('4', 'pcs', '盒', { lineRate: '4' })).toBe('1');
  });

  it('物料级换算率：1 盒 = 10 件 → 4 件 ÷ 10 = 0.4 盒（AC#9 的物料级口径）', () => {
    expect(convertUom('4', 'pcs', '盒', { itemRate: '10' })).toBe('0.4');
  });

  it('行级覆盖优先于物料级（AC#9）', () => {
    expect(convertUom('4', 'pcs', '盒', { lineRate: '4', itemRate: '10' })).toBe('1');
  });

  it('缺换算率跨量纲拒绝并点名（AC#10），不默认 1', () => {
    try {
      convertUom('1', 'm', 'kg');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BomQuantityError);
      expect(String((error as Error).message)).toContain('m');
      expect(String((error as Error).message)).toContain('kg');
    }
  });

  it('同量纲但不同词根（件 → 盒）无标准系数：同样拒绝', () => {
    expect(() => convertUom('1', 'pcs', '盒')).toThrow(BomQuantityError);
  });
});
