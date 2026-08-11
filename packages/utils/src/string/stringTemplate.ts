import { get } from '../object/index.js';

/**
 * 使用对象路径替换模板中的 `${path}` 占位符
 *
 * @param templateString - 模板字符串
 * @param data - 模板数据
 * @returns 替换后的字符串
 */
export const stringTemplate = (templateString: string, data: unknown): string =>
  templateString.replace(/\${([^}]+)}/g, (_, key: string) => get<string>(data, key.trim(), ''));
