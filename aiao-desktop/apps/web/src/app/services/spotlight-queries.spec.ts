import { describe, expect, it } from 'vitest';

import { calculateExpression, convertQuery, folderTail, formatNumber } from './spotlight-queries';

describe('calculateExpression 四则与括号', () => {
  it('加减乘除与优先级', () => {
    expect(calculateExpression('2+2')).toBe(4);
    expect(calculateExpression('2*3+4')).toBe(10);
    expect(calculateExpression('10-2-3')).toBe(5);
    expect(calculateExpression('1/2')).toBe(0.5);
    expect(calculateExpression('10 / 2')).toBe(5);
  });

  it('括号改变优先级', () => {
    expect(calculateExpression('(2+3)*4')).toBe(20);
    expect(calculateExpression('((1+2))')).toBe(3);
  });

  it('乘除别名 × ÷ 与一元正负号', () => {
    expect(calculateExpression('2×3')).toBe(6);
    expect(calculateExpression('8÷4')).toBe(2);
    expect(calculateExpression('-5+3')).toBe(-2);
    expect(calculateExpression('+5')).toBe(5);
  });

  it('小数与前后空白', () => {
    expect(calculateExpression('.5+1')).toBe(1.5);
    expect(calculateExpression('  2 + 3  ')).toBe(5);
    expect(calculateExpression('0.1 + 0.2')).toBeCloseTo(0.3, 12);
  });

  it('非算式返回 null', () => {
    expect(calculateExpression('')).toBeNull();
    expect(calculateExpression('abc')).toBeNull();
    expect(calculateExpression('2+*3')).toBeNull();
    expect(calculateExpression('2 3')).toBeNull();
    expect(calculateExpression('(2+3')).toBeNull();
    expect(calculateExpression('2+3)')).toBeNull();
    expect(calculateExpression('1..2')).toBeNull();
    expect(calculateExpression('1,000')).toBeNull();
    expect(calculateExpression('10 % 3')).toBeNull();
    expect(calculateExpression('2**3')).toBeNull();
  });

  it('除零与溢出返回 null', () => {
    expect(calculateExpression('1/0')).toBeNull();
    expect(calculateExpression('0/0')).toBeNull();
    expect(calculateExpression('9999999999^999')).toBeNull();
  });
});

describe('calculateExpression 幂与百分号', () => {
  it('幂右结合，负号比幂松', () => {
    expect(calculateExpression('2^3')).toBe(8);
    expect(calculateExpression('2^3^2')).toBe(512);
    expect(calculateExpression('-2^2')).toBe(-4);
    expect(calculateExpression('(-2)^2')).toBe(4);
    expect(calculateExpression('2^0.5')).toBeCloseTo(Math.sqrt(2), 12);
  });

  it('后置百分号是除以 100', () => {
    expect(calculateExpression('50%')).toBe(0.5);
    expect(calculateExpression('10%%')).toBeCloseTo(0.001, 12);
    expect(calculateExpression('100 * 10%')).toBe(10);
    expect(calculateExpression('10% + 5')).toBeCloseTo(5.1, 12);
    expect(calculateExpression('(1+2)%')).toBeCloseTo(0.03, 12);
  });

  it('加减右侧带百分号时按左侧值的百分比处理', () => {
    expect(calculateExpression('200 + 10%')).toBe(220);
    expect(calculateExpression('200 - 10%')).toBe(180);
    expect(calculateExpression('100 - 25%')).toBe(75);
    expect(calculateExpression('5 + 10% + 2')).toBe(7.5);
    expect(calculateExpression('5 + (1+2)%')).toBeCloseTo(5.15, 12);
  });
});

describe('formatNumber 输出易读数字', () => {
  it('去掉浮点噪声与尾零', () => {
    expect(formatNumber(0.30000000000000004)).toBe('0.3');
    expect(formatNumber(1234.5678)).toBe('1234.5678');
    expect(formatNumber(100)).toBe('100');
    expect(formatNumber(-4)).toBe('-4');
    expect(formatNumber(89.6)).toBe('89.6');
  });

  it('按位数截断并四舍五入', () => {
    expect(formatNumber(62.13711922373339, 6)).toBe('62.137119');
    expect(formatNumber(2.20462262184878, 6)).toBe('2.204623');
  });

  it('非有限值返回空串', () => {
    expect(formatNumber(NaN)).toBe('');
    expect(formatNumber(Infinity)).toBe('');
  });

  it('极大极小值走指数或小数表示', () => {
    expect(formatNumber(1e21)).toBe('1e+21');
    expect(formatNumber(0.0000001)).toBe('1e-7');
  });
});

