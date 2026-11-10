import { describe, expect, it } from 'vitest';
import { numberStep } from '../../number/numberStep.js';

describe('numberStrip', () => {
  it('1', () => {
    expect(numberStep(5, 3)).toEqual(6);
    expect(numberStep(6, 3)).toEqual(6);
    expect(numberStep(7, 3)).toEqual(9);
    expect(numberStep(7, 2.5)).toEqual(7.5);
  });
});

// value / step 的二进制误差会让已对齐的小数商略大于整数（0.28 / 0.01 = 28.000000000000004），
// Math.ceil 因而多进一整步；结果还带浮点尾巴（57 × 0.01 = 0.5700000000000001）。
describe('小数步长按十进制计算（RV-01a1bb4857607cf5b1c9381ef702fcdc）', () => {
  it.each([
    [0.07, 0.01, 0.07],
    [0.14, 0.01, 0.14],
    [0.28, 0.01, 0.28],
    [0.56, 0.01, 0.56],
    [1.1, 0.1, 1.1],
    [0.3, 0.1, 0.3]
  ])('已对齐的 %d 按步长 %d 保持 %d', (value, step, expected) => {
    expect(numberStep(value, step)).toBe(expected);
  });

  it.each([
    [0.2800001, 0.01, 0.29],
    [0.281, 0.01, 0.29],
    [0.561, 0.01, 0.57],
    [0.000001, 0.01, 0.01]
  ])('越过边界的 %d 按步长 %d 进到 %d，不带浮点尾巴', (value, step, expected) => {
    expect(numberStep(value, step)).toBe(expected);
  });

  it.each([
    [-0.28, 0.01, -0.28],
    [-0.285, 0.01, -0.28],
    [-7, 3, -6]
  ])('负数 %d 按步长 %d 向上取整到 %d', (value, step, expected) => {
    expect(numberStep(value, step)).toBe(expected);
  });

  it('指数形式的极小步长与大数', () => {
    expect(numberStep(3e-7, 1e-7)).toBe(3e-7);
    expect(numberStep(3.5e-7, 1e-7)).toBe(4e-7);
    expect(numberStep(1e21, 0.01)).toBe(1e21);
  });

  it('非有限值原样传递', () => {
    expect(numberStep(Infinity, 0.5)).toBe(Infinity);
    expect(numberStep(-Infinity, 0.5)).toBe(-Infinity);
    expect(numberStep(Number.NaN, 0.5)).toBeNaN();
  });
});
