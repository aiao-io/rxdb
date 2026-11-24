/**
 * 聚焦搜索的纯查询逻辑：算式求值、单位换算与路径尾段，不依赖 DOM 与服务，供聚焦搜索组件与单测直接使用。
 * 算式解析是手写的递归下降解析器，绝不用 `eval`。
 */

/** 单位换算的结果。 */
export interface UnitConversion {
  /** 完整的一句话结果，例如 `100 km = 62.137119 mi`。 */
  readonly text: string;
  /** 换算前的数值。 */
  readonly source: number;
  /** 输入里写的来源单位（小写）。 */
  readonly fromUnit: string;
  /** 输入里写的目标单位（小写）。 */
  readonly toUnit: string;
}

/** 算式只允许数字、四则、百分号、幂、括号、乘除别名（× ÷）与空白。 */
const MATH_QUERY = /^[\d+\-*×÷/().%\s^]+$/;

/** 换算句式：`100km to mi`、`32 c in fahrenheit`、`1kg = lb`。逗号千分位允许。 */
const CONVERSION_QUERY = /^(\d[\d.,]*)\s*([a-zA-Z]+)\s*(?:to|in|=|->)\s*([a-zA-Z]+)$/i;

/** 长度单位相对米的倍数。 */
const LENGTH_UNITS: Readonly<Record<string, number>> = {
  m: 1,
  meter: 1,
  meters: 1,
  metre: 1,
  metres: 1,
  km: 1000,
  kilometer: 1000,
  kilometers: 1000,
  kilometre: 1000,
  kilometres: 1000,
  cm: 0.01,
  centimeter: 0.01,
  centimeters: 0.01,
  centimetre: 0.01,
  centimetres: 0.01,
  mm: 0.001,
  millimeter: 0.001,
  millimeters: 0.001,
  millimetre: 0.001,
  millimetres: 0.001,
  mi: 1609.344,
  mile: 1609.344,
  miles: 1609.344,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254,
  yd: 0.9144,
  yard: 0.9144,
  yards: 0.9144
};

/** 重量单位相对千克的倍数。 */
const WEIGHT_UNITS: Readonly<Record<string, number>> = {
  kg: 1,
  kilogram: 1,
  kilograms: 1,
  g: 0.001,
  gram: 0.001,
  grams: 0.001,
  mg: 0.000001,
  milligram: 0.000001,
  milligrams: 0.000001,
  lb: 0.45359237,
  lbs: 0.45359237,
  pound: 0.45359237,
  pounds: 0.45359237,
  oz: 0.028349523125,
  ounce: 0.028349523125,
  ounces: 0.028349523125,
  st: 6.35029318,
  stone: 6.35029318
};

/** 温度单位集合（走专用公式，不走线性表）。 */
const TEMPERATURE_UNITS: Readonly<Record<string, true>> = {
  c: true,
  celsius: true,
  f: true,
  fahrenheit: true,
  k: true,
  kelvin: true
};

type MathToken =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'op'; readonly op: '+' | '-' | '*' | '/' | '^' }
  | { readonly kind: 'pct' }
  | { readonly kind: 'paren'; readonly close: boolean };

/** 解析树里的一个值；`percent` 表示它带百分号（真计算器的 `+ 10%` 语义在加减里按「前值的百分之几」处理）。 */
interface MathValue {
  readonly value: number;
  readonly percent: boolean;
}

interface MathParse {
  readonly value: MathValue;
  readonly next: number;
}

type MathParseResult = MathParse | null;

/**
 * 求值一个算式：四则、百分号（后置，`50%` = 0.5，`200 + 10%` = 220）、幂（右结合，`2^3^2` = 512）与括号；
 * 支持 `×` `÷` 别名与一元正负号。不是合法算式（含除零、溢出）时为 `null`。
 */
export function calculateExpression(input: string): number | null {
  if (!MATH_QUERY.test(input) || !/\d/.test(input)) return null;
  const tokens = tokenizeMath(input);
  if (!tokens.length) return null;
  const parsed = parseExpression(tokens, 0);
  if (!parsed || parsed.next !== tokens.length) return null;
  return Number.isFinite(parsed.value.value) ? parsed.value.value : null;
}