describe('convertQuery 单位换算', () => {
  it('长度换算', () => {
    expect(convertQuery('100km to mi')).toEqual({
      text: '100 km = 62.137119 mi',
      source: 100,
      fromUnit: 'km',
      toUnit: 'mi'
    });
    expect(convertQuery('1 mi to km')).toEqual({ text: '1 mi = 1.609344 km', source: 1, fromUnit: 'mi', toUnit: 'km' });
    expect(convertQuery('12 in to cm')).toEqual({ text: '12 in = 30.48 cm', source: 12, fromUnit: 'in', toUnit: 'cm' });
    expect(convertQuery('1m to ft')).toEqual({ text: '1 m = 3.28084 ft', source: 1, fromUnit: 'm', toUnit: 'ft' });
    expect(convertQuery('1 foot to inches')).toEqual({
      text: '1 foot = 12 inches',
      source: 1,
      fromUnit: 'foot',
      toUnit: 'inches'
    });
  });

  it('重量换算', () => {
    expect(convertQuery('1kg to lb')).toEqual({ text: '1 kg = 2.204623 lb', source: 1, fromUnit: 'kg', toUnit: 'lb' });
    expect(convertQuery('10 kg to g')).toEqual({ text: '10 kg = 10000 g', source: 10, fromUnit: 'kg', toUnit: 'g' });
    expect(convertQuery('1 stone to kg')).toEqual({
      text: '1 stone = 6.350293 kg',
      source: 1,
      fromUnit: 'stone',
      toUnit: 'kg'
    });
    expect(convertQuery('5.5 kg to g')).toEqual({ text: '5.5 kg = 5500 g', source: 5.5, fromUnit: 'kg', toUnit: 'g' });
  });

  it('温度换算', () => {
    expect(convertQuery('32c to f')).toEqual({ text: '32 c = 89.6 f', source: 32, fromUnit: 'c', toUnit: 'f' });
    expect(convertQuery('0c to f')).toEqual({ text: '0 c = 32 f', source: 0, fromUnit: 'c', toUnit: 'f' });
    expect(convertQuery('212 f to c')).toEqual({ text: '212 f = 100 c', source: 212, fromUnit: 'f', toUnit: 'c' });
    expect(convertQuery('100 f to k')).toEqual({
      text: '100 f = 310.927778 k',
      source: 100,
      fromUnit: 'f',
      toUnit: 'k'
    });
    expect(convertQuery('32 celsius to fahrenheit')).toEqual({
      text: '32 celsius = 89.6 fahrenheit',
      source: 32,
      fromUnit: 'celsius',
      toUnit: 'fahrenheit'
    });
  });

  it('逗号千分位与不同连接词', () => {
    expect(convertQuery('1,000 m to km')).toEqual({ text: '1000 m = 1 km', source: 1000, fromUnit: 'm', toUnit: 'km' });
    expect(convertQuery('1 km in mi')).toEqual({
      text: '1 km = 0.621371 mi',
      source: 1,
      fromUnit: 'km',
      toUnit: 'mi'
    });
    expect(convertQuery('100 km = mi')).toEqual({
      text: '100 km = 62.137119 mi',
      source: 100,
      fromUnit: 'km',
      toUnit: 'mi'
    });
  });

  it('单位不认识、跨类别或同单位返回 null', () => {
    expect(convertQuery('100km')).toBeNull();
    expect(convertQuery('abc to mi')).toBeNull();
    expect(convertQuery('100 km to xyz')).toBeNull();
    expect(convertQuery('100 km to kg')).toBeNull();
    expect(convertQuery('1 km to km')).toBeNull();
    expect(convertQuery('10 to')).toBeNull();
    expect(convertQuery('100 km')).toBeNull();
    expect(convertQuery('')).toBeNull();
  });
});

describe('folderTail 路径尾段', () => {
  it('默认取所在目录的两层', () => {
    expect(folderTail(['Macintosh HD', 'Users', 'jimmy', 'Documents', 'work', 'report.md'])).toBe('Documents / work');
    expect(folderTail(['Macintosh HD', 'Users', 'jimmy', 'a.txt'])).toBe('Users / jimmy');
  });

  it('目录不足两层时取剩下的', () => {
    expect(folderTail(['Macintosh HD', 'x'])).toBe('Macintosh HD');
    expect(folderTail(['Macintosh HD'])).toBe('');
    expect(folderTail([])).toBe('');
  });

  it('depth 参数控制层数', () => {
    const path = ['a', 'b', 'c', 'f.txt'];
    expect(folderTail(path, 1)).toBe('c');
    expect(folderTail(path, 3)).toBe('a / b / c');
  });
});
