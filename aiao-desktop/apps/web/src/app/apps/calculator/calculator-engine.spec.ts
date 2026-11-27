import { describe, expect, it } from 'vitest';

import { CALC_RESET, CalcKey, CalcState, calcKeysOfText, pressCalc } from './calculator-engine';

/** 把一串按键依次按下去。 */
const press = (state: CalcState, keys: string): CalcState =>
  [...keys].reduce((current, key) => pressCalc(current, key as CalcKey), state);

describe('百分比语义（与 macOS 对齐）', () => {
  it('算式中按 % 取累计值的百分比：200+10% 显示 20，等于给出 220', () => {
    const at = press(CALC_RESET, '200+10%');
    expect(at.cur).toBe('20');
    expect(pressCalc(at, 'eq').cur).toBe('220');
  });

  it('50×10% 显示 5，等于给出 250', () => {
    const at = press(CALC_RESET, '50*10%');
    expect(at.cur).toBe('5');
    expect(pressCalc(at, 'eq').cur).toBe('250');
  });

  it('200-10% 显示 20，等于给出 180', () => {
    const at = press(CALC_RESET, '200-10%');
    expect(at.cur).toBe('20');
    expect(pressCalc(at, 'eq').cur).toBe('180');
  });

  it('单独按 % 仍是 ÷100', () => {
    expect(press(CALC_RESET, '50%').cur).toBe('0.5');
    expect(press(CALC_RESET, '7%').cur).toBe('0.07');
  });

  it('百分比之后输入数字会替换百分比值', () => {
    const at = press(CALC_RESET, '200+10%');
    expect(pressCalc(at, 'n5').cur).toBe('5');
  });
});

describe('calcKeysOfText 粘贴文本转按键', () => {
  it('数字、小数点与逗号可以回放，其余字符跳过', () => {
    expect(calcKeysOfText('3.14')).toEqual(['n3', 'dot', 'n1', 'n4']);
    expect(calcKeysOfText('1,000')).toEqual(['n1', 'dot', 'n0', 'n0', 'n0']);
    expect(calcKeysOfText('a 1+2')).toEqual(['n1', 'n2']);
  });

  it('没有数字时为空', () => {
    expect(calcKeysOfText('abc')).toEqual([]);
    expect(calcKeysOfText('')).toEqual([]);
  });
});
