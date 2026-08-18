---
id: US-102
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-08-18
tags: [framework, react]
---

# 用户故事：React 集成

## 作为/我想要/以便

**作为** React 开发者
**我想要** 在 React Hooks 中使用 Aiao
**以便** 我可以使用 React 最佳实践构建响应式应用

## 验收标准

| #   | 前置条件                                                 | 操作                                | 预期结果                       | 状态 |
| --- | -------------------------------------------------------- | ----------------------------------- | ------------------------------ | ---- |
| 1   | 包裹 `<RxDBProvider>`                                    | 子组件调用 `useRxDB()`              | 获取 RxDB 实例                 | ✅   |
| 2   | 使用 `useFind(Entity, options)`                          | 数据变更                            | 触发 React 重渲染              | ✅   |
| 3   | 返回 `RxDBResource<T>`                                   | 与 Angular/Vue 对比                 | 跨框架 API 一致                | ✅   |
| 4   | 组件卸载                                                 | `useEffect` cleanup 触发            | 自动取消 RxJS 订阅             | ✅   |
| 5   | `useGet/useFindOne/useFindOneOrFail/useFindAll/useCount` | 调用                                | 均可用                         | ✅   |
| 6   | `useFindByCursor` hook                                   | 游标分页                            | 返回正确的分页数据             | ✅   |
| 7   | `useInfiniteScroll` hook                                 | 滚动到底部                          | 自动加载下一页并追加到列表     | ✅   |
| 8   | Tree/Graph hooks                                         | 使用树形/图数据实体                 | 提供对应 API                   | ✅   |
| 9   | React 组件卸载                                           | InfiniteScroll 订阅存在             | 自动取消订阅无内存泄漏         | ✅   |
| 10  | `db` 收 `RxDBSource`                                     | 传实例 / Promise / 工厂             | 三端接受同一联合类型           | ✅   |
| 11  | 数据库尚未就绪                                           | `useRxDB()` / `useRxDBOptional()`   | 前者抛错、后者返回 `undefined` | ✅   |
| 12  | Provider 卸载                                            | source 是工厂/Promise vs 已就绪实例 | 只断开 Provider 自己造的       | ✅   |

## 技术笔记

- Provider：`RxDBProvider` + `useRxDB()` Context 模式
- 统一异步契约：`db` 收 `RxDBSource = RxDB | Promise<RxDB> | (() => RxDB | Promise<RxDB>)`，
  与 Angular / Vue 同名同义；`db` 仍必填 —— 少传时要报「你没给数据库」，而不是把正用着
  Provider 的人指回 Provider（RRE-008）
- 非实例的 source 必须是稳定引用（模块级常量或 `useMemo`），否则每次 render 都会重建数据库
- 所有权：Provider 只销毁自己造的东西 —— 否则 `StrictMode` 双挂载会断掉调用方的模块级单例，
  留下没人重连的死库
- 响应式：`useFind()` 返回响应式数据，触发 React 重渲染
- 资源管理：`RxDBResource<T>` 提供 `.value` / `.isLoading` / `.error` / `.isFetching`
- 生命周期：`useEffect` cleanup 自动取消 RxJS 订阅
- 无限滚动：`useInfiniteScroll` 订阅管理，自动加载下一页

## 实现文件

- `packages/rxdb-react/src/rxdb.tsx` — Provider + Hooks 核心
- `packages/rxdb-react/src/rxdb-react.ts` — Hooks 封装
- `packages/rxdb-react/src/rxdb-infinite-scroll.ts` — 无限滚动
- `packages/rxdb-react/src/rxdb-tree.ts` — Tree hooks

## 参考

- [文档: React 集成](../../../website/docs/frameworks/react.md)
