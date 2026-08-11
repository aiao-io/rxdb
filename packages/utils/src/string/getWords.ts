/**
 * 单词边界模式（Unicode 感知），四个分支按顺序尝试：
 *
 * 1. `\p{Lu}?\p{Ll}+` —— 可选首字母大写 + 小写串（`camel` / `Case` / `héllo`）
 * 2. `\p{N}+` —— 数字串（`123`）
 * 3. `\p{Lu}+(?!\p{Ll})` —— 连续大写缩写（`HTML`）
 * 4. `[\p{Lo}\p{Lm}]+` —— 无大小写概念的文字（中日韩、泰文等）
 *
 * 第 4 个分支不可省：`\p{Lo}` 既不是 `Lu` 也不是 `Ll`，缺了它中文会被整体丢弃。
 */
const CASE_SPLIT_PATTERN = /\p{Lu}?\p{Ll}+|\p{N}+|\p{Lu}+(?!\p{Ll})|[\p{Lo}\p{Lm}]+/gu;

/**
 * 从字符串中提取单词，使用大小写和数字边界进行分割
 * 支持驼峰命名、帕斯卡命名和包含数字的字符串
 * @param str - 要分割的字符串
 * @returns 分割后的单词数组
 * @example
 * getWords('camelCaseString'); // 返回 ['camel', 'Case', 'String']
 * @example
 * getWords('PascalCaseString'); // 返回 ['Pascal', 'Case', 'String']
 * @example
 * getWords('stringWith123Numbers'); // 返回 ['string', 'With', '123', 'Numbers']
 * @example
 * getWords('HTMLParser'); // 返回 ['HTML', 'Parser']
 * @example
 * getWords('simple'); // 返回 ['simple']
 * @example
 * getWords(''); // 返回 []
 * @example
 * getWords('用户ID'); // 返回 ['用户', 'ID']
 * @example
 * getWords('héllo wörld'); // 返回 ['héllo', 'wörld']
 * **注意：** 使用 Unicode 属性类匹配，重音字母与中日韩文字都能正确切分
 * **注意：** 连续的大写字母会被视为一个单词（如 'HTML'）
 * **注意：** 数字序列会被单独提取（如 '123'）
 * **注意：** 无大小写概念的文字（如中文）整段成词，与相邻的拉丁文/数字在边界处断开
 */
export const getWords = (str: string): string[] => Array.from(str.match(CASE_SPLIT_PATTERN) ?? []);
