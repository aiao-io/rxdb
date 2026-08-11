/**
 * 分数索引（Fractional Indexing）实现
 * 移植自 https://github.com/rocicorp/fractional-indexing v4.0.0（License: CC0）
 *
 * 分数索引是一种用于生成排序键的技术，可以在任意两个已存在的键之间插入新的键，
 * 常用于实现列表项的任意位置插入排序，如协同编辑中的项目排序。
 *
 * 每个键由「整数部分」与「小数部分」拼接而成，整数部分的首字符是一个长度标记
 * （head，取自 {@link generateKeyBetween} 的 `intDigits` 字母表），其余为数字。
 * 生成的键可直接用普通字典序比较排序。
 *
 * @example
 * // 基础用法
 * const key1 = generateKeyBetween(null, null); // 'a0'
 * const key2 = generateKeyBetween(key1, null); // 'a1'
 * const key3 = generateKeyBetween(key1, key2); // 'a0V'
 *
 * @example
 * // 在列表中插入项目
 * const items = ['a0', 'a2'];
 * const newKey = generateKeyBetween('a0', 'a2'); // 'a1'
 * // 现在可以插入到 'a0' 和 'a2' 之间
 */

/** base-62 数字字母表：0-9 + A-Z + a-z */
export const BASE_62_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * base-52 字母表：A-Z + a-z
 *
 * 这是省略 `digits` 时默认的头（head）字母表：前半段 A-Z 标记负长度，
 * 后半段 a-z 标记正长度，因此默认键保持经典的 `a0` / `Zz` 形态。
 * 当 `digits` 为奇数长度（无法自带偶数长度的头字母表）时，需显式传入本常量。
 */
export const BASE_52_DIGITS = BASE_62_DIGITS.slice(10);

type OrderKey = string | null | undefined;

/**
 * 每个字母表的「字符码 → 下标」缓存，把数字取值从 O(字母表长度) 的
 * `String.indexOf` 降为一次定长数组读取。键要求单字节（字符码 0-255），
 * 因此固定 256 项的表可覆盖所有可能的字符码。
 */
const digitIndexCache = new Map<string, Uint8Array>();

/**
 * 获取（并缓存）某个字母表的字符码查找表
 * @private
 */
function getDigitIndex(digits: string): Uint8Array {
  let lookup = digitIndexCache.get(digits);
  if (lookup === undefined) {
    lookup = new Uint8Array(256);
    for (let i = 0; i < digits.length; i++) {
      lookup[digits.charCodeAt(i)] = i;
    }
    digitIndexCache.set(digits, lookup);
  }
  return lookup;
}

/**
 * 生成两个小数部分之间的中点字符串
 *
 * `a` 可以是空串，`b` 为 null 或非空串；`b` 非 null 时要求 `a < b`（字典序）；
 * 两者都不允许以零结尾。
 * @private
 * @param a - 起始小数部分
 * @param b - 结束小数部分，可以为 null
 * @param digits - 数字字母表
 * @param lookup - digits 的字符码查找表
 * @returns 中点字符串
 * @throws 当 a >= b 或字符串以零结尾时抛出错误
 */
function midpoint(a: string, b: OrderKey, digits: string, lookup: Uint8Array): string {
  const zero = digits[0];

  if (b != null && a >= b) {
    throw new Error(`${a} >= ${b}`);
  }
  if (a.endsWith(zero) || (b && b.endsWith(zero))) {
    throw new Error('trailing zero');
  }

  if (b) {
    // 移除最长公共前缀，沿途用零补齐 a。b 无需补齐：遍历公共前缀时它不会先于 a 结束
    let n = 0;
    while ((a[n] || zero) === b[n]) {
      n++;
    }

    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n), digits, lookup);
    }
  }

  // 首位数字（或缺失数字）不同
  const digitA = a ? lookup[a.charCodeAt(0)] : 0;
  const digitB = b != null ? lookup[b.charCodeAt(0)] : digits.length;

  if (digitB - digitA > 1) {
    const midDigit = Math.round(0.5 * (digitA + digitB));
    return digits[midDigit];
  }

  // 首位数字连续
  if (b && b.length > 1) {
    return b.slice(0, 1);
  }

  // b 为 null 或长度为 1。例如 midpoint('49', '5') 返回 '4' + midpoint('9', null)，
  // 进而展开为 '4' + '9' + midpoint('', null)，即 '495'
  return digits[digitA] + midpoint(a.slice(1), null, digits, lookup);
}