/** 把数字格式化成至多 `maxDecimals` 位小数的字符串，去掉多余的尾零与浮点噪声。 */
export function formatNumber(value: number, maxDecimals = 10): string {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(maxDecimals)));
}

/**
 * 解析一句单位换算（长度、重量走公制基准换算，温度走摄氏/华氏/开氏公式）。
 * 句式：数值 + 单位 + `to`/`in`/`=`/`->` + 目标单位（例：`100km to mi`、`32 c in fahrenheit`）。
 * 单位不认识、跨类别（如 `1 km to kg`）或同单位时为 `null`。
 */
export function convertQuery(input: string): UnitConversion | null {
  const match = CONVERSION_QUERY.exec(input.trim());
  if (!match) return null;
  const source = Number(match[1].replaceAll(',', ''));
  if (!Number.isFinite(source)) return null;
  const from = match[2].toLowerCase();
  const to = match[3].toLowerCase();
  if (from === to) return null;
  const result = convertLinear(source, from, to, LENGTH_UNITS) ?? convertLinear(source, from, to, WEIGHT_UNITS);
  if (result !== null) {
    return { text: `${formatNumber(source)} ${from} = ${result} ${to}`, source, fromUnit: from, toUnit: to };
  }
  if (TEMPERATURE_UNITS[from] !== true || TEMPERATURE_UNITS[to] !== true) return null;
  const kelvin = toKelvin(source, from);
  const converted = kelvin === null ? null : fromKelvin(kelvin, to);
  if (converted === null) return null;
  return {
    text: `${formatNumber(source)} ${from} = ${formatNumber(converted, 6)} ${to}`,
    source,
    fromUnit: from,
    toUnit: to
  };
}

/** 路径数组里去掉末段（节点自己）之后的尾段目录，如 `Macintosh HD / Users / a / Docs / f.txt` → `a / Docs`。 */
export function folderTail(path: readonly string[], depth = 2): string {
  return path.slice(0, -1).slice(-depth).join(' / ');
}

const tokenizeMath = (input: string): MathToken[] => {
  const tokens: MathToken[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i++;
      continue;
    }
    const digit = ch >= '0' && ch <= '9';
    const dotStart = ch === '.' && i + 1 < input.length && input[i + 1] >= '0' && input[i + 1] <= '9';
    if (digit || dotStart) {
      const start = i;
      while (i < input.length && ((input[i] >= '0' && input[i] <= '9') || input[i] === '.')) i++;
      const value = Number(input.slice(start, i));
      if (!Number.isFinite(value)) return [];
      tokens.push({ kind: 'num', value });
      continue;
    }
    switch (ch) {
      case '+':
      case '-':
      case '*':
      case '/':
      case '^':
        tokens.push({ kind: 'op', op: ch });
        break;
      case '×':
        tokens.push({ kind: 'op', op: '*' });
        break;
      case '÷':
        tokens.push({ kind: 'op', op: '/' });
        break;
      case '%':
        tokens.push({ kind: 'pct' });
        break;
      case '(':
        tokens.push({ kind: 'paren', close: false });
        break;
      case ')':
        tokens.push({ kind: 'paren', close: true });
        break;
      default:
        return [];
    }
    i++;
  }
  return tokens;
};

/** `expr := term (('+' | '-') term)*`；右边的项带百分号时按「左边值的百分之几」处理（真计算器语义）。 */
const parseExpression = (tokens: readonly MathToken[], pos: number): MathParseResult => {
  let left = parseTerm(tokens, pos);
  if (!left) return null;
  while (left.next < tokens.length) {
    const token: MathToken = tokens[left.next];
    if (token.kind !== 'op' || (token.op !== '+' && token.op !== '-')) break;
    const right = parseTerm(tokens, left.next + 1);
    if (!right) return null;
    const addend = right.value.percent ? left.value.value * right.value.value : right.value.value;
    const value: number = token.op === '+' ? left.value.value + addend : left.value.value - addend;
    left = { value: { value, percent: false }, next: right.next };
  }
  return left;
};

