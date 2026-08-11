import { describe, expect, it } from 'vitest';
import { randomUintByLength } from '../../random/randomUintByLength.js';

describe('randomUintByLength', () => {
  it('randomUintByLength', () => {
    for (let i = 0; i < 100; i++) {
      const str = randomUintByLength();
      // UTL-027：默认位数从 16 改为 15 —— 16 位随机数有很大概率超过
      // MAX_SAFE_INTEGER(9007199254740991)，parseInt 会静默丢精度。
      expect(`${str}`.length === 15).toBeTruthy();
    }
  });
});

// UTL-027：默认 16 位。MAX_SAFE_INTEGER 是 9007199254740991（16 位），
// 16 位随机数有很大概率超出它，parseInt 结果静默丢精度。
describe('UTL-027 安全整数边界', () => {
  it('默认参数产出的必须是安全整数', () => {
    for (let i = 0; i < 200; i++) {
      expect(Number.isSafeInteger(randomUintByLength())).toBe(true);
    }
  });

  it('length 超过 15 必须抛 RangeError 而不是静默丢精度', () => {
    expect(() => randomUintByLength(16)).toThrow(RangeError);
    expect(() => randomUintByLength(20)).toThrow(RangeError);
  });

  it('非法 length 抛 RangeError', () => {
    expect(() => randomUintByLength(0)).toThrow(RangeError);
    expect(() => randomUintByLength(-1)).toThrow(RangeError);
    expect(() => randomUintByLength(1.5)).toThrow(RangeError);
  });
});
