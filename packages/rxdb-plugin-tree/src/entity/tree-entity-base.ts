/**
 * @fileoverview 树形实体基类定义文件
 * 提供基于邻接表模型的树形结构实体基类
 */

import { Entity, EntityBase, RxDBEntityId, UUID } from '@aiao/rxdb';
import { Observable } from 'rxjs';
import { TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS } from '../constants.js';
import type { FindTreeOptions } from '../repository/tree-repository.interface.js';
import { ITreeEntity } from './tree-entity.interface.js';

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
