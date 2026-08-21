/**
 * @fileoverview 实体的属性类型定义
 *
 * 字段元数据、属性类型枚举、字段索引与外键约束的类型聚合。
 * 本文件只声明"**字段**"层面的形状：标量类型、字段元数据、索引、外键约束。
 * 关系、级联、字段语义 format 见：
 * - {@link ./relation-types.interface.ts}
 * - {@link ./cascade-options.interface.ts}
 */

import type { SetRequired } from 'type-fest';
import type { UUID } from './entity.interface.js';
import type { ICascadeOptions } from './relation-types.interface.js';

/**
 * 值对象
 * 存储键值队列
 */
export type KeyValue = Record<string, number | Date | string | boolean>;

/**
 * 实体字段基础值对象接口
 * 定义实体属性的基本特性
 */
interface IEntityObject {
  /**
   * 名字
   * 非大写开头的英文单词，只能包含英文单词和下划线
   */
  name: Uncapitalize<string>;

  /**
   * 数据库中的列名称
   * 没有填写就是 name 一样
   */
  columnName?: string;

  /**
   * 显示名称
   * @example "用户", "订单项"
   */
  displayName?: string;

  /**
   * 是否唯一
   * 如果为 true 那么这个数据得值不允许重复
   * @default false
   */
  unique?: boolean;

  /**
   * 是否为只读
   * 如果为 true 那么这个数据只有创建的时候写一次，在更新数据时，这个列的值不会被更新
   * 如果为 false 那么在更新数据时这个列的值会被更新
   * @default false
   */
  readonly?: boolean;

  /**
   * 是否可以为 NULL
   * @default false
   */
  nullable?: boolean;

  /**
   * 是否为必填
   * 用于前端验证
   * 如果为 true 那么在创建数据时这个列必须提供值
   * 空字符串，空数组都不允许，数字 0 允许
   * @default false
   */
  required?: boolean;

  /**
   * 是否为加密列（透明字段级加密）
   *
   * 由 `@aiao/rxdb-adapter-encrypted` 在写入前用 AES-GCM-256 加密、
   * 读取后透明解密。加密列不能同时是：
   * 主键 / 外键 / 唯一 / 可排序 / 索引 / 计算属性 / FTS 列。
   *
   * @default false
   */
  encrypted?: boolean;
}

/**
 * 实体排序接口
 * 定义实体属性的排序能力
 */
interface ISortable {
  /**
   * 是否可排序
   * @default false
   */
  sortable?: boolean;
}

/**
 * 实体属性类型枚举
 * 定义实体属性支持的数据类型
 */
export enum PropertyType {
  // ------------------------------------------------------[ 基础 ]
  /**
   * uuid
   */
  uuid = 'uuid',

  /**
   * 字符串
   */
  string = 'string',

  /**
   * 枚举
   */
  enum = 'enum',

  /**
   * 数字
   */
  number = 'number',

  /**
   * 整数
   */
  integer = 'integer',

  /**
   * 有符号 64 位整数
   *
   * @remarks
   * 运行时只接受 `bigint`；详见 {@link BigIntProperty}。
   */
  bigint = 'bigint',

  /**
   * 布尔值
   */
  boolean = 'boolean',

  /**
   * 日期时间
   */
  date = 'date',

  /**
   * 字节序列（`Uint8Array`）
   *
   * @remarks
   * 运行时值类型为 `Uint8Array`；详见 {@link BinaryProperty}。
   */
  binary = 'binary',

  // ------------------------------------------------------[ 数组 ]
  /**
   * 字符串数组
   */
  stringArray = 'stringArray',

  /**
   * 数字数组
   */
  numberArray = 'numberArray',

  // ------------------------------------------------------[ 对象 ]
  /**
   * 键值对对象
   */
  keyValue = 'keyValue',

  /**
   * JSON 对象
   */
  json = 'json'
}

export interface UUIDProperty extends IEntityObject, ISortable {
  /**
   * 是否为主键
   */
  primary?: boolean;
  type: PropertyType.uuid | `${PropertyType.uuid}`;
  default?: UUID | (() => UUID);
}

export interface StringProperty extends IEntityObject, ISortable {
  /**
   * 是否为主键
   */
  primary?: boolean;
  type: PropertyType.string | `${PropertyType.string}`;
  default?: string | (() => string);
  /**
   * 是否纳入全局搜索（FTS5 外部内容表）
   * 仅对 `StringProperty` / `EnumProperty` / `StringArrayProperty` 有效
   * @default false
   * @see @aiao/rxdb-plugin-search
   */
  searchable?: boolean;
  /**
   * 字段语义标注，只影响展示与前端控件选择，不改变运行时值类型
   * @default { kind: 'plainText' }
   */
  format?:
    | import('./cascade-options.interface.js').PlainTextFormat
    | import('./cascade-options.interface.js').MultilineTextFormat
    | import('./cascade-options.interface.js').RichTextFormat
    | import('./cascade-options.interface.js').UrlFormat
    | import('./cascade-options.interface.js').EmailFormat
    | import('./cascade-options.interface.js').PhoneFormat
    | import('./cascade-options.interface.js').CodeFormat
    | import('./cascade-options.interface.js').ColorFormat;
}

