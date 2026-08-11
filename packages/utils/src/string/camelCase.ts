import { capitalize } from './capitalize.js';
import { getWords } from './getWords.js';

/**
 * 将字符串转换为驼峰命名格式
 * 驼峰命名规则：首字母小写，后续每个单词首字母大写，单词间无分隔符
 * 支持处理包含连字符(-)、下划线(_)、空格或大小写混合的字符串
 *
 * @param str - 输入字符串，可以包含各种分隔符或混合大小写
 * @returns 转换后的驼峰式字符串
 * @example
 * camelCase('hello-world');      // 返回 'helloWorld'
 * @example
 * camelCase('Hello_World');      // 返回 'helloWorld'
 * @example
 * camelCase('hello world');      // 返回 'helloWorld'
 * @example
 * camelCase('HelloWorld');       // 返回 'helloWorld'
 * @example
 * camelCase('  hello--world  '); // 返回 'helloWorld'（自动去除首尾空格）
 * @example
 * camelCase('');                 // 返回 ''（空字符串输入返回空字符串）
 * **注意：** 内部使用getWords()函数拆分单词，使用capitalize()函数处理单词首字母
 */
export function camelCase(str: string): string {
  const words = getWords(str);
  if (words.length === 0) {
    return '';
  }
  const [first, ...rest] = words;
  return `${first.toLowerCase()}${rest.map(word => capitalize(word)).join('')}`;
}