/** `term := factor (('*' | '/') factor)*`；百分比在乘法里就是除以 100，只有孤立的带百分号因子才把标记传给加减。 */
const parseTerm = (tokens: readonly MathToken[], pos: number): MathParseResult => {
  let left = parseFactor(tokens, pos);
  if (!left) return null;
  let consumed = false;
  while (left.next < tokens.length) {
    const token: MathToken = tokens[left.next];
    if (token.kind !== 'op' || (token.op !== '*' && token.op !== '/')) break;
    consumed = true;
    const right = parseFactor(tokens, left.next + 1);
    if (!right) return null;
    const value: number =
      token.op === '*' ? left.value.value * right.value.value : left.value.value / right.value.value;
    left = { value: { value, percent: false }, next: right.next };
  }
  return { value: { value: left.value.value, percent: consumed ? false : left.value.percent }, next: left.next };
};

/** `factor := unary ('%')*`；后置百分号每个除以 100。 */
const parseFactor = (tokens: readonly MathToken[], pos: number): MathParseResult => {
  const power = parseUnary(tokens, pos);
  if (!power) return null;
  let value = power.value.value;
  let percent = power.value.percent;
  let next = power.next;
  while (next < tokens.length && tokens[next].kind === 'pct') {
    value /= 100;
    percent = true;
    next++;
  }
  return { value: { value, percent }, next };
};

/** `unary := ('+' | '-') unary | power`；负号比幂更松，`-2^2` = -4。 */
const parseUnary = (tokens: readonly MathToken[], pos: number): MathParseResult => {
  if (pos < tokens.length && tokens[pos].kind === 'op' && (tokens[pos].op === '-' || tokens[pos].op === '+')) {
    const sign = tokens[pos].op === '-' ? -1 : 1;
    const inner = parseUnary(tokens, pos + 1);
    if (!inner) return null;
    return { value: { value: sign * inner.value.value, percent: inner.value.percent }, next: inner.next };
  }
  return parsePower(tokens, pos);
};

/** `power := atom ('^' unary)?`；幂右结合。 */
const parsePower = (tokens: readonly MathToken[], pos: number): MathParseResult => {
  const base = parseAtom(tokens, pos);
  if (!base) return null;
  const operator = base.next < tokens.length ? tokens[base.next] : null;
  if (operator?.kind !== 'op' || operator.op !== '^') return base;
  const exponent = parseUnary(tokens, base.next + 1);
  if (!exponent) return null;
  return { value: { value: Math.pow(base.value.value, exponent.value.value), percent: false }, next: exponent.next };
};

/** `atom := 数字 | '(' expr ')'`。 */
const parseAtom = (tokens: readonly MathToken[], pos: number): MathParseResult => {
  const token = pos < tokens.length ? tokens[pos] : null;
  if (!token) return null;
  if (token.kind === 'num') return { value: { value: token.value, percent: false }, next: pos + 1 };
  if (token.kind === 'paren' && !token.close) {
    const inner = parseExpression(tokens, pos + 1);
    const close = inner && inner.next < tokens.length ? tokens[inner.next] : null;
    if (!inner || close?.kind !== 'paren' || !close.close) return null;
    return { value: { value: inner.value.value, percent: inner.value.percent }, next: inner.next + 1 };
  }
  return null;
};

/** 线性单位换算（公制基准）；单位不在同一张表里（含跨类别）时为 `null`。 */
const convertLinear = (
  value: number,
  from: string,
  to: string,
  units: Readonly<Record<string, number>>
): string | null => {
  const fromFactor = units[from];
  const toFactor = units[to];
  if (fromFactor === undefined || toFactor === undefined) return null;
  const result = (value * fromFactor) / toFactor;
  return Number.isFinite(result) ? formatNumber(result, 6) : null;
};

const toKelvin = (value: number, unit: string): number | null => {
  switch (unit) {
    case 'c':
    case 'celsius':
      return value + 273.15;
    case 'f':
    case 'fahrenheit':
      return ((value - 32) * 5) / 9 + 273.15;
    case 'k':
    case 'kelvin':
      return value;
    default:
      return null;
  }
};

const fromKelvin = (kelvin: number, unit: string): number | null => {
  switch (unit) {
    case 'c':
    case 'celsius':
      return kelvin - 273.15;
    case 'f':
    case 'fahrenheit':
      return ((kelvin - 273.15) * 9) / 5 + 32;
    case 'k':
    case 'kelvin':
      return kelvin;
    default:
      return null;
  }
};
