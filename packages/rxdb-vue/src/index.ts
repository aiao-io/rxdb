/**
 * @fileoverview RxDB Vue 集成包
 * 提供 RxDB 数据库的 Vue 3 Composition API 接口
 *
 * @module @aiao/rxdb-vue
 */

/**
 * RxDB Vue 3 Hooks（组合式 API）
 * - useGet: 通过 ID 获取单个实体
 * - useFindOne: 查找匹配条件的单个实体
 * - useFindOneOrFail: 查找单个实体或抛出错误
 * - useFind: 查找多个匹配条件的实体
 * - useFindByCursor: 使用游标分页查找实体
 * - useFindAll: 查找所有实体
 * - useCount: 统计匹配条件的实体数量
 * - useFindDescendants: 查找树形结构的后代实体
 * - useCountDescendants: 统计后代实体数量
 * - useFindAncestors: 查找树形结构的祖先实体
 * - useCountAncestors: 统计祖先实体数量
 * - useGraphNeighbors: 查找图结构的邻居实体
 * - useCountNeighbors: 统计邻居实体数量
 * - useGraphPaths: 查找图中的路径
 */
export type { GraphPath, GraphQueryResult, NeighborResult } from '@aiao/rxdb-plugin-graph';
export * from './hooks';

/**
 * RxDB Vue 集成组件
 */
export * from './rxdb-vue';

/**
 * RxDB Vue 无限滚动组合式函数
 */
export * from './useInfiniteScroll';

/**
 * 异步操作状态管理（三端等价：Angular `useAction` / React `useAction`）
 * - useAction: 把异步函数包成带 isPending 计数的可调用 action
 */
export * from './use-action';

/**
 * localStorage 命名空间持久化状态（三端等价：Angular / React `usePersistedState`）
 * - usePersistedState: 同 namespace + name 复用同一个 Ref，写入即落盘
 */
export * from './use-persisted-state';

/**
 * 实体 patch 到响应式系统的桥接（Angular 侧对应 `RxDBEntityChangeDirective`）
 * - useEntityChange: 让实体的原地修改实时反映到视图
 */
export * from './use-entity-change';

/**
 * local-first 同步状态面板（三端等价：Angular `useSyncState` / React `useSyncState`）
 * - useSyncState: 网通不通、还有多少没推上去、这会儿在不在推、上次错在哪、上次谁判负
 */
export * from './use-sync-state';
