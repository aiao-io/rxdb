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

import type { EntityForeignKeyMetadataOptions, EntityIndexMetadataOptions, EntityPropertyMetadataOptions } from './property-types.interface.js';
import type { EntityRelationMetadataOptions } from './relation-types.interface.js';
import type { SyncOptions } from './sync-options.interface.js';

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
