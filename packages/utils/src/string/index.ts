/**
 * @fileoverview 字符串操作工具模块
 *
 * @module string
 */

/**
 * 转换为驼峰命名
 */
export { camelCase } from './camelCase.js';

/**
 * 首字母大写
 */
export * from './capitalize.js';

/**
 * 压缩为 Base64 URL 编码
 */
export { compressToBase64Url } from './compressToBase64Url.js';

/**
 * 从 Base64 URL 编码解压
 */
export { decompressFromBase64Url } from './decompressFromBase64Url.js';

/**
 * 转换为短横线命名
 */
export { kebabCase } from './kebabCase.js';

/**
 * 解析中文数字
 */
export { parseChineseNumber } from './parseChineseNumber.js';

/**
 * 解析 URL 查询参数
 */
export { queryParse } from './queryParse.js';

/**
 * 序列化为 URL 查询参数
 */
export { queryStringify } from './queryStringify.js';

/**
 * 人民币金额转大写
 */
export { rmbUppercase } from './rmb.js';

/**
 * 计算字符串相似度
 */
export { similarity } from './similarity.js';

/**
 * 转换为蛇形命名
 */
export { snakeCase } from './snakeCase.js';

/**
 * 转换为首字母大写
 */
export { startCase } from './startCase.js';

/**
 * 转换为单行字符串
 */
export { stringSingleline } from './stringSingleline.js';

/**
 * 字符串模板
 */
export { stringTemplate } from './stringTemplate.js';

/**
 * 字符串转 ArrayBuffer
 */
export { stringToArrayBuffer } from './stringToArrayBuffer.js';

/**
 * UTF-8 字符串转 ArrayBuffer
 */
export { utf8StringToArrayBuffer } from './utf8StringToArrayBuffer.js';

/**
 * 首字母小写
 */
export * from './uncapitalize.js';

/**
 * 拼接 URL
 */
export { urlJoin } from './urlJoin.js';
