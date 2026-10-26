import { describe, expect, it } from 'vitest';
import { rmbUppercase } from '../../string/rmb.js';

describe('rmb', () => {
  it('0', () => {
    expect(rmbUppercase(0)).toEqual('零元整');
  });
  it('1', () => {
    expect(rmbUppercase(1)).toEqual('壹元整');
  });
  it('10', () => {
    expect(rmbUppercase(10)).toEqual('壹拾元整');
  });
  it('20', () => {
    const rmb = rmbUppercase(20);
    expect(rmb).toEqual('贰拾元整');
  });

  it('101000', () => {
    const rmb = rmbUppercase(101000);
    expect(rmb).toEqual('壹拾万壹仟元整');
  });

  it('1010001000', () => {
    const rmb = rmbUppercase(1010001000);
    expect(rmb).toEqual('壹拾亿壹仟万壹仟元整');
  });

  it('1000001000', () => {
    const rmb = rmbUppercase(1000001000);
    expect(rmb).toEqual('壹拾亿零壹仟元整');
  });

  it('99254740991', () => {
    const rmb = rmbUppercase(99254740991);
    expect(rmb).toEqual('玖佰玖拾贰亿伍仟肆佰柒拾肆万零玖佰玖拾壹元整');
  });

  it('90080070080', () => {
    expect(rmbUppercase(90080070080)).toEqual('玖佰亿捌仟零柒万零捌拾元整');
  });

  it('90000000000', () => {
    expect(rmbUppercase(90000000000)).toEqual('玖佰亿元整');
  });

  it('壹京元整', () => {
    expect(rmbUppercase(10000000000000000)).toEqual('壹京元整');
  });

  it('壹京元整', () => {
    expect(rmbUppercase(10000000000000000)).toEqual('壹京元整');
  });

  it('MAX_SAFE_INTEGER', () => {
    // 9007199254740991
    expect(rmbUppercase(Number.MAX_SAFE_INTEGER)).toEqual('玖仟零柒兆壹仟玖佰玖拾贰亿伍仟肆佰柒拾肆万零玖佰玖拾壹元整');
  });

  it('万', () => {
    expect(rmbUppercase(Math.pow(10, 4))).toEqual('壹万元整');
  });

  it('亿', () => {
    expect(rmbUppercase(Math.pow(10, 8))).toEqual('壹亿元整');
  });

  it('兆', () => {
    expect(rmbUppercase(Math.pow(10, 12))).toEqual('壹兆元整');
  });

  it('京', () => {
    expect(rmbUppercase(Math.pow(10, 16))).toEqual('壹京元整');
  });

  it('垓', () => {
    expect(rmbUppercase(Math.pow(10, 20))).toEqual('壹垓元整');
  });

  it('垓', () => {
    expect(rmbUppercase(Math.pow(10, 22))).toEqual('壹佰垓元整');
  });

  it('max error', () => {
    return new Promise<void>((resolve, reject) => {
      try {
        const rmb = rmbUppercase(Math.pow(10, 27) + 1);
        reject(rmb);
      } catch {
        resolve();
      }
    });
  });

  it('0.1', () => {
    const rmb = rmbUppercase(0.1);
    expect(rmb).toEqual('壹角');
  });

  it('0.01', () => {
    const rmb = rmbUppercase(0.01);
    expect(rmb).toEqual('壹分');
  });

  it('0.001', () => {
    const rmb = rmbUppercase(0.001);
    expect(rmb).toEqual('壹厘');
  });

  it('20.1', () => {
    const rmb = rmbUppercase(20.1);
    expect(rmb).toEqual('贰拾元壹角');
  });

  it('20.01', () => {
    const rmb = rmbUppercase(20.01);
    expect(rmb).toEqual('贰拾元壹分');
  });

  it('20.11', () => {
    const rmb = rmbUppercase(20.11);
    expect(rmb).toEqual('贰拾元壹角壹分');
  });

  it('-20.11', () => {
    const rmb = rmbUppercase(-20.11);
    expect(rmb).toEqual('欠贰拾元壹角壹分');
  });
});

// UTL-016：`${num}`.split('.')[1] 在科学计数法下是 undefined
// （绝对值 < 1e-6 时 JS 用科学计数法表示），`Number('0.undefined')` → NaN，
// 最终输出里混入 'undefined'。
describe('UTL-016 非常规数值输入', () => {
  it('极小值不得输出 undefined', () => {
    const result = rmbUppercase(1e-7);
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('NaN');
  });

  it('非有限数必须抛错', () => {
    expect(() => rmbUppercase(Number.NaN)).toThrow(TypeError);
    expect(() => rmbUppercase(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('常规金额不受影响', () => {
    expect(rmbUppercase(0)).toBe('零元整');
    expect(rmbUppercase(100)).toContain('壹佰元');
  });
});

// 小数部分曾以浮点参与逐位取数：`Math.round(frac * 1000) / 1000` 再乘回去重新引入误差
// （0.59 → 伍角捌分），四舍五入到 1000 厘时的进位也在取整数部分之前被丢掉（0.9999 → 零元整）。
describe('分 / 厘按整数运算', () => {
  const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const FRACTION_UNITS = ['角', '分', '厘'];
  const fractionText = (li: number): string =>
    [Math.floor(li / 100), Math.floor(li / 10) % 10, li % 10]
      .map((value, index) => (value === 0 ? '' : DIGITS[value] + FRACTION_UNITS[index]))
      .join('');
  // 整数部分取已有用例锁定的写法，小数部分由整数「厘」直接拼出，作为独立对照
  const INTEGER_PARTS = [
    [0, ''],
    [20, '贰拾元'],
    [1000001000, '壹拾亿零壹仟元']
  ] as const;
  const AMOUNTS = INTEGER_PARTS.flatMap(([integer, prefix]) =>
    Array.from({ length: 999 }, (_, index) => ({
      value: Number(`${integer}.${String(index + 1).padStart(3, '0')}`),
      expected: prefix + fractionText(index + 1)
    }))
  );

  it('常见金额不受浮点噪声影响', () => {
    expect(rmbUppercase(0.59)).toBe('伍角玖分');
    expect(rmbUppercase(0.09)).toBe('玖分');
    expect(rmbUppercase(0.47)).toBe('肆角柒分');
    expect(rmbUppercase(0.995)).toBe('玖角玖分伍厘');
  });

  it('四舍五入到整元时向「元」进位', () => {
    expect(rmbUppercase(0.9999)).toBe('壹元整');
    expect(rmbUppercase(99.9996)).toBe('壹佰元整');
    expect(rmbUppercase(-0.9999)).toBe('欠壹元整');
  });

  it('三位小数以内的金额逐一还原', () => {
    const mismatches = AMOUNTS.filter(({ value, expected }) => rmbUppercase(value) !== expected);
    expect(mismatches).toEqual([]);
  });
});
