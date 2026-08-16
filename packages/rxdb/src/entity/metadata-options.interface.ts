/**
 * @fileoverview 实体元数据选项接口定义
 * 提供实体装饰器配置所需的各种接口和类型，包括属性、关系、索引和同步选项
 * 这些接口和类型用于 @Entity 装饰器的配置，定义实体的结构和行为
 */

import { SetRequired } from 'type-fest';
import { RuleGroup } from '../repository/query.interface.js';
import { EntityType, RxDBEntityId, UUID } from './entity.interface.js';

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
   * 有符号 64 位整数。
   *
   * 运行时值必须是 `bigint`，值域为 `-2^63` 至 `2^63 - 1`。本地 adapter
   * 在 SQL 执行前校验值域；Supabase remote 不支持该类型。
   */
  bigint = 'bigint',

  /**
   * `Uint8Array` 字节序列。
   *
   * 相等语义是当前视图内的长度和逐字节值相等。原地修改不会触发实体 Proxy，
   * 需要持久化时必须重新赋值；Supabase remote 不支持该类型。
   */
  binary = 'binary',

  /**
   * 布尔
   */
  boolean = 'boolean',

  /**
   * 日期
   */
  date = 'date',

  // ------------------------------------------------------[ 数组 ]

  /**
   * 字符串组
   */
  stringArray = 'stringArray',

  /**
   * 数字组
   */
  numberArray = 'numberArray',

  // ------------------------------------------------------[ 对象 ]

  /**
   * 值对象
   * 只存 key -> value 的键值对, 不支持嵌套, 不支持数组
   */
  keyValue = 'keyValue',

  /**
   * json
   * 任意格式，支持嵌套和数组，适用于灵活的数据模型或动态属性集合，默认不支持搜索
   */
  json = 'json'
}

/**
 * 实体关系类型枚举
 * 定义实体之间可能的关系类型
 */
export enum RelationKind {
  /**
   * 一对一
   * 一个实体只关联另一个实体的一个实例
   */
  ONE_TO_ONE = '1:1',
  /**
   * 一对多
   * 一个实体关联另一个实体的多个实例
   */
  ONE_TO_MANY = '1:m',
  /**
   * 多对一
   * 多个实体关联另一个实体的一个实例
   */
  MANY_TO_ONE = 'm:1',
  /**
   * 多对多
   * 多个实体关联另一个实体的多个实例，通常需要中间表
   */
  MANY_TO_MANY = 'm:n'
}

/**
 * 外键约束操作枚举
 * 定义 SQLite 外键约束的级联行为
 *
 * SQLite 支持在外键定义时指定 ON DELETE 和 ON UPDATE 的行为
 * 这些约束在数据库层面自动执行，无需应用层干预
 *
 * @see https://www.sqlite.org/foreignkeys.html
 */
export enum OnDeleteAction {
  /**
   * 不执行任何操作（默认）
   * 当父表记录被删除时，不对子表记录做任何处理
   * 如果存在引用，删除操作会失败（违反外键约束）
   * @default
   */
  NO_ACTION = 'NO ACTION',

  /**
   * 限制删除
   * 如果存在子表引用，则阻止删除父表记录
   * 行为与 NO ACTION 类似，但检查时机更早
   */
  RESTRICT = 'RESTRICT',

  /**
   * 级联删除
   * 删除父表记录时，自动删除所有引用该记录的子表记录
   * @example 删除用户时自动删除其所有订单
   * **警告：** 谨慎使用，可能导致大量数据被删除
   */
  CASCADE = 'CASCADE',

  /**
   * 设置为 NULL
   * 删除父表记录时，将子表中的外键字段设置为 NULL
   * @example 删除分类时，将产品的 category_id 设为 NULL
   * **Requires:** 外键字段必须允许 NULL 值
   */
  SET_NULL = 'SET NULL',

