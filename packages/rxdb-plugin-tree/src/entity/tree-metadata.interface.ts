/**
 * @fileoverview 树形实体的元数据特性
 *
 * 经 `plugin.ts` 的 `declare module '@aiao/rxdb'` 挂到 `EntityMetadataFeatures.tree` 上。
 */

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
