import { getWords } from './getWords.js';

/**
 * 将字符串转换为蛇形格式
 * @param str
 * @returns
 *
 * @example
 * camelCase -> camel_case
 * camel case -> camel_case
 */
export const snakeCase = (str: string): string => {
  const words = getWords(str);
  return words.map(word => word.toLowerCase()).join('_');
};