  /**
   * 设置为默认值
   * 删除父表记录时，将子表中的外键字段设置为其默认值
   * @example 删除部门时，将员工的 department_id 设为默认部门
   * **Requires:** 外键字段必须定义 DEFAULT 值
   */
  SET_DEFAULT = 'SET DEFAULT'
}

/**
 * 外键更新行为枚举
 * 定义当父表主键被更新时的级联行为
 *
 * 在 SQLite 中，通常不建议更新主键值
 * 大多数情况下使用 NO ACTION 或 RESTRICT
 */
export enum OnUpdateAction {
  /**
   * 不执行任何操作（默认）
   * 当父表主键被更新时，不对子表外键做任何处理
   * 如果存在引用，更新操作会失败（违反外键约束）
   * @default
   */
  NO_ACTION = 'NO ACTION',

  /**
   * 限制更新
   * 如果存在子表引用，则阻止更新父表主键
   */
  RESTRICT = 'RESTRICT',

  /**
   * 级联更新
   * 更新父表主键时，自动更新所有子表中的对应外键值
   * @example 更新用户ID时，自动更新所有订单的 user_id
   * **警告：** 性能开销较大，不推荐频繁使用
   */
  CASCADE = 'CASCADE',

  /**
   * 设置为 NULL
   * 更新父表主键时，将子表中的外键字段设置为 NULL
   * **Requires:** 外键字段必须允许 NULL 值
   */
  SET_NULL = 'SET NULL',

  /**
   * 设置为默认值
   * 更新父表主键时，将子表中的外键字段设置为其默认值
   * **Requires:** 外键字段必须定义 DEFAULT 值
   */
  SET_DEFAULT = 'SET DEFAULT'
}

/**
 * 外键级联选项接口
 * 定义关系的外键约束配置
 *
 * SQLite 外键约束是在数据库层面自动执行的
 * 当父表记录发生变化时，数据库会根据配置自动处理子表记录
 */
export interface ICascadeOptions {
  /**
   * 删除时的级联行为
   * 定义删除父表记录时如何处理子表的外键
   *
   * @example
   * ```typescript
   * // 删除用户时级联删除订单
   * onDelete: OnDeleteAction.CASCADE
   *
   * // 删除分类时将产品的分类ID设为NULL
   * onDelete: OnDeleteAction.SET_NULL
   *
   * // 如果有订单则不允许删除用户
   * onDelete: OnDeleteAction.RESTRICT
   * ```
   *
   * @default 根据关系类型自动推断
   */
  onDelete?:
    | OnDeleteAction
    | `${OnDeleteAction.CASCADE}`
    | `${OnDeleteAction.NO_ACTION}`
    | `${OnDeleteAction.RESTRICT}`
    | `${OnDeleteAction.SET_DEFAULT}`
    | `${OnDeleteAction.SET_NULL}`;

  /**
   * 更新时的级联行为
   * 定义更新父表主键时如何处理子表的外键
   *
   * @example
   * ```typescript
   * // 更新用户ID时级联更新订单的user_id
   * onUpdate: OnUpdateAction.CASCADE
   *
   * // 不允许更新主键（推荐）
   * onUpdate: OnUpdateAction.RESTRICT
   * ```
   *
   * @default OnUpdateAction.RESTRICT（推荐不更新主键）
   */
  onUpdate?:
    | OnUpdateAction
    | `${OnUpdateAction.CASCADE}`
    | `${OnUpdateAction.NO_ACTION}`
    | `${OnUpdateAction.RESTRICT}`
    | `${OnUpdateAction.SET_DEFAULT}`
    | `${OnUpdateAction.SET_NULL}`;
}

/**
 * 标量类型
 * 定义可以直接存储的基本数据类型
 */
export type RxDBScalar = boolean | number | string | bigint | Date | Uint8Array;

// ------------------------------------------------------[ 字段语义 format ]

/**
 * 单行纯文本。
 *
 * @remarks
 * `format` 是纯粹的语义/展示标注：给字段加、改、删 `format` 不改变它的运行时值类型、
 * 持久化列类型或序列化形状。单值/多值的唯一表达方式是选对 {@link PropertyType}
 * 或 {@link RelationKind}，`format` 不参与。
 */