export interface EnumProperty extends IEntityObject, ISortable {
  /**
   * 属性类型
   */
  type: PropertyType.enum | `${PropertyType.enum}`;
  /**
   * 枚举选项列表
   * 定义该字段允许的所有枚举值
   * @example ['active', 'inactive', 'pending']
   */
  enum: readonly string[];
  /**
   * 默认值
   */
  default?: string | (() => string);
  /**
   * 是否纳入全局搜索（按原始字符串索引）
   * @default false
   * @see @aiao/rxdb-plugin-search
   */
  searchable?: boolean;
  /**
   * 字段语义标注。枚举属性只能声明单选
   * @default { kind: 'singleSelect' }
   */
  format?: import('./cascade-options.interface.js').SingleSelectFormat;
  /**
   * 枚举值的展示元数据，键必须是 `enum` 的子集
   */
  options?: import('./cascade-options.interface.js').FieldOptions;
}

export interface NumberArrayProperty extends IEntityObject, ISortable {
  type: PropertyType.numberArray | `${PropertyType.numberArray}`;
  default?: number[] | (() => number[]);
}

export interface IntegerProperty extends IEntityObject, ISortable {
  primary?: boolean;
  type: PropertyType.integer | `${PropertyType.integer}`;
  default?: number | (() => number);
  /**
   * 字段语义标注。整数不接受 `currency` / `percentage`，避免精度语义冲突
   * @default { kind: 'number' }
   */
  format?:
    | import('./cascade-options.interface.js').NumberFormat
    | import('./cascade-options.interface.js').RatingFormat
    | import('./cascade-options.interface.js').DurationFormat;
}

/**
 * 有符号 64 位整数属性。
 *
 * @remarks
 * 运行时只接受 `bigint`，值域为 `-2^63` 至 `2^63 - 1`。SQLite family 与
 * PGlite 本地 adapter 支持持久化；Supabase remote 不支持。类型系统演进 Epic
 * 全部完成前，该类型不得进入发布产物。
 */
export interface BigIntProperty extends IEntityObject, ISortable {
  primary?: boolean;
  type: PropertyType.bigint | `${PropertyType.bigint}`;
  default?: bigint | (() => bigint);
}

/**
 * Uint8Array 字节序列属性
 *
 * @remarks
 * 默认值会按实体复制。原地修改不会触发实体 Proxy，持久化变更必须重新赋值。
 * SQLite family 与 PGlite 本地 adapter 支持 `Uint8Array` 当前视图；Supabase
 * remote 不支持。类型系统演进 Epic 全部完成前，该类型不得进入发布产物。
 */
export interface BinaryProperty extends IEntityObject {
  type: PropertyType.binary | `${PropertyType.binary}`;
  default?: Uint8Array | (() => Uint8Array);
}

export interface DateProperty extends IEntityObject, ISortable {
  type: PropertyType.date | `${PropertyType.date}`;
  default?: Date | (() => Date) | 'CURRENT_TIMESTAMP';
  /**
   * 字段语义标注。`display` 只影响展示，不改变持久化精度
   * @default { kind: 'dateTime' }
   */
  format?: import('./cascade-options.interface.js').DateTimeFormat;
}

export interface BooleanProperty extends IEntityObject, ISortable {
  type: PropertyType.boolean | `${PropertyType.boolean}`;
  default?: boolean | (() => boolean);
}
/**
 * 字符串组
 */
export interface StringArrayProperty extends IEntityObject, ISortable {
  type: PropertyType.stringArray | `${PropertyType.stringArray}`;
  default?: string[] | (() => string[]);
  /**
   * 是否纳入全局搜索（数组元素按 `\n` join 后索引）
   * @default false
   * @see @aiao/rxdb-plugin-search
   */
  searchable?: boolean;
  /**
   * 字符串组的可选值集合。声明 `multiSelect` 或 `options` 时必填
   */
  enum?: readonly string[];
  /**
   * 字段语义标注。字符串组只能声明多选
   * @default { kind: 'plainText' } 的数组语义（即无 format）
   */
  format?: import('./cascade-options.interface.js').MultiSelectFormat;
  /**
   * 枚举值的展示元数据，键必须是 `enum` 的子集
   */
  options?: import('./cascade-options.interface.js').FieldOptions;
}
/**
 * 数字组
 */
export interface NumberProperty extends IEntityObject, ISortable {
  type: PropertyType.number | `${PropertyType.number}`;
  default?: number | (() => number);
  /**
   * 字段语义标注，只影响展示与前端控件选择，不改变运行时值类型
   * @default { kind: 'number' }
   */
  format?:
    | import('./cascade-options.interface.js').NumberFormat
    | import('./cascade-options.interface.js').CurrencyFormat
    | import('./cascade-options.interface.js').PercentageFormat
    | import('./cascade-options.interface.js').RatingFormat
    | import('./cascade-options.interface.js').DurationFormat;
}

