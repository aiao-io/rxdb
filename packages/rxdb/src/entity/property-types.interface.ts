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

/**
 * UUID 属性
 *
 * @remarks
 * 实体主键的默认选择：可离线生成，因此新建的行在还没碰到任何后端时就有稳定身份，
 * 这是本地优先写入与后续同步对账的前提（自增整数做不到——两端各自分配会撞号）。
 *
 * 值按字符串持久化，`default` 通常传生成函数而非定值，
 * 否则同一张表的所有新行会共用一个写死的 UUID。
 */
export interface UUIDProperty extends IEntityObject, ISortable {
  /**
   * 是否为主键
   */
  primary?: boolean;
  type: PropertyType.uuid | `${PropertyType.uuid}`;
  default?: UUID | (() => UUID);
}

/**
 * 变长字符串属性
 *
 * @remarks
 * 不带长度上限：各适配器落到 `TEXT`（SQLite 系无长度概念，PGlite 用无约束 `text`），
 * 长度校验属于业务层。需要受控取值集合用 {@link EnumProperty}，
 * 需要整段结构化数据用 {@link JSONProperty}，别拿字符串手动序列化。
 */
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

/**
 * 受控取值集合属性
 *
 * @remarks
 * 存储形态就是字符串，和 {@link StringProperty} 在库里没有区别——`enum` 收窄的是
 * **类型与元数据**，不是数据库层的约束。因此已经落盘的行不会因为后来从 `enum` 里删掉一个值
 * 而变得读不出来；清理历史值是迁移的事。
 *
 * `enum` 声明为 `readonly string[]`，用 `as const` 传入才能让实体字段推断成字面量联合而非 `string`。
 */
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

/**
 * 数字数组属性
 *
 * @remarks
 * 整体序列化成一列，**不是**关联表：既不能按元素建索引，也无法只更新其中一项——
 * 任何修改都要整体重新赋值（原地 `push` 不触发实体 Proxy，不会被持久化）。
 * 需要按元素查询或索引就改用一对多关系。
 */
export interface NumberArrayProperty extends IEntityObject, ISortable {
  type: PropertyType.numberArray | `${PropertyType.numberArray}`;
  default?: number[] | (() => number[]);
}

/**
 * 整数属性
 *
 * @remarks
 * 与 {@link NumberProperty} 的区别在于存储类型而不仅是校验：整数落到整型列，
 * 因此可以安全地当主键用（`primary` 仅在此与 UUID / string / bigint 上开放）。
 * 值域受 JS `number` 的安全整数限制，超出请用 {@link BigIntProperty}。
 *
 * `format` 有意排除了 `currency` / `percentage`——那两种语义蕴含小数精度，落在整数列上会静默丢位。
 */
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

/**
 * 日期时间属性
 *
 * @remarks
 * `default` 除了 `Date` 与生成函数，还接受哨兵字符串 `'CURRENT_TIMESTAMP'`，
 * 它声明的是**建表时的数据库端 DEFAULT**（PGlite 落成 `now()`），而不是一个字符串字面量。
 * 需要跨端可比较的时间戳时用它——客户端时钟各不相同。
 *
 * 注意它并非所有写入路径都由数据库求值：批量 insert 显式给出每一列、绕过了 DB DEFAULT，
 * 适配器会在那里把哨兵就地换成客户端当前时间（见 `inserts_sql.ts`）。
 * 哨兵**不可以**出现在读回来的值里——`new Date('CURRENT_TIMESTAMP')` 是 Invalid Date。
 */
export interface DateProperty extends IEntityObject, ISortable {
  type: PropertyType.date | `${PropertyType.date}`;
  default?: Date | (() => Date) | 'CURRENT_TIMESTAMP';
  /**
   * 字段语义标注。`display` 只影响展示，不改变持久化精度
   * @default { kind: 'dateTime' }
   */
  format?: import('./cascade-options.interface.js').DateTimeFormat;
}

/**
 * 布尔属性
 *
 * @remarks
 * SQLite 系没有原生布尔类型，落到 `0` / `1` 整数列并在读取时还原，
 * 所以裸 SQL 查询（`rawQuery`）里要按整数比较，不能写 `= true`。
 */
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
 *
 * @remarks
 * 与 {@link JSONProperty} 的区别是它**要求预先声明** `properties`：值仍整体存一列，
 * 但每个键的类型与默认值是已知的，于是能参与类型推断。结构不固定时才用 JSON。
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

/**
 * 归一化之后的字段元数据联合类型
 *
 * @remarks
 * 与 {@link EntityPropertyMetadataOptions} 是同一组形状的**前后两态**：用户声明的是 Options 态，
 * `transitionMetadata()` 处理后得到本类型，差别只在 `columnName` 从可选变必填（缺省时取 `name`）。
 * 分成两个类型是为了让「读元数据的代码」不必在每个取列名的地方兜一次空。
 *
 * 因此凡是消费元数据的一侧都应该要本类型，而不是 Options——拿到 Options 意味着
 * 上游漏了 `transitionMetadata()`。
 */
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

/**
 * 归一化之后的实体级外键元数据
 *
 * @remarks
 * 与 {@link EntityForeignKeyMetadataOptions} 的关系同 {@link EntityPropertyMetadata}：
 * `transitionMetadata()` 把缺省的 `mappedNamespace` 填成当前实体的命名空间，
 * 于是下游做跨命名空间解析时不需要再知道「缺省继承」这条规则。
 */
export type EntityForeignKeyMetadata = SetRequired<EntityForeignKeyMetadataOptions, 'mappedNamespace'>;