export interface PlainTextFormat {
  kind: 'plainText';
}

/** 多行纯文本。 */
export interface MultilineTextFormat {
  kind: 'multilineText';
}

/**
 * 富文本。
 *
 * @remarks
 * 通信格式必须是 `text/markdown` 或 `text/html`；禁止把编辑器私有 JSON 当作公共协议。
 * 本层只做无损透传，不做净化，也不承诺内容安全。
 */
export interface RichTextFormat {
  kind: 'richText';
  contentType: 'text/html' | 'text/markdown';
}

/**
 * URL。
 *
 * @remarks
 * `schemes` 中每项必须匹配 `/^[A-Za-z][A-Za-z0-9+.-]*$/`（不带冒号）。
 */
export interface UrlFormat {
  kind: 'url';
  schemes?: readonly string[];
}

/** 邮箱地址。 */
export interface EmailFormat {
  kind: 'email';
}

/** 电话号码。 */
export interface PhoneFormat {
  kind: 'phone';
}

/** 源代码。`language` 非空时原样透传，不校验语言是否存在。 */
export interface CodeFormat {
  kind: 'code';
  language?: string;
}

/** 颜色。 */
export interface ColorFormat {
  kind: 'color';
  colorSpace?: 'hex' | 'hsl' | 'hsv' | 'lab' | 'lch' | 'rgb';
}

/** 普通数字。 */
export interface NumberFormat {
  kind: 'number';
  min?: number;
  max?: number;
  step?: number;
}

/** 货币。`currency` 只校验 ISO 4217 的代码形状 `/^[A-Z]{3}$/`，不内置货币分配表。 */
export interface CurrencyFormat {
  kind: 'currency';
  currency: string;
  min?: number;
  max?: number;
  step?: number;
}

/** 百分比。`scale` 决定固有值域：`0..1` 为 `[0, 1]`，`0..100` 为 `[0, 100]`。 */
export interface PercentageFormat {
  kind: 'percentage';
  scale: '0..1' | '0..100';
  min?: number;
  max?: number;
  step?: number;
}

/** 评分。要求 `min < max` 且 `(max - min) / step` 为整数，保证两个端点都可选。 */
export interface RatingFormat {
  kind: 'rating';
  min: number;
  max: number;
  step: number;
}

/** 时长。必须声明单位。 */
export interface DurationFormat {
  kind: 'duration';
  unit: 'd' | 'h' | 'min' | 'ms' | 's';
  min?: number;
  max?: number;
  step?: number;
}

/** 日期时间。`timezone` 是 opaque hint，本层不验证 IANA 数据库。 */
export interface DateTimeFormat {
  kind: 'dateTime';
  timezone?: string;
  display?: 'date' | 'datetime' | 'time';
}

/** 单项选择。载体是 {@link EnumProperty}，选项集合由其 `enum` 决定。 */
export interface SingleSelectFormat {
  kind: 'singleSelect';
}

/** 多项选择。载体是 {@link StringArrayProperty}，此时其 `enum` 必填。 */
export interface MultiSelectFormat {
  kind: 'multiSelect';
}

/**
 * 字段业务语义与默认渲染方式的判别联合。
 *
 * @remarks
 * 只声明在具体属性接口上；四种关系接口一律不接受 `format`。
 */
export type FieldFormat =
  | ColorFormat
  | CodeFormat
  | CurrencyFormat
  | DateTimeFormat
  | DurationFormat
  | EmailFormat
  | MultilineTextFormat
  | MultiSelectFormat
  | NumberFormat
  | PercentageFormat
  | PhoneFormat
  | PlainTextFormat
  | RatingFormat
  | RichTextFormat
  | SingleSelectFormat
  | UrlFormat;

/**
 * 单个枚举选项的展示元数据。
 *
 * @remarks
 * 选项值的唯一真相源是 `enum` 数组，本接口只承载展示信息：删除、禁用或重命名 `label`
 * 都不能破坏已有数据。`disabled` 只影响展示，不改变枚举合法性。
 */
