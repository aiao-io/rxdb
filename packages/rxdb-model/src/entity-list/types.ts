/**
 * 实体列表共享类型。
 *
 * @module entity-list/types
 */
/**
 * RxDB 实体实例（用于 CRUD 操作）。
 *
 * 三端组件库（Angular / React / Vue）此前各自内联了同形副本，现收敛到核心包
 * 统一透传：Angular / Vue 经包根 `export *` 链、React 经 entity-list 模块显式再导出。
 */
export type EntityInstance = {
  [key: string]: unknown;
  readonly id: string;
  save(): Promise<void>;
  remove(): Promise<void>;
};

/**
 * 筛选查询结构（与用户筛选条件做 AND 合并）。
 */
export type FilterQuery = { combinator: 'and' | 'or'; rules: unknown[] };