/**
 * keyValue
 * 存储键值对的对象，适用于简单的配置项或动态属性集合
 */

export interface KeyValueProperty extends IEntityObject {
  type: PropertyType.keyValue | `${PropertyType.keyValue}`;
  default?: KeyValue | (() => KeyValue);
  properties: KeyValuePropertyMetadata[];
}

/**
 * json
 * 存储任意 JSON 结构的数据，适用于灵活的数据模型或嵌套对象
 */
export interface JSONProperty extends IEntityObject {
  type: PropertyType.json | `${PropertyType.json}`;
  default?: Record<string, unknown> | (() => Record<string, unknown>);
}

type support_keys = 'name' | 'displayName' | 'type' | 'default' | 'nullable' | 'required';

/**
 * keyValue 属性元数据联合类型
 * keyValue 的嵌套属性不需要 columnName，直接用 name 作为键
 */
export type KeyValuePropertyMetadata =
  | Pick<StringProperty, support_keys>
  | Pick<NumberProperty, support_keys>
  | Pick<IntegerProperty, support_keys>
  | Pick<DateProperty, support_keys>
  | Pick<BooleanProperty, support_keys>;

/**
 * 实体属性元数据联合类型
 * 包含所有可能的属性类型元数据
 */
export type EntityPropertyMetadataOptions =
  | UUIDProperty
  | StringProperty
  | EnumProperty
  | NumberProperty
  | IntegerProperty
  | BigIntProperty
  | BinaryProperty
  | DateProperty
  | BooleanProperty
  | StringArrayProperty
  | NumberArrayProperty
  | JSONProperty
  | KeyValueProperty;

export type EntityPropertyMetadata =
  | SetRequired<UUIDProperty, 'columnName'>
  | SetRequired<StringProperty, 'columnName'>
  | SetRequired<EnumProperty, 'columnName'>
  | SetRequired<NumberProperty, 'columnName'>
  | SetRequired<IntegerProperty, 'columnName'>
  | SetRequired<BigIntProperty, 'columnName'>
  | SetRequired<BinaryProperty, 'columnName'>
  | SetRequired<DateProperty, 'columnName'>
  | SetRequired<BooleanProperty, 'columnName'>
  | SetRequired<StringArrayProperty, 'columnName'>
  | SetRequired<NumberArrayProperty, 'columnName'>
  | SetRequired<JSONProperty, 'columnName'>
  | SetRequired<KeyValueProperty, 'columnName'>;

/**
 * 实体索引元数据接口
 * 定义实体索引的配置
 */
export interface EntityIndexMetadataOptions extends IEntityObject {
  properties?: string[];
  /**
   * 归一化唯一索引：索引的**每一列**都以 `lower(COALESCE(CAST(列 AS TEXT), ''))` 参与比较。
   *
   * @remarks
   * 只对 `unique: true` 有意义，单独出现会在建元数据时抛错（不做静默降级）。
   *
   * 解决两件事：
   *
   * 1. **NULL 让唯一索引整条失效。** SQL 规定每个 NULL 互不相等，
   *    因此 `(parentId, name, extension)` 上的普通 UNIQUE 对「根节点」（`parentId IS NULL`）
   *    和「文件夹」（`extension IS NULL`）**一行都拦不住**。`COALESCE(…, '')` 把 NULL
   *    折成一个真实值后，元组才重新可比。
   * 2. **大小写变体绕过重名校验。** 树形 UI 的同级重名判定普遍是
   *    `a.toLowerCase() === b.toLowerCase()`；数据库若区分大小写，UI 拦下的重名
   *    换个大小写就能从 repository 直写进去。`lower()` 让两侧同口径。
   *
   * 索引仍是**多列元组**，不是拼接成一个字符串 —— `('a', 'bc')` 与 `('ab', 'c')` 不冲突。
   *
   * @example
   * ```typescript
   * indexes: [
   *   { name: 'parent_fullname', properties: ['parentId', 'name', 'extension'], unique: true, normalized: true }
   * ]
   * ```
   *
   * @defaultValue `false`
   */
  normalized?: boolean;
}

/**
 * 实体级外键约束。
 *
 * @remarks
 * 关系元数据负责单列外键；跨列业务不变量用本配置声明。`properties` 与
 * `mappedProperties` 按位置一一对应，引用端必须有匹配的唯一索引。
 */
export interface EntityForeignKeyMetadataOptions extends ICascadeOptions {
  /** 约束名。 */
  name: Uncapitalize<string>;
  /** 当前实体的属性或关系 ID 字段。 */
  properties: [string, ...string[]];
  /** 被引用实体。 */
  mappedEntity: Capitalize<string>;
  /** 被引用实体命名空间，默认继承当前实体命名空间。 */
  mappedNamespace?: Lowercase<string>;
  /** 被引用实体的属性或关系 ID 字段。 */
  mappedProperties: [string, ...string[]];
}

export type EntityForeignKeyMetadata = SetRequired<EntityForeignKeyMetadataOptions, 'mappedNamespace'>;
