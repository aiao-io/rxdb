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

  const negative = value.startsWith('-');
  const [integer, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  let scaled = BigInt(integer + fraction.slice(0, fractionDigits).padEnd(fractionDigits, '0'));
  const discarded = fraction.slice(fractionDigits);
  const first = discarded.charAt(0);
  const aboveHalf = first > '5' || (first === '5' && /[1-9]/.test(discarded.slice(1)));
  if (aboveHalf || (first === '5' && scaled % 2n !== 0n)) scaled += 1n;

  const digits = scaled.toString().padStart(fractionDigits + 1, '0');
  const whole = fractionDigits === 0 ? digits : digits.slice(0, -fractionDigits);
  const rounded = fractionDigits === 0 ? '' : digits.slice(-fractionDigits);
  const decimals = trimTrailingZeros ? rounded.replace(/0+$/, '') : rounded;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative && scaled !== 0n ? '-' : ''}${grouped}${decimals === '' ? '' : `.${decimals}`}`;
};
