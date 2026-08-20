import { get } from '../object/index.js';

/**
 * 使用对象路径替换模板中的 `${path}` 占位符
 *
 * @remarks
 * 占位符内容用 `[^{}]+` 而不是 `[^}]+`：后者在 `'${'.repeat(20000)` 这类没有闭合括号的
 * 模板上，会从每一个 `${` 一路扫到串尾才发现无 `}`，退化成 O(n²)（CS-009）。
 * 代价是含 `{` 的占位符不再被识别 —— `${` 是唯一开界符，对象路径里不可能再有 `{`，
 * 这类模板本来就只会取到默认值空串。
 *
 * @param templateString - 模板字符串
 * @param data - 模板数据
 * @returns 替换后的字符串
 */
export const stringTemplate = (templateString: string, data: unknown): string =>
  templateString.replace(/\${([^{}]+)}/g, (_, key: string) => get<string>(data, key.trim(), ''));
