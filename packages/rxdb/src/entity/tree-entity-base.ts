/**
 * @fileoverview 树形实体基类定义文件
 * 提供基于邻接表模型的树形结构实体基类
 */

import { Observable } from 'rxjs';
import type { FindTreeOptions } from '../repository/tree-repository.interface.js';
import { EntityBase } from './entity-base.js';
import { Entity } from './entity.decorator.js';
import { RxDBEntityId, UUID } from './entity.interface.js';
import { EntityMetadataOptions, OnDeleteAction, PropertyType, RelationKind } from './metadata-options.interface.js';
import { ITreeEntity } from './tree-entity.interface.js';

export const TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: EntityMetadataOptions = {
  name: 'TreeAdjacencyListEntityBase',
  abstract: true, // 标记为抽象类，不会直接创建此类的实例
  // 基类声明了 findDescendants / countAncestors 等静态方法，而这些只由 TreeRepository 注入。
  // 因此这里必须显式声明 —— 子类沿原型链继承到它，才不会「类型上有、运行时没有」。
  // 不写 repository 的子类（`@Entity({ name: 'Category' })`）正是靠这一行拿到树查询能力。
  repository: 'TreeRepository',
  computedProperties: [
    {
      name: 'hasChildren', // 是否有子节点
      displayName: '是否有子节点',
      type: PropertyType.boolean, // 布尔类型
      nullable: true,
      readonly: true
    }
  ],
  relations: [
    {
      name: 'children', // 子节点关系名称
      displayName: '子节点',
      kind: RelationKind.ONE_TO_MANY, // 一对多关系
      mappedEntity: 'TreeAdjacencyListEntityBase', // 关联到同一实体类型
      mappedProperty: 'parent' // 映射到子实体的 parent 属性
    },
    {
      name: 'parent', // 父节点关系名称
      columnName: 'parentId', // 外键列名
      displayName: '父节点',
      kind: RelationKind.MANY_TO_ONE, // 多对一关系
      mappedEntity: 'TreeAdjacencyListEntityBase', // 关联到同一实体类型
      mappedProperty: 'children', // 映射到父实体的 children 属性
      nullable: true, // 允许根节点没有父节点
      onDelete: OnDeleteAction.CASCADE // 删除父节点时级联删除子节点
    }
  ],
  features: {
    tree: {
      type: 'adjacency-list', // 指定为邻接表树形结构
      hasChildren: true // 启用 hasChildren 计算属性
    }
  }
} as const;

/**
 * 树形实体装饰器配置
 * 定义了树形结构所需的父子关系
 */
@Entity(TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS)

/**
 * 邻接表树形结构实体基类
 *
 * 基于邻接表模型实现的树形结构，每个节点通过 parent 引用其父节点，
 * 通过 children 集合引用其所有子节点。
 *
 * 邻接表模型是实现树形结构的简单高效方式，适合大多数树形数据场景。
 *
 * 参考资料：
 * - https://www.slideshare.net/slideshow/models-for-hierarchical-data/4179181
 * - https://schinckel.net/2014/09/13/long-live-adjacency-lists/
 *
 * @typeParam Id - 主键类型，与 {@link EntityBase} 的 `Id` 同源，缺省 {@link UUID}。
 *   `parentId` 跟随收窄 —— 一个节点的 `parentId` 指向的正是同类节点的 `id`，
 *   两者必须是同一个类型，数值主键的树才能在类型层表达。
 *
 * @example
 * ```typescript
 * @Entity({ name: 'Category' })
 * class Category extends TreeAdjacencyListEntityBase {
 * }
 *
 * // 数值主键的树
 * @Entity({ name: 'Menu', properties: [{ name: 'id', type: PropertyType.integer, primary: true }] })
 * class Menu extends TreeAdjacencyListEntityBase<number> {
 * }
 * ```
 */
export abstract class TreeAdjacencyListEntityBase<Id extends RxDBEntityId = UUID>
  extends EntityBase<Id>
  implements ITreeEntity
{
  /**
   * 父节点ID
   */
  parentId?: Id | null;

  /**
   * 是否有子节点，由数据库计算属性自动填充。
   * `declare` 因为它是 metadata 注入的计算属性，class 不需要初始化。
   */
  declare hasChildren?: boolean | null;

  /**
   * 查询所有子孙节点
   * @param options - 查询选项，包含实体ID和层级深度
   * @returns Observable 包装的子孙节点数组
   */
  declare static findDescendants: <T extends TreeAdjacencyListEntityBase<RxDBEntityId>>(
    this: new () => T,
    options: FindTreeOptions<new () => T>
  ) => Observable<T[]>;

  /**
   * 统计子孙节点数量
   * @param options - 查询选项，包含实体ID和层级深度
   * @returns Observable 包装的子孙节点数量
   */
  declare static countDescendants: <T extends TreeAdjacencyListEntityBase<RxDBEntityId>>(
    this: new () => T,
    options: FindTreeOptions<new () => T>
  ) => Observable<number>;

  /**
   * 查询所有祖先节点
   * @param options - 查询选项，包含实体ID和层级深度
   * @returns Observable 包装的祖先节点数组
   */
  declare static findAncestors: <T extends TreeAdjacencyListEntityBase<RxDBEntityId>>(
    this: new () => T,
    options: FindTreeOptions<new () => T>
  ) => Observable<T[]>;

  /**
   * 统计祖先节点数量
   * @param options - 查询选项，包含实体ID和层级深度
   * @returns Observable 包装的祖先节点数量
   */
  declare static countAncestors: <T extends TreeAdjacencyListEntityBase<RxDBEntityId>>(
    this: new () => T,
    options: FindTreeOptions<new () => T>
  ) => Observable<number>;
}
