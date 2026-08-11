/**
 * @packageDocumentation
 * 树形实体接口定义
 * 扩展基础实体接口,添加父子关系支持
 */
import { IEntity, RxDBEntityId } from './entity.interface.js';

export interface ITreeEntity extends IEntity {
  /**
   * 父节点主键。与 {@link IEntity.id} 同属 {@link RxDBEntityId} 域 ——
   * 一棵树的 `parentId` 指向的正是另一个节点的 `id`，两者必须允许同样的类型
   * （`string | number | bigint`），否则数值主键的树在类型层根本无法表达。
   */
  parentId?: RxDBEntityId | null;
  /**
   * 是否有子节点。由 `TreeAdjacencyListEntityBase` 的计算属性自动填充，应用层只读。
   * 未启用 `features.tree.hasChildren` 的实体此字段为 `null`。
   */
  hasChildren?: boolean | null;
}

/**
 * 支持手动排序的树形实体接口。
 *
 * 在 {@link ITreeEntity} 基础上要求实体声明 `sortOrder` 字段（通常用 fractional indexing
 * 如 `generateKeyBetween` 产生）。拖放、手动排序等场景的算法约束类型。
 */
export interface ISortableTreeEntity extends ITreeEntity {
  sortOrder?: string | null;
}
