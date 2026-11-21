/** 实体名验证：大小写字母开头，只允许 a-z A-Z 0-9 _ */
export const ENTITY_NAME_PATTERN = /^[A-Z][a-zA-Z0-9_]*$/;

/** 表名验证：只允许字母开头， a-z A-Z 0-9 _ */
export const TABLE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** 属性名验证：小写字母开头，只允许 a-z A-Z 0-9 _ */
export const PROPERTY_NAME_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;

/** 属性列名验证：小写字母开头，只允许 a-z A-Z 0-9 _ */
export const PROPERTY_COLUMN_NAME_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;

/** 首次进入模型设计页时自动创建的默认设计名称 */
export const DEFAULT_MODEL_NAME = 'schema';

/**
 * 验证表名是否合法
 * @param value 要验证的表名
 * @returns 是否合法
 */
export function isValidTableName(value: string): boolean {
  return TABLE_NAME_PATTERN.test(value);
}

/**
 * 验证属性名是否合法
 * @param value 要验证的属性名
 * @returns 是否合法
 */
export function isValidPropertyName(value: string): boolean {
  return PROPERTY_NAME_PATTERN.test(value);
}

/**
 * 验证列名是否合法
 * @param value 要验证的列名
 * @returns 是否合法
 */
export function isValidColumnName(value: string): boolean {
  return PROPERTY_COLUMN_NAME_PATTERN.test(value);
}

/**
 * 生成唯一的名称
 * 如果现有名称中存在指定前缀，则自动添加数字后缀直到唯一
 * @param prefix 名称前缀
 * @param existingNames 已存在的名称列表
 * @param startCounter 起始序号，0 表示先尝试不带数字的前缀
 * @returns 唯一的名称
 */
export function generateUniqueName(prefix: string, existingNames: readonly string[], startCounter = 0): string {
  let name = startCounter > 0 ? `${prefix}${startCounter}` : prefix;
  let counter = startCounter > 0 ? startCounter + 1 : 2;
  while (existingNames.includes(name)) {
    name = `${prefix}${counter}`;
    counter++;
  }
  return name;
}

/**
 * 生成模型设计"复制"名称
 *
 * 规则：`"${sourceName} 副本"`；若已存在，则取当前所有名称中匹配该前缀的最大序号 + 1，
 * 追加为 `"${sourceName} 副本 (N)"`。
 *
 * @param sourceName 源设计名称
 * @param existingNames 当前所有设计名称
 * @returns 唯一的复制名称
 */
export function generateCopyName(sourceName: string, existingNames: readonly string[]): string {
  const base = `${sourceName} 副本`;
  if (!existingNames.includes(base)) return base;

  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const suffixPattern = new RegExp(`^${escaped} \\((\\d+)\\)$`);
  let maxSuffix = 1;
  for (const name of existingNames) {
    const match = suffixPattern.exec(name);
    if (match) maxSuffix = Math.max(maxSuffix, Number(match[1]));
  }
  return `${base} (${maxSuffix + 1})`;
}
