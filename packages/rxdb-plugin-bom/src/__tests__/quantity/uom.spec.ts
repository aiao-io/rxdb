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

  it('换算率为 0（写入期已拒，守卫上线前写入的存量值）：拒绝为数量违约并点名换算率与单位对，不以裸除零错误逃逸', () => {
    for (const [rates, level] of [
      [{ lineRate: '0', itemRate: '10' }, '行级'],
      [{ itemRate: '0' }, '物料级']
    ] as const) {
      const error = (() => {
        try {
          convertUom('4', 'pcs', '盒', rates);
          return null;
        } catch (cause) {
          return cause;
        }
      })();
      expect(error, level).toBeInstanceOf(BomQuantityError);
      expect(String((error as Error).message), level).toContain(`从 pcs 换算到 盒 的${level}换算率为 0`);
    }
  });
});

describe('单位换算：反向使用已声明的单位关系', () => {
  it('1kg含7m时，10kg直接乘7得到70m，不先对换算率求倒数', () => {
    expect(convertUom('10', 'kg', 'm', { lineRate: '7', direction: 'reverse' })).toBe('70');
  });

  it('反向关系仍按行级率覆盖物料级率', () => {
    expect(convertUom('10', 'kg', 'm', { lineRate: '2', itemRate: '3', direction: 'reverse' })).toBe('20');
    expect(convertUom('10', 'kg', 'm', { itemRate: '3', direction: 'reverse' })).toBe('30');
  });

  it('方向只作用于显式率，同单位与标准系数不受影响', () => {
    expect(convertUom('10', 'kg', 'kg', { lineRate: '7', direction: 'reverse' })).toBe('10');
    expect(convertUom('10', 'kg', 'g', { lineRate: '7', direction: 'reverse' })).toBe('10000');
    expect(convertUom('1', 'h', 'min', { lineRate: '7', direction: 'reverse' })).toBe('60');
  });

  it('反向换算也拒绝缺率、零率与时间量纲不兼容', () => {
    expect(() => convertUom('10', 'kg', 'm', { direction: 'reverse' })).toThrow(BomQuantityError);
    expect(() => convertUom('10', 'kg', 'm', { lineRate: '0', direction: 'reverse' })).toThrow(BomQuantityError);
    expect(() => convertUom('10', 'kg', 'm', { itemRate: '0', direction: 'reverse' })).toThrow(BomQuantityError);
    expect(() => convertUom('10', 'h', 'kg', { lineRate: '7', direction: 'reverse' })).toThrow(BomQuantityError);
  });
});