export interface FieldOptionDisplay {
  label?: string;
  color?: string;
  disabled?: boolean;
}

/**
 * 按枚举值索引的展示元数据。键必须是 `enum` 的子集。
 */
export type FieldOptions = Readonly<Record<string, FieldOptionDisplay>>;

/**
 * 实体关系基础类型接口
 * 所有关系类型的基础接口
 */
interface EntityRelationMetadataBase extends ISortable, ICascadeOptions {
  /**
   * 名字
   */
  name: Uncapitalize<string>;

  /**
   * 显示名称
   * @example "用户", "订单项"
   */
  displayName?: string;

  /**
   * 数据库中的列名称
   */
  columnName?: string;

  /**
   * 类型
   */
  kind: RelationKind;

  /**
   * 关联的实体的命名空间
   * 只能包含小写的英文字母
   * 在 postgres 里会变成 schema
   * 在 sqlite 会变成 table 的前缀
   * @example "app", "system"
   * @default "public"
   */
  mappedNamespace?: Lowercase<string>;

  /**
   * 关联的实体
   */
  mappedEntity: Capitalize<string>;

  /**
   * 关联实体的属性名
   */
  mappedProperty: Uncapitalize<string>;
}

/**
 * 一对一关系元数据接口
 * 定义两个实体之间的一对一关系
 *
 * ## 默认级联行为
 * - onDelete: CASCADE - 删除父实体时级联删除子实体
 * - onUpdate: RESTRICT - 不允许更新主键
 *
 * @example
 * ```typescript
 * // 写在 @Entity() 的 relations 数组里
 * relations: [
 *   {
 *     name: 'profile',
 *     kind: RelationKind.ONE_TO_ONE,
 *     mappedEntity: 'Profile',
 *     mappedProperty: 'user',
 *     nullable: false
 *     // onDelete 默认为 CASCADE
 *     // onUpdate 默认为 RESTRICT
 *   }
 * ]
 * ```
 */
interface EntityRelationOneToOneMetadataOptions extends EntityRelationMetadataBase, IEntityObject {
  kind: RelationKind.ONE_TO_ONE;
  /**
   * 默认值
   */
  default?: RxDBEntityId | (() => RxDBEntityId);
  /**
   * 关系不接受 `format`：单值/多值只由 `kind` 表达
   */
  format?: never;
  /**
   * 关系恒为只读，写入必须走 `${name}Id` 外键属性，不接受显式声明
   */
  readonly?: never;
}

/**
 * 一对多关系元数据接口
 * 定义一个实体与多个实体之间的关系
 *
 * ## 默认级联行为
 * - onDelete: CASCADE - 删除父实体时级联删除所有子实体
 * - onUpdate: RESTRICT - 不允许更新主键
 *
 * @example
 * ```typescript
 * // 写在 @Entity() 的 relations 数组里
 * relations: [
 *   {
 *     name: 'items',
 *     kind: RelationKind.ONE_TO_MANY,
 *     mappedEntity: 'OrderItem',
 *     mappedProperty: 'order'
 *     // onDelete 默认为 CASCADE（删除订单时删除所有订单项）
 *     // onUpdate 默认为 RESTRICT
 *   }
 * ]
 * ```
 */
interface EntityRelationOneToManyMetadataOptions extends EntityRelationMetadataBase {
  kind: RelationKind.ONE_TO_MANY;
  /**
   * 关系不接受 `format`：单值/多值只由 `kind` 表达
   */
  format?: never;
  /**
   * 关系恒为只读，集合通过 add / remove 变更，不接受显式声明
   */
  readonly?: never;
}

