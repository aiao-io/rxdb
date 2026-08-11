/**
 * @fileoverview RxDB React 集成包
 * 提供 RxDB 数据库的 React Hooks 接口
 *
 * @module @aiao/rxdb-react
 */

/**
 * RxDB React 钩子。
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
export * from './hooks.js';

/** 查询 hook 的公开选项类型。 */
export type { UseOptions } from './query-options.js';

/**
 * RxDB React 集成组件
 */
export * from './rxdb-react.js';

/**
 * RxDB React 无限滚动钩子
 */
export * from './useInfiniteScroll.js';

/**
 * 异步操作状态管理（三端等价：Angular `useAction` / Vue `useAction`）
 * - useAction: 把异步函数包成带 isPending 计数的可调用 action
 */
export * from './use-action.js';

/**
 * localStorage 命名空间持久化状态（三端等价：Angular / Vue `usePersistedState`）
 * - usePersistedState: 同 namespace + name 共享同一份状态，写入即落盘
 */
export * from './use-persisted-state.js';

/**
 * 实体 patch 到渲染的桥接（Angular 侧对应 `RxDBEntityChangeDirective`）
 * - useEntityChange: 让实体的原地修改实时反映到视图
 */
export * from './use-entity-change.js';