/**
 * 根据头字符推算整数部分的长度
 *
 * `intDigits` 是一个按字符码升序排列的字母表：前半段是负长度头，后半段是正长度头
 * （默认的 A-Z / a-z 标记只是其中一种）。最外侧的字符标记最长的整数部分，
 * 跨越中点的两个字符标记最短的整数部分（长度 2）。
 * @private
 * @param head - 排序键的首字符
 * @param intDigits - 头字母表
 * @param intLookup - intDigits 的字符码查找表
 * @returns 整数部分的长度
 * @throws 当首字符不在头字母表内时抛出错误
 */
function getIntegerLength(head: string, intDigits: string, intLookup: Uint8Array): number {
  const i = intLookup[head.charCodeAt(0)];
  // 字母表外的字符码在 intLookup 中同样返回 0，因此需确认该字符确实位于下标 i
  if (intDigits[i] !== head) {
    throw new Error(`invalid order key head: ${head}`);
  }
  const half = intDigits.length / 2;
  return i < half ? half - i + 1 : i - half + 2;
}

/**
 * 获取排序键的整数部分
 * @private
 * @throws 当排序键短于其头字符声明的长度时抛出错误
 */
function getIntegerPart(key: string, intDigits: string, intLookup: Uint8Array): string {
  const integerPartLength = getIntegerLength(key[0], intDigits, intLookup);
  if (integerPartLength > key.length) {
    throw new Error(`invalid order key: ${key}`);
  }
  return key.slice(0, integerPartLength);
}

/**
 * 验证整数部分长度与其头字符相符
 * @private
 * @throws 当长度不符时抛出错误
 */
function validateInteger(int: string, intDigits: string, intLookup: Uint8Array): void {
  if (int.length !== getIntegerLength(int[0], intDigits, intLookup)) {
    throw new Error(`invalid integer part of order key: ${int}`);
  }
}

/**
 * 最小整数字符串的缓存，按 (intDigits, 零字符码) 两级索引。
 * 嵌套 Map 使查找可直接用 `intDigits` 字符串与原始字符码，
 * 避免每次调用都拼接组合键。
 */
const smallestIntegerCache = new Map<string, Map<number, string>>();

/**
 * 判断某个键是否为最小整数
 *
 * 最小整数是「最负的头字符」（intDigits 首字符，标记最长的整数部分）后跟全零数字。
 * 使用缓存避免反复构造同一个长字符串带来的 GC 压力。
 * @private
 */
function isSmallestInteger(key: string, digits: string, intDigits: string): boolean {
  let byDigit = smallestIntegerCache.get(intDigits);
  if (byDigit === undefined) {
    byDigit = new Map();
    smallestIntegerCache.set(intDigits, byDigit);
  }

  const zeroCode = digits.charCodeAt(0);
  let cached = byDigit.get(zeroCode);
  if (cached === undefined) {
    cached = intDigits[0] + digits[0].repeat(intDigits.length / 2);
    byDigit.set(zeroCode, cached);
  }
  return key === cached;
}

/**
 * 验证排序键格式
 * @private
 * @throws 当键为最小整数、头字符非法、长度不足或小数部分以零结尾时抛出错误
 */
function validateOrderKey(key: string, digits: string, intDigits: string, intLookup: Uint8Array): void {
  if (isSmallestInteger(key, digits, intDigits)) {
    throw new Error(`invalid order key: ${key}`);
  }

  // getIntegerPart 会在首字符非法或键过短时抛错，即便不需要结果也应调用它做这两项检查
  const integerPart = getIntegerPart(key, intDigits, intLookup);
  const fractionalPart = key.slice(integerPart.length);

  if (fractionalPart.endsWith(digits[0])) {
    throw new Error(`invalid order key: ${key}`);
  }
}

/**
 * 递增整数部分
 * @private
 * @returns 递增后的字符串；已是最大整数时返回 null
 */
function incrementInteger(
  x: string,
  digits: string,
  lookup: Uint8Array,
  intDigits: string,
  intLookup: Uint8Array
): string | null {
  validateInteger(x, intDigits, intLookup);

  const head = x[0];
  const zero = digits[0];

  // 从右向左遍历数字段，把已达上限的数字变成零（累积到 trailing），直到找到可以进位的那一位
  let trailing = '';
  for (let i = x.length - 1; i >= 1; i--) {
    const d = lookup[x.charCodeAt(i)] + 1;
    if (d === digits.length) {
      trailing = zero + trailing;
    } else {
      return head + x.slice(1, i) + digits[d] + trailing;
    }
  }

  // 进位溢出整个数字段，此时 trailing 已全为零
  const headIndex = intLookup[head.charCodeAt(0)];
  if (headIndex === intDigits.length - 1) {
    return null;
  }

  const nextHead = intDigits[headIndex + 1];
  // 头字符向最大方向移动一步，数字段随新头字符声明的整数长度伸缩
  const lengthDelta = getIntegerLength(nextHead, intDigits, intLookup) - getIntegerLength(head, intDigits, intLookup);
  return nextHead + resizeDigits(trailing, lengthDelta, zero);
}