/**
 * 多对一关系元数据接口
 * 定义多个实体与一个实体之间的关系
 *
 * ## 默认级联行为
 * - nullable: false 时
 *   - onDelete: RESTRICT - 阻止删除父实体（保护数据完整性）
 *   - onUpdate: RESTRICT - 不允许更新主键
 * - nullable: true 时
 *   - onDelete: SET_NULL - 删除父实体时将外键设为NULL
 *   - onUpdate: RESTRICT - 不允许更新主键
 *
 * @example
 * ```typescript
 * // 写在 @Entity() 的 relations 数组里
 * relations: [
 *   // nullable: false（默认）
 *   {
 *     name: 'order',
 *     kind: RelationKind.MANY_TO_ONE,
 *     mappedEntity: 'Order',
 *     mappedProperty: 'items',
 *     nullable: false
 *     // onDelete 默认为 RESTRICT（订单有订单项时不允许删除）
 *     // onUpdate 默认为 RESTRICT
 *   },
 *   // nullable: true
 *   {
 *     name: 'category',
 *     kind: RelationKind.MANY_TO_ONE,
 *     mappedEntity: 'Category',
 *     mappedProperty: 'products',
 *     nullable: true
 *     // onDelete 默认为 SET_NULL（删除分类时产品保留但分类ID设为NULL）
 *     // onUpdate 默认为 RESTRICT
 *   }
 * ]
 * ```
 */
interface EntityRelationManyToOneMetadataOptions extends EntityRelationMetadataBase, IEntityObject {
  kind: RelationKind.MANY_TO_ONE;
  /**
   * 默认值
   */
  default?: RxDBEntityId | (() => RxDBEntityId);
  /**
   * 关系不接受 `format`：单值/多值只由 `kind` 表达
   */
  format?: never;
  /**
   * 关系恒为只读，写入必须走 `${name}Id` 外键属性，不接受显式声明
   */
  readonly?: never;
}

/**
 * 多对多关系元数据接口
 * 定义多个实体与多个实体之间的关系，通常需要中间表（连接表）
 *
 * 多对多关系允许一个实体的多个实例关联到另一个实体的多个实例。
 * 例如：学生和课程的关系，一个学生可以选多门课程，一门课程可以有多个学生。
 * 这种关系需要一个中间表来存储两个实体之间的关联关系。
 *
 * ## 默认级联行为
 * - onDelete: RESTRICT - 阻止删除（需要手动处理中间表）
 * - onUpdate: RESTRICT - 不允许更新主键
 *
 * @example
 * ```typescript
 * // 写在 @Entity() 的 relations 数组里
 * relations: [
 *   {
 *     name: 'courses',
 *     kind: RelationKind.MANY_TO_MANY,
 *     mappedEntity: 'Course',
 *     mappedProperty: 'students',
 *     junctionEntityType: StudentCourse
 *     // onDelete 默认为 RESTRICT（删除学生前需要先删除选课记录）
 *     // onUpdate 默认为 RESTRICT
 *   }
 * ]
 * ```
 */
interface EntityRelationManyToManyMetadataOptions extends EntityRelationMetadataBase {
  kind: RelationKind.MANY_TO_MANY;
  /**
   * 关系不接受 `format`：单值/多值只由 `kind` 表达
   */
  format?: never;
  /**
   * 关系恒为只读，集合通过 add / remove 变更，不接受显式声明
   */
  readonly?: never;

  /**
   * 数据库中的列名称
   * 对于多对多关系，通常不直接在当前实体中存储外键，而是通过中间表来管理关联关系, 所以这个会在中间表里体现
   */
  columnName?: string;
  /**
   * 中间表（连接表）的实体类型
   * 用于存储多对多关系中两个实体之间的关联
   * 中间表通常包含两个外键，分别指向关联的两个实体
   * 系统会根据这个实体类型自动创建中间表，并处理关联关系的增删改查
   */
  junctionEntityType?: EntityType;
}

/**
 * 实体关系元数据联合类型
 * 包含所有可能的关系类型（一对一、一对多、多对一、多对多）
 *
 * 在定义实体时，可以使用这些关系类型来配置实体之间的关联
 * 系统会根据关系类型自动处理外键、查询和关联操作
 */
