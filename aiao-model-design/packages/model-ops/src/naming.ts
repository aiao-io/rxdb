/** 实体名：大写字母开头的 PascalCase，只含字母、数字与下划线。 */
export const ENTITY_NAME_PATTERN = /^[A-Z][a-zA-Z0-9_]*$/;

/** 属性名与关系名：小写字母开头的 camelCase，只含字母、数字与下划线。 */
export const PROPERTY_NAME_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;

/** 实体基类与对象原型占用的字段名，属性和关系都不能使用。 */
export const RESERVED_FIELD_NAMES: ReadonlySet<string> = new Set([
  'id',
  'constructor',
  'prototype',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy'
]);

/** 实体名不合规时的原因，合规返回 `null`。 */
export function entityNameProblem(name: string): string | null {
  if (!name.trim()) return '实体名不能为空';
  if (!ENTITY_NAME_PATTERN.test(name)) return `实体名 ${name} 必须是大写字母开头的 PascalCase`;
  return null;
}

/** 属性名或关系名不合规时的原因，合规返回 `null`。 */
export function fieldNameProblem(name: string): string | null {
  if (!name.trim()) return '字段名不能为空';
  if (!PROPERTY_NAME_PATTERN.test(name)) return `字段名 ${name} 必须是小写字母开头的 camelCase`;
  if (RESERVED_FIELD_NAMES.has(name)) return `字段名 ${name} 是基类保留字段`;
  return null;
}