/**
 * 递减整数部分
 * @private
 * @returns 递减后的字符串；已是最小整数时返回 null
 */
function decrementInteger(
  x: string,
  digits: string,
  lookup: Uint8Array,
  intDigits: string,
  intLookup: Uint8Array
): string | null {
  validateInteger(x, intDigits, intLookup);

  const head = x[0];
  const last = digits[digits.length - 1];

  // 从右向左遍历数字段，把下溢的数字变成最大数字（累积到 trailing），直到找到可以借位的那一位
  let trailing = '';
  for (let i = x.length - 1; i >= 1; i--) {
    const d = lookup[x.charCodeAt(i)] - 1;
    if (d === -1) {
      trailing = last + trailing;
    } else {
      return head + x.slice(1, i) + digits[d] + trailing;
    }
  }

  // 借位穿透整个数字段，此时 trailing 已全为最大数字
  const headIndex = intLookup[head.charCodeAt(0)];
  if (headIndex === 0) {
    return null;
  }

  const prevHead = intDigits[headIndex - 1];
  // 头字符向最小方向移动一步，数字段随新头字符声明的整数长度伸缩
  const lengthDelta = getIntegerLength(prevHead, intDigits, intLookup) - getIntegerLength(head, intDigits, intLookup);
  return prevHead + resizeDigits(trailing, lengthDelta, last);
}

/**
 * 按新旧头字符的整数长度差伸缩数字段
 * @private
 * @param trailing - 进位/借位后的数字段（全零或全为最大数字）
 * @param lengthDelta - 新头字符的整数长度减去旧头字符的整数长度
 * @param pad - 需要补长时填充的字符
 */
function resizeDigits(trailing: string, lengthDelta: number, pad: string): string {
  if (lengthDelta > 0) return trailing + pad;
  if (lengthDelta < 0) return trailing.slice(1);
  return trailing;
}

/**
 * 判断字符串的每个字符是否都严格大于前一个字符（升序，同时排除重复）
 * @private
 */