export type EntityRelationMetadataOptions =
  | EntityRelationOneToOneMetadataOptions
  | EntityRelationOneToManyMetadataOptions
  | EntityRelationManyToOneMetadataOptions
  | EntityRelationManyToManyMetadataOptions;

/**
 * 一对一
 */
export type EntityRelationOneToOneMetadata = SetRequired<
  EntityRelationOneToOneMetadataOptions,
  'mappedNamespace' | 'columnName'
>;

/**
 * 一对多
 */
export type EntityRelationOneToManyMetadata = SetRequired<EntityRelationOneToManyMetadataOptions, 'mappedNamespace'>;

/**
 * 多对一
 */
export type EntityRelationManyToOneMetadata = SetRequired<
  EntityRelationManyToOneMetadataOptions,
  'mappedNamespace' | 'columnName'
>;

/**
 * 多对多
 */
export type EntityRelationManyToManyMetadata = SetRequired<
  EntityRelationManyToManyMetadataOptions,
  'mappedNamespace' | 'junctionEntityType' | 'columnName'
>;

export type EntityRelationMetadata =
  | EntityRelationOneToOneMetadata
  | EntityRelationOneToManyMetadata
  | EntityRelationManyToOneMetadata
  | EntityRelationManyToManyMetadata;

// ------------------------------------------------------[ 基础 ]

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
    | PlainTextFormat
    | MultilineTextFormat
    | RichTextFormat
    | UrlFormat
    | EmailFormat
    | PhoneFormat
    | CodeFormat
    | ColorFormat;
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
  format?: SingleSelectFormat;
  /**
   * 枚举值的展示元数据，键必须是 `enum` 的子集
   */
  options?: FieldOptions;
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
  format?: NumberFormat | RatingFormat | DurationFormat;
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
  format?: DateTimeFormat;
}

export interface BooleanProperty extends IEntityObject, ISortable {
  type: PropertyType.boolean | `${PropertyType.boolean}`;
  default?: boolean | (() => boolean);
}
// ------------------------------------------------------[ 数组 ]
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
  format?: MultiSelectFormat;
  /**
   * 枚举值的展示元数据，键必须是 `enum` 的子集
   */
  options?: FieldOptions;
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
  format?: NumberFormat | CurrencyFormat | PercentageFormat | RatingFormat | DurationFormat;
}
// ------------------------------------------------------[ 对象 ]

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

/**
 * 实体定义元数据选项接口
 * 用于配置 `@Entity` 装饰器的完整选项，定义实体的结构和行为
 *
 * 这个接口是实体定义的核心，包含了实体的所有配置信息：
 * - 基本信息：名称、命名空间、显示名称
 * - 结构信息：属性、关系、索引
 * - 行为信息：抽象类标记、日志配置、同步策略
 *
 * @example
 * ```typescript
 * @Entity({
 *   name: 'User',
 *   displayName: '用户',
 *   properties: [
 *     { name: 'name', type: PropertyType.string, displayName: '姓名' },
 *     { name: 'age', type: PropertyType.number, displayName: '年龄' }
 *   ],
 *   relations: [
 *     { name: 'profile', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'Profile', mappedProperty: 'user' },
 *     { name: 'posts', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'Post', mappedProperty: 'author' }
 *   ]
 * })
 * class User extends EntityBase {}
 * ```
 */
export interface EntityMetadataOptions {
  /**
   * 命名空间
   * 只能包含小写的英文字母
   * 在 postgres 里会变成 schema
   * 在 sqlite 会变成 table 的前缀
   * @example "app", "system"
   * @default "public"
   */
  namespace?: Lowercase<string>;

  /**
   * 名称
   */
  name: Capitalize<string>;

  /**
   * 表名称
   * 数据库中的表名称
   * 没有填写就是 name 一样
   */
  tableName?: string;

  /**
   * 显示名称
   * @example "用户", "订单项"
   */
  displayName?: string;

  /**
   * 继承的实体名称列表
   * 表示当前实体继承自哪些实体
   */
  extends?: string[];

