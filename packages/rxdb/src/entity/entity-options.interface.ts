/**
 * @fileoverview 实体级元数据选项
 *
 * 实体名称、显示名、属性 / 关系 / 索引 / 外键引用入口，以及特性开关。
 * 本文件不重新声明任何属性/关系类型——它们从 property-types、relation-types、
 * sync-options 导入，避免重复定义。
 *
 * @remarks
 * 这是「实体本身」的元数据；具体「字段」/「关系」/「同步」分别见对应子文件。
 */

import type { RxDBRepositoryName } from '../rxdb-adapter.js';
import type { ManualOrderOptions } from '../sortable/sortable.interface.js';
import type {
  EntityForeignKeyMetadataOptions,
  EntityIndexMetadataOptions,
  EntityPropertyMetadataOptions
} from './property-types.interface.js';
import type { EntityRelationMetadataOptions } from './relation-types.interface.js';
import type { SyncOptions } from './sync-options.interface.js';

/**
 * EntityMetadata 扩展特性
 *
 * @remarks
 * 核心不内置任何具体特性——`tree` 由 `@aiao/rxdb-plugin-tree`、`graph` 由
 * `@aiao/rxdb-plugin-graph` 各自经 `declare module '@aiao/rxdb'` 挂上来。
 * 索引签名是这条扩展路径的落点：没装对应插件的应用，元数据上连字段名都不该出现。
 */
export interface EntityMetadataFeatures {
  [name: string]: unknown;
}

/**
 * 受权限约束的写操作
 *
 * @remarks
 * 只有这三种：读不在模型里——本地库的读权限没有可执行的意义，数据已经在用户手里了。
 */
export type EntityOperation = 'create' | 'update' | 'delete';

/**
 * 单个写操作对谁开放
 *
 * - `'both'`：用户与系统都可以（默认）
 * - `'system'`：只许系统写，用户经门面 `Repository` 写会被拦下
 *
 * @remarks
 * 不支持 `'none'`（谁都不许写）：真正的不可变要靠 SQL 触发器兜底，门面一层挡不住同步、
 * 迁移与适配器直写，声明了也只是假象。不支持 `'user'`（只许用户、不许系统）：在分层模型里
 * 「系统」就是门面之下的适配器与执行器路径，这一层无从判断某次直写是不是「用户的意思」。
 */
export type EntityOperationPermission = 'both' | 'system';

/**
 * 实体的写操作权限声明
 *
 * @remarks
 * 这是**快速失败**，不是安全边界：它在用户写入的入口处早报错，并让 UI 据此隐藏新增 / 编辑 / 删除，
 * 但它挡不住绕过门面的写入。
 *
 * - 检查点：门面 `Repository` 的 `create()` / `update()` / `remove()`，
 *   `EntityManager.mutations()` 整批预检，以及 `Repository.reorder()`（读邻居与写入走执行器，
 *   所以在开事务前自己按 `update` 判定）；
 * - 不检查：适配器与执行器层（同步拉取、迁移、历史回放、工作树物化都走这里），这是系统写入的通道。
 *
 * 按操作就近继承：子类只写 `{ delete: 'system' }` 时，父类收紧的 `update` 照样传下来；
 * 整条原型链都没声明的操作取 `'both'`。
 *
 * @example
 * ```typescript
 * @Entity({ name: 'ExchangeRate', permissions: { create: 'system', update: 'system', delete: 'system' } })
 * class ExchangeRate extends EntityBase {}
 * ```
 */
export interface EntityPermissionOptions {
  /** 新增 */
  create?: EntityOperationPermission;
  /** 修改 */
  update?: EntityOperationPermission;
  /** 删除 */
  delete?: EntityOperationPermission;
}

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
   *
   * @remarks
   * 取值来自门面轴注册表 {@link RxDBRepositoryName}：核心的 `Repository`
   * 与插件经 `declare module` 注册的门面（如 `TreeRepository` / `GraphRepository`）
   * 在补全里同为一等公民。
   * 名字没经 `RxDB.repository()` 登记过时，`EntityManager.init()` 仍会抛错拦下。
   *
   * @default "Repository"
   */
  repository?: RxDBRepositoryName;

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

  /**
   * 写操作权限，见 {@link EntityPermissionOptions}
   *
   * @default 三操作都是 `'both'`
   */
  permissions?: EntityPermissionOptions;

  /**
   * 手动排序：`true` 为整表一条序列，`{ groupBy }` 为按分组字段各自一条序列
   *
   * @remarks
   * 显式 opt-in：只有声明了才启用，恰好有 `sortOrder` 字段的实体行为不变。
   * 启用后实体必须自己声明 `sortOrder`：string、可写、非计算、非加密、非空（`nullable` 为假，建表即 `NOT NULL`），
   * 违反在注册期报 `invalidManualOrder`。沿原型链就近继承，子类可写 `false` 关掉、或改写分组字段。
   *
   * 分组字段只能是实体自身的标量列（含多对一外键列），非计算、可写、非加密，见 {@link ManualOrderOptions}。
   * 未给 `orderBy` 的查询默认按 `[分组字段… asc, sortOrder asc, id asc]` 排；
   * 改了分组字段而没给 `sortOrder` 的写入在事务内追加到新组末尾。
   *
   * 不叫 `sortable`：属性级 / 关系级的 `sortable` 已表示「列头可排序」。
   *
   * @default false
   *
   * @example
   * ```typescript
   * @Entity({
   *   name: 'Todo',
   *   manualOrder: { groupBy: ['completed'] },
   *   properties: [
   *     { name: 'title', type: PropertyType.string },
   *     { name: 'completed', type: PropertyType.boolean },
   *     { name: 'sortOrder', type: PropertyType.string }
   *   ]
   * })
   * class Todo extends EntityBase implements ISortableEntity {
   *   title!: string;
   *   completed!: boolean;
   *   sortOrder!: SortOrderKey;
   * }
   * ```
   */
  manualOrder?: boolean | ManualOrderOptions;
}
