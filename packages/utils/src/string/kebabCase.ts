import { getWords } from './getWords.js';

/**
 * 转换为 kebab-case
 * @param str 输入字符串
 * @returns kebab-case 格式的字符串
 *
 * @example
 * camelCase -> 'camel-case'
 */
export const kebabCase = (str: string): string => {
  const words = getWords(str);
  return words.map(word => word.toLowerCase()).join('-');
};