  /**
   * 自定义 repository
   * @default "Repository"
   */
  repository?: 'Repository' | 'TreeRepository' | string;

  /**
   * 是否开启日志
   * @default true
   */
  log?: boolean;

  /**
   * 实体同步配置
   */
  sync?: SyncOptions;

  /**
   * 是否为抽象实体
   * 抽象类是不能被实例化的
   */
  abstract?: boolean;

  /**
   * 实体的属性表
   * 自己定义的属性，不包括继承的
   */
  properties?: EntityPropertyMetadataOptions[];

  /**
   * 计算属性
   * 动态计算的只读属性，不存储在数据库中
   *
   * ## 使用条件
   * - 必须在 `features` 中启用对应功能（如 `tree:{ hasChildren: true }`）
   * - 仅在实体上可读，不可修改
   *
   * ## 计算来源
   * 1. **数据库查询**：例如树结构的 `hasChildren` 属性
   * 2. **类方法**：通过 getter 方法计算，如 `fullName = firstName + lastName`
   * 3. **复杂逻辑**：基于业务规则动态生成（待实现）
   *
   * @example
   * ```typescript
   * // 树结构中的计算属性
   * computedProperties: [
   *   { name: 'hasChildren', type: PropertyType.boolean }
   * ]
   * ```
   *
   * **注意：** 当前仅在树结构（`tree` feature）中使用
   */
  computedProperties?: EntityPropertyMetadataOptions[];

  /**
   * 实体的关系配置
   * 自己定义的关系，不包括继承的
   *
   * 定义实体与其他实体之间的关联关系，支持四种关系类型：
   * - ONE_TO_ONE：一对一关系，如用户和用户资料
   * - ONE_TO_MANY：一对多关系，如用户和用户的多篇文章
   * - MANY_TO_ONE：多对一关系，如多篇文章和一个作者
   * - MANY_TO_MANY：多对多关系，如学生和课程
   *
   * 系统会根据关系配置自动处理外键、查询和关联操作
   */
  relations?: EntityRelationMetadataOptions[];

  /**
   * 实体的索引配置
   * 自己定义的索引，不包括继承的
   */
  indexes?: EntityIndexMetadataOptions[];

  /**
   * 实体级多列外键约束。
   *
   * 单列关系仍使用 `relations`；只有需要把多列作为一个整体校验时才使用本配置。
   */
  foreignKeys?: EntityForeignKeyMetadataOptions[];

  /**
   * 功能特性
   */
  features?: EntityMetadataFeatures;
}

type TreeType = 'adjacency-list';

/**
 * 实体元数据树形结构特性接口
 */
export interface EntityMetadataTreeFeatures {
  /**
   * 树形结构类型
   *
   * 目前仅支持 adjacency-list (邻接表模型)，未来可能支持其他模型：
   * - 'closure-table': 闭包表模型
   * - 'nested-set': 嵌套集模型
   * - 'materialized-path': 物化路径模型
   *
   * 参考资料：
   * - https://www.slideshare.net/slideshow/models-for-hierarchical-data/4179181
   * - https://schinckel.net/2014/09/13/long-live-adjacency-lists/
   *
   * @default 'adjacency-list'
   */
  type?: TreeType;

  /**
   * 是否有子节点
   * 在树结构里使用，表示当前节点是否有子节点
   * @default false
   */
  hasChildren?: boolean;
}

/**
 * EntityMetadata 扩展特性
 */
export interface EntityMetadataFeatures {
  [name: string]: unknown;
  /**
   * 树形结构特性
   */
  tree?: EntityMetadataTreeFeatures;
}

/**
 * 同步适配器选项接口
 * 定义数据同步适配器的配置
 */
export interface SyncAdapterOptions {
  adapter: string;
}

/**
 * 同步类型枚举
 * 定义不同的数据同步策略，控制本地数据和远程数据之间的同步方式
 *
 * 支持三种同步策略:
 * - Full: 全量同步，同步所有数据
 * - Filter: 条件同步，根据过滤条件同步部分数据
 * - none: 不同步，可以配置为只使用本地数据或只使用远程数据
 */