function isStrictlyAscending(s: string): boolean {
  for (let i = 1; i < s.length; i++) {
    if (s.charCodeAt(i - 1) >= s.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

/**
 * 判断字符串是否全为单字节字符（字符码 < 256）
 *
 * 键要求单字节，数字取值才能使用固定 256 项的查找表。
 * @private
 */
function isSingleByte(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 255) {
      return false;
    }
  }
  return true;
}

/** 已通过 {@link validateDigits} 的字母表。校验是纯函数且结果不变，故缓存以跳过重复扫描 */
const validatedDigits = new Set<string>();

/**
 * 校验数字字母表：至少 2 个字符、按字符码严格升序、全单字节
 * @private
 * @throws 当字母表不满足上述任一条件时抛出错误
 */
function validateDigits(digits: string): void {
  if (validatedDigits.has(digits)) {
    return;
  }
  if (digits.length < 2 || !isStrictlyAscending(digits)) {
    throw new Error(`digits must be at least 2 characters in strictly ascending character code order: ${digits}`);
  }
  if (!isSingleByte(digits)) {
    throw new Error(`digits must be single-byte (char code 0-255): ${digits}`);
  }
  validatedDigits.add(digits);
}

/** 已通过 {@link validateIntDigits} 的头字母表。与 {@link validatedDigits} 分开：两者规则不同（奇数长度对 digits 合法、对 intDigits 非法） */
const validatedIntDigits = new Set<string>();

/**
 * 校验头字母表：至少 2 个字符的偶数长度（两半分别为负长度头与正长度头）、
 * 按字符码严格升序、全单字节
 * @private
 * @throws 当字母表不满足上述任一条件时抛出错误
 */
function validateIntDigits(intDigits: string): void {
  if (validatedIntDigits.has(intDigits)) {
    return;
  }
  if (intDigits.length < 2 || intDigits.length % 2 !== 0 || !isStrictlyAscending(intDigits)) {
    throw new Error(
      `intDigits must be an even number of at least 2 characters in strictly ascending character code order: ${intDigits}`
    );
  }
  if (!isSingleByte(intDigits)) {
    throw new Error(`intDigits must be single-byte (char code 0-255): ${intDigits}`);
  }
  validatedIntDigits.add(intDigits);
}

/** 解析后的字母表对及其查找表 */
interface Alphabets {
  digits: string;
  intDigits: string;
  lookup: Uint8Array;
  intLookup: Uint8Array;
}

/**
 * 在公共入口处一次性校验并解析两个字母表
 * @private
 */
function resolveAlphabets(digits: string | undefined, intDigits: string | undefined): Alphabets {
  if (intDigits !== undefined) {
    validateIntDigits(intDigits);
  } else {
    intDigits = digits ?? BASE_52_DIGITS;
  }
  if (digits !== undefined) {
    validateDigits(digits);
  } else {
    digits = BASE_62_DIGITS;
  }
  return { digits, intDigits, lookup: getDigitIndex(digits), intLookup: getDigitIndex(intDigits) };
}

/**
 * 在两个排序键之间生成一个新的排序键
 * 用于在有序列表中插入新项目，支持任意位置插入
 *
 * `a` 是下界（排序键，或 null 表示列表开头），`b` 是上界（排序键，或 null 表示列表结尾）。
 * 两者都非 null 时可以任意顺序传入：顺序颠倒会被自动交换，这只是为调用方提供便利，
 * 不影响生成键的性质。
 *
 * 注意 `digits` 只定义键的**数字取值**。每个键的整数部分还以一个长度标记（head）开头，
 * 取自 `intDigits` 字母表。head 只出现在首位且只与其他 head 比较，因此 `digits` 与
 * `intDigits` 可以重叠（甚至完全相同），键仍能正确排序。
 *
 * `intDigits` 默认等于 `digits`，所以 base-10 字母表会产生 `50` / `600` / `49` 这类
 * 自带头字符的键。`digits` 也省略时回退到 {@link BASE_52_DIGITS}（A-Z / a-z），
 * 即经典的 `a0` / `b00` / `Z9` 形态。注意显式传入 `digits`（即便传的是
 * {@link BASE_62_DIGITS}）也会使键变为自带头字符，只有完全省略 `digits` 才得到 A-Z / a-z 头。
 *
 * @param a - 下界键（null 表示列表开头）
 * @param b - 上界键（null 表示列表结尾）
 * @param digits - 数字字母表，字符须为单字节（字符码 0-255）且按字符码升序；默认 {@link BASE_62_DIGITS}。
 *   因 `intDigits` 默认取自 `digits`，奇数长度的 `digits` 必须搭配显式的偶数长度 `intDigits`
 * @param intDigits - 头字母表，须为偶数长度且按字符码升序；前半段为负长度头，后半段为正长度头。
 *   最外侧字符标记最长的整数部分，跨越中点的两个字符标记最短的（长度 2）。
 *   整数部分最多增长到最外侧的头，因此更短的字母表会限制键的整数部分能变得多大/多小
 * @returns 新生成的排序键
 * @throws 当参数无效或无法生成键时抛出错误
 * @example
 * // 在列表开始插入
 * const firstKey = generateKeyBetween(null, 'a1'); // 'a0V'
 *
 * @example
 * // 在列表结尾插入
 * const lastKey = generateKeyBetween('a1', null); // 'a2'
 *
 * @example
 * // 在两个键之间插入
 * const middleKey = generateKeyBetween('a1', 'a2'); // 'a1V'
 *
 * @example
 * // base-10：头字符取自 digits 本身，0-4 为负长度头、5-9 为正长度头，4/5 标记最短整数部分
 * generateKeyBetween(null, null, '0123456789'); // '50'
 */
export function generateKeyBetween(a: OrderKey, b: OrderKey, digits?: string, intDigits?: string): string {
  const alphabets = resolveAlphabets(digits, intDigits);
  const { digits: d, intDigits: id, lookup, intLookup } = alphabets;

  if (a != null) validateOrderKey(a, d, id, intLookup);
  if (b != null) validateOrderKey(b, d, id, intLookup);
  // 顺序颠倒时交换，使 a < b。这只是为调用方提供便利，不影响生成键的性质
  if (a != null && b != null && a > b) {
    [a, b] = [b, a];
  }

  if (a == null) {
    return generateKeyBefore(b, alphabets);
  }
  if (b == null) {
    return generateKeyAfter(a, alphabets);
  }

  const ia = getIntegerPart(a, id, intLookup);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b, id, intLookup);
  const fb = b.slice(ib.length);

  if (ia === ib) {
    return ia + midpoint(fa, fb, d, lookup);
  }

  const incremented = incrementInteger(ia, d, lookup, id, intLookup);
  if (incremented == null) {
    throw new Error('cannot increment any more');
  }
  if (incremented < b) {
    return incremented;
  }
  return ia + midpoint(fa, null, d, lookup);
}

