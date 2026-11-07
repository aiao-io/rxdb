import { decimalFromCanonical, decimalToCanonical, roundToDecimalPlaces } from '@aiao/rxdb-plugin-bom';

/** 展示小数位数；省略尾零适用于单位成本和数量。 */
export interface DecimalFormatOptions {
  fractionDigits: number;
  trimTrailingZeros?: boolean;
}

/** 按偶数舍入规则展示十进制原值，金额全程不经过浮点数。 */
export const formatDecimal = (value: string, options: DecimalFormatOptions): string => {
  const { fractionDigits, trimTrailingZeros = false } = options;
  if (fractionDigits < 0 || fractionDigits % 1 !== 0) throw new RangeError('小数位数必须是非负整数');
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new TypeError('只接受普通十进制字符串');

  const canonical = decimalToCanonical(roundToDecimalPlaces(decimalFromCanonical(value), fractionDigits));
  const negative = canonical.startsWith('-');
  const [whole, fraction = ''] = (negative ? canonical.slice(1) : canonical).split('.');
  const rounded = fraction.padEnd(fractionDigits, '0');
  const decimals = trimTrailingZeros ? rounded.replace(/0+$/, '') : rounded;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${decimals === '' ? '' : `.${decimals}`}`;
};