export enum SyncType {
  /**
   * 全量同步
   */
  Full = 'full',

  /**
   * 根据过滤条件同步
   */
  Filter = 'filter',

  /**
   * 查询缓存同步模式
   *
   * @experimental
   * 统一 Repository 尚未接入 {@link QueryCacheRepository}，配置该模式当前不会生效。
   */
  QueryCache = 'QueryCache',

  /**
   * 不同步
   */
  None = 'none'
}

/**
 * 全量同步配置接口
 * 定义完整数据同步的配置
 */
interface SyncFull {
  type: SyncType.Full;
  local: SyncAdapterOptions;
  remote: SyncAdapterOptions;
}

/**
 * 远程数据配置接口
 * 定义只访问远程数据而不同步到本地的配置
 */
interface Remote {
  type: SyncType.None;
  local?: SyncAdapterOptions;
  remote: SyncAdapterOptions;
}

/**
 * 本地数据配置接口
 * 定义只访问本地数据而不同步到远程的配置
 */
interface Local {
  type: SyncType.None;
  local: SyncAdapterOptions;
  remote?: SyncAdapterOptions;
}

/**
 * 完全不参与同步的实体配置。
 *
 * @remarks
 * 适用于由插件自行选择持久化适配器的内部实体。它与省略 `sync` 不同：省略会继承
 * 数据库级同步配置，而本配置会显式阻止实体被推送或拉取。
 */
interface SyncDisabled {
  type: SyncType.None;
  local?: never;
  remote?: never;
}

interface SyncFilterRemoteAdapterOptions extends SyncAdapterOptions {
  /**
   * 同步过滤条件
   * 定义哪些数据需要被同步，例如最近 30天 的数据
   */
  filter: () => RuleGroup<Record<string, unknown>>;
}

/**
 * 条件同步配置接口（未实现）
 * 定义基于过滤条件的数据同步配置
 */
interface SyncFilter {
  type: SyncType.Filter;
  local: SyncAdapterOptions;
  remote: SyncFilterRemoteAdapterOptions;
}

interface SyncQueryCacheLocalAdapterOptions extends SyncAdapterOptions {
  /**
   * 本地缓存优先
   * true 查询默认使用本地缓存
   */
  localCacheFirst?: boolean;
}

type SyncQueryCacheRemoteAdapterOptions = SyncAdapterOptions;

/**
 * 根据查询增量同步缓存配置接口（未实现）
 *
 * 1. 查询到的内容，返回数组 [{ id:'xxx', updatedAt: Date }]
 * 2. 根据这些 id 看本地是否有这个数据，没有就拉取完整数据，有就对比 updatedAt 决定是否拉取
 */
interface SyncQueryCache {
  type: SyncType.QueryCache;
  local: SyncQueryCacheLocalAdapterOptions;
  remote: SyncQueryCacheRemoteAdapterOptions;
}

/**
 * 实体元数据，用于 QueryCache 新鲜度比较
 *
 * 这是运行时类型，不对应物理表。用于元数据查询结果，
 * 通过比较本地和远程的 `updatedAt` 来判断数据是否需要更新。
 *
 * @example
 * ```typescript
 * const remoteMetadata: QueryCacheEntityMetadata[] = [
 *   { id: 'entity-1', updatedAt: '2026-01-12T10:00:00Z' },
 *   { id: 'entity-2', updatedAt: '2026-01-12T09:30:00Z' },
 * ];
 * ```
 */
export interface QueryCacheEntityMetadata {
  /** 实体唯一标识 */
  id: string;
  /** 最后更新时间 (ISO 8601 字符串) */
  updatedAt: string;
}

/**
 * 同步配置联合类型
 * 包含所有可能的同步配置类型
 */
export type SyncOptions = SyncFull | SyncFilter | SyncQueryCache | Remote | Local | SyncDisabled;
