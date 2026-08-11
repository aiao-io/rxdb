---
id: US-102
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-28
tags: [framework, react]
---

# 用户故事：React 集成

## 作为/我想要/以便

**作为** React 开发者
**我想要** 在 React Hooks 中使用 Aiao
**以便** 我可以使用 React 最佳实践构建响应式应用

## 验收标准

| #   | 前置条件                                                 | 操作                     | 预期结果                   | 状态 |
| --- | -------------------------------------------------------- | ------------------------ | -------------------------- | ---- |
| 1   | 包裹 `<RxDBProvider>`                                    | 子组件调用 `useRxDB()`   | 获取 RxDB 实例             | ✅   |
| 2   | 使用 `useFind(Entity, options)`                          | 数据变更                 | 触发 React 重渲染          | ✅   |
| 3   | 返回 `RxDBResource<T>`                                   | 与 Angular/Vue 对比      | 跨框架 API 一致            | ✅   |
| 4   | 组件卸载                                                 | `useEffect` cleanup 触发 | 自动取消 RxJS 订阅         | ✅   |
| 5   | `useGet/useFindOne/useFindOneOrFail/useFindAll/useCount` | 调用                     | 均可用                     | ✅   |
| 6   | `useFindByCursor` hook                                   | 游标分页                 | 返回正确的分页数据         | ✅   |
| 7   | `useInfiniteScroll` hook                                 | 滚动到底部               | 自动加载下一页并追加到列表 | ✅   |
| 8   | Tree/Graph hooks                                         | 使用树形/图数据实体      | 提供对应 API               | ✅   |
| 9   | React 组件卸载                                           | InfiniteScroll 订阅存在  | 自动取消订阅无内存泄漏     | ✅   |

## 技术笔记

- Provider：`RxDBProvider` + `useRxDB()` Context 模式
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
