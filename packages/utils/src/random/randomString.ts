export const ZERO = '0';
export const NUMBER_WITHOUT_ZERO = '123456789';
export const NUMBERS = ZERO + NUMBER_WITHOUT_ZERO;
export const LOWER_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
export const UPPER_LETTERS = LOWER_LETTERS.toUpperCase();
export const LETTERS = LOWER_LETTERS + UPPER_LETTERS;
export const SAFE_URL = '_-';
export const URL_ALL = NUMBERS + LETTERS + SAFE_URL;

const UINT32_RANGE = 0x1_0000_0000;

const getCrypto = (): Crypto => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Web Crypto API is required to generate random strings');
  }
  return cryptoApi;
};

/**
 * 使用 Web Crypto 和 rejection sampling 生成无偏随机字符串。
 *
 * @param size - 结果长度
 * @param alphabet - 可选字符集
 * @returns 随机字符串
 */
export const randomString = (size: number = 16, alphabet: string = URL_ALL): string => {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new RangeError('size must be a non-negative safe integer');
  }
  if (alphabet.length === 0) {
    throw new RangeError('alphabet must not be empty');
  }
  if (size === 0) return '';

  const cryptoApi = getCrypto();
  const acceptedRange = Math.floor(UINT32_RANGE / alphabet.length) * alphabet.length;
  const values = new Uint32Array(Math.min(Math.max(size, 16), 1024));
  let result = '';

  while (result.length < size) {
    cryptoApi.getRandomValues(values);
    for (const value of values) {
      if (value >= acceptedRange) continue;
      result += alphabet[value % alphabet.length];
      if (result.length === size) return result;
    }
  }

  return result;
};