/**
 * 生成小于 `b` 的键；`b` 为 null 时生成首个键
 * @private
 */
function generateKeyBefore(b: OrderKey, alphabets: Alphabets): string {
  const { digits, intDigits, lookup, intLookup } = alphabets;

  if (b == null) {
    // 最短的正长度头：intDigits 后半段的首字符（默认 A-Z / a-z 标记下即 'a'）
    return intDigits[intDigits.length / 2] + digits[0];
  }

  const ib = getIntegerPart(b, intDigits, intLookup);
  const fb = b.slice(ib.length);

  if (isSmallestInteger(ib, digits, intDigits)) {
    return ib + midpoint('', fb, digits, lookup);
  }
  if (ib < b) {
    return ib;
  }

  const res = decrementInteger(ib, digits, lookup, intDigits, intLookup);
  if (res == null) {
    throw new Error('cannot decrement any more');
  }
  return res;
}

/**
 * 生成大于 `a` 的键
 * @private
 */
function generateKeyAfter(a: string, alphabets: Alphabets): string {
  const { digits, intDigits, lookup, intLookup } = alphabets;

  const ia = getIntegerPart(a, intDigits, intLookup);
  const fa = a.slice(ia.length);
  const incremented = incrementInteger(ia, digits, lookup, intDigits, intLookup);
  return incremented ?? ia + midpoint(fa, null, digits, lookup);
}

/**
 * 在两个排序键之间生成 n 个排序键
 * 用于批量插入多个项目到有序列表中
 *
 * 前置条件与 {@link generateKeyBetween} 相同，`n >= 0`。返回 n 个互不相同、已排好序的键：
 * `a` 与 `b` 都为 null 时返回 `['a0', 'a1', ...]`；其一为 null 时返回连续的「整数」键；
 * 否则返回 `a` 与 `b` 之间相对较短的键。
 *
 * @param a - 下界键（null 表示列表开头）
 * @param b - 上界键（null 表示列表结尾）
 * @param n - 要生成的键的数量
 * @param digits - 数字字母表，语义见 {@link generateKeyBetween}
 * @param intDigits - 头字母表，语义见 {@link generateKeyBetween}
 * @returns 生成的排序键数组，按顺序排列
 * @throws 当参数无效时抛出错误
 * @example
 * // 生成 3 个键插入到两个现有键之间
 * const keys = generateKeysBetween('a1', 'a2', 3);
 * // 返回: ['a1V', 'a1l', 'a1v']
 */
export function generateKeysBetween(
  a: OrderKey,
  b: OrderKey,
  n: number,
  digits?: string,
  intDigits?: string
): string[] {
  // 在入口处校验一次，使非法字母表即便在 n === 0 之外的短路分支下也能被拒绝
  const alphabets = resolveAlphabets(digits, intDigits);
  digits = alphabets.digits;
  intDigits = alphabets.intDigits;

  if (n === 0) return [];
  if (n === 1) return [generateKeyBetween(a, b, digits, intDigits)];

  // b 为空：从 a 向后逐个生成
  if (b == null) {
    let current = generateKeyBetween(a, b, digits, intDigits);
    const result = [current];
    for (let i = 1; i < n; i++) {
      current = generateKeyBetween(current, b, digits, intDigits);
      result.push(current);
    }
    return result;
  }

  // a 为空：从 b 向前逐个生成
  if (a == null) {
    let current = generateKeyBetween(a, b, digits, intDigits);
    const result = [current];
    for (let i = 1; i < n; i++) {
      current = generateKeyBetween(a, current, digits, intDigits);
      result.push(current);
    }
    return result.reverse();
  }

  // 递归分治生成
  const mid = Math.floor(n / 2);
  const c = generateKeyBetween(a, b, digits, intDigits);
  return [
    ...generateKeysBetween(a, c, mid, digits, intDigits),
    c,
    ...generateKeysBetween(c, b, n - mid - 1, digits, intDigits)
  ];
}
