/**
 * @fileoverview 实体关系类型定义
 *
 * 关系种类枚举、级联行为枚举、关系元数据接口的聚合。
 * 本文件只声明"**关系**"层面的形状：关系类型、级联行为、单/多关系元数据。
 * 字段属性、字段语义 format 见：
 * - {@link ./property-types.interface.ts}
 * - {@link ./cascade-options.interface.ts}
 */

import type { SetRequired } from 'type-fest';
import type { EntityType, RxDBEntityId } from './entity.interface.js';

/**
 * 关系接受的字段基础值对象接口
 *
 * @remarks
 * 是 property-types `IEntityObject` 的字段子集：关系不使用 `name` / `columnName` /
 * `displayName` / `readonly` —— 这些字段全部由 {@link EntityRelationMetadataBase}
 * 显式定义。复制此子集避免与 property-types 形成 type-only 循环 import（编译期能
 * 擦除，但会让 IDE 与 `@typescript-eslint/consistent-type-imports` 反复报警）。
 */
interface IRelationObject {
  /** 一对一关系在外键列上恒为唯一 */
  unique?: boolean;
  /** 是否可以为 NULL */
  nullable?: boolean;
  /** 是否为必填 */
  required?: boolean;
  /** 关系不接受加密；显式置 `never` 让误传被类型系统挡掉 */
  encrypted?: never;
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
   * 行为与 NO_ACTION 类似，但检查时机更早
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
 * 大多数情况下使用 NO_ACTION 或 RESTRICT
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
 * 实体关系基础类型接口
 * 所有关系类型的基础接口
 */
interface EntityRelationMetadataBase extends ICascadeOptions {
  /**
   * 是否可排序
   * @default false
   */
  sortable?: boolean;

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
interface EntityRelationOneToOneMetadataOptions extends EntityRelationMetadataBase, IRelationObject {
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
interface EntityRelationManyToOneMetadataOptions extends EntityRelationMetadataBase, IRelationObject {
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
