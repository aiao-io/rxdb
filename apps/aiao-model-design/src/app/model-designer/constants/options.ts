/**
 * 完整属性类型列表，对齐 @aiao/rxdb PropertyType 枚举的 11 种类型
 */
export const PROPERTY_TYPES = [
  'uuid',
  'string',
  'number',
  'integer',
  'boolean',
  'date',
  'stringArray',
  'numberArray',
  'keyValue',
  'json',
  'enum'
] as const;

/** 属性类型联合类型 */
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/**
 * keyValue 子属性允许的标量类型（对齐 KeyValuePropertyMetadata）
 */
export const KEYVALUE_SUB_TYPES = ['string', 'number', 'integer', 'date', 'boolean'] as const;

/** keyValue 子属性类型联合类型 */
export type KeyValueSubType = (typeof KEYVALUE_SUB_TYPES)[number];

/** 实体基类选项 */
export const EXTENDS_OPTIONS = ['EntityBase', 'TreeEntityBase'] as const;

/** 实体基类选项联合类型 */
export type ExtendsOption = (typeof EXTENDS_OPTIONS)[number];

/** 级联操作类型 */
export const CASCADE_ACTIONS = ['NO_ACTION', 'CASCADE', 'SET_NULL', 'RESTRICT'] as const;

/** 级联操作类型联合类型 */
export type CascadeAction = (typeof CASCADE_ACTIONS)[number];

/** 属性类型英文默认显示名映射（本地化回退） */
export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  uuid: 'UUID',
  string: 'String',
  number: 'Number',
  integer: 'Integer',
  boolean: 'Boolean',
  date: 'Date',
  stringArray: 'String Array',
  numberArray: 'Number Array',
  keyValue: 'Key-Value',
  json: 'JSON',
  enum: 'Enum'
};

/** keyValue 子属性类型英文默认显示名映射（本地化回退） */
export const KEYVALUE_SUB_TYPE_LABELS: Record<string, string> = {
  string: 'String',
  number: 'Number',
  integer: 'Integer',
  date: 'Date',
  boolean: 'Boolean'
};
