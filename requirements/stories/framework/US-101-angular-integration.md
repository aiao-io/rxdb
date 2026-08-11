---
id: US-101
title: Angular 集成
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-28
tags: [framework, angular]
---

# 用户故事：Angular 集成

## 作为/我想要/以便

**作为** Angular 开发者
**我想要** 在 Angular Signals 和 RxJS 中使用 Aiao
**以便** 我可以使用 Angular 最佳实践构建响应式应用

## 验收标准

| #   | 前置条件                                                 | 操作                                    | 预期结果                   | 状态 |
| --- | -------------------------------------------------------- | --------------------------------------- | -------------------------- | ---- |
| 1   | 调用 `provideRxDB(rxdb)`                                 | 注入 providers                          | RxDB 实例可通过 DI 获取    | ✅   |
| 2   | 使用 `useFind(Entity, options)`                          | 数据变更                                | Signal 自动更新            | ✅   |
| 3   | 返回 `RxDBResource<T>`                                   | 访问 `.value` / `.isLoading` / `.error` | 提供完整的加载状态         | ✅   |
| 4   | 组件销毁                                                 | `DestroyRef` 触发                       | 自动取消 RxJS 订阅         | ✅   |
| 5   | `useGet/useFindOne/useFindOneOrFail/useFindAll/useCount` | 调用                                    | 均可用                     | ✅   |
| 6   | `useFindByCursor` hook                                   | 游标分页                                | 返回正确的分页数据         | ✅   |
| 7   | `InfiniteScroll` class                                   | 滚动到底部                              | 自动加载下一页             | ✅   |
| 8   | Angular 独有 `useAction` / `useState`                    | 使用                                    | 支持 localStorage 状态管理 | ✅   |
| 9   | Tree/Graph hooks                                         | 使用树形/图数据实体                     | 提供对应 API               | ✅   |
| 10  | `ChangeDetector` directive                               | 绑定到组件                              | 优化变更检测性能           | ✅   |

## 技术笔记

- DI 集成：`provideRxDB()` + `injectRxDB()` 依赖注入模式
- 响应式：`useFind()` 返回 Signal，自动订阅 RxJS Observable
- 资源管理：`RxDBResource<T>` 提供 `.value` / `.isLoading` / `.error` / `.isFetching`
- 生命周期：`DestroyRef` 自动管理订阅清理
- 状态管理：`useAction` / `useState` 支持 localStorage 持久化

## 实现文件

- `packages/rxdb-angular/src/rxdb.provider.ts` — DI Provider
- `packages/rxdb-angular/src/rxdb.ts` — Hooks 核心
- `packages/rxdb-angular/src/rxdb-infinite-scroll.ts` — 无限滚动
- `packages/rxdb-angular/src/rxdb-change-detector.directive.ts` — 变更检测优化
- `packages/rxdb-angular/src/rxdb-tree.ts` — Tree hooks

## 参考

- [文档: Angular 集成](../../../website/docs/frameworks/angular.md)
