/**
 * 将多行文本转换为单行文本，移除多余的空白字符
 * 去除首尾空白，并将连续的空白字符替换为单个空格
 * @param value - 要处理的字符串
 * @returns 处理后的单行字符串
 * @example
 * stringSingleline('  hello   world  '); // 返回 'hello world'
 * @example
 * stringSingleline('line1\nline2\tline3'); // 返回 'line1 line2 line3'
 * @example
 * stringSingleline('multiple   spaces'); // 返回 'multiple spaces'
 * @example
 * stringSingleline(''); // 返回 ''
 * **注意：** 先使用 trim() 去除首尾空白，然后用正则 /\s+/g 替换连续空白为单个空格
 * **注意：** 适用于清理用户输入或格式化显示文本
 */
export const stringSingleline = (value: string) => value.trim().replace(/\s+/g, ' ');
