---
id: US-103
title: Vue 集成
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-08-18
tags: [framework, vue]
---

# 用户故事：Vue 集成

## 作为/我想要/以便

**作为** Vue 开发者
**我想要** 在 Vue Composables 中使用 Aiao
**以便** 我可以使用 Vue 最佳实践构建响应式应用

## 验收标准

| #   | 前置条件                                                 | 操作                                        | 预期结果                       | 状态 |
| --- | -------------------------------------------------------- | ------------------------------------------- | ------------------------------ | ---- |
| 1   | 调用 `provideRxDB(rxdb)`                                 | 子组件 `injectRxDB()`                       | 获取 RxDB 实例                 | ✅   |
| 2   | 使用 `useFind(Entity, options)`                          | 数据变更                                    | reactive 对象自动更新          | ✅   |
| 3   | 查询选项接受 `Ref<T>` / `ComputedRef<T>`                 | 选项变化                                    | 查询自动重新执行               | ✅   |
| 4   | scope 销毁                                               | `onScopeDispose` 触发                       | 自动取消 RxJS 订阅             | ✅   |
| 5   | `useGet/useFindOne/useFindOneOrFail/useFindAll/useCount` | 调用                                        | 均可用                         | ✅   |
| 6   | `useFindByCursor` composable                             | 游标分页                                    | 返回正确的分页数据             | ✅   |
| 7   | `InfiniteScroll` composable                              | 滚动到底部                                  | 自动加载下一页                 | ✅   |
| 8   | Tree/Graph composables                                   | 使用树形/图数据实体                         | 提供对应 API                   | ✅   |
| 9   | 返回 `RxDBResource<T>`                                   | 与 Angular/React 对比                       | 接口完全一致                   | ✅   |
| 10  | `provideRxDB` 收 `RxDBSource`                            | 传实例 / Promise / 工厂                     | 三端接受同一联合类型           | ✅   |
| 11  | 数据库尚未就绪                                           | `useRxDB()` / `useRxDBOptional()`           | 前者抛错、后者返回 `undefined` | ✅   |
| 12  | 作用域销毁                                               | source 是工厂/Promise vs 已就绪实例或 `Ref` | 只断开 provider 自己造的       | ✅   |

## 技术笔记

- DI 集成：`provideRxDB()` + `injectRxDB()` / `useRxDB()` 依赖注入模式
- 统一异步契约：`provideRxDB` 收 `RxDBInput` = 三端共享的
  `RxDBSource = RxDB | Promise<RxDB> | (() => RxDB | Promise<RxDB>)` 再加本端超集 `Ref` / `undefined`
- `useRxDBOptional()` 与 `injectRxDB()` 语义相同，区别只有缺 provider 时**不发** Vue 的 injection 告警 ——
  可选读取本就允许没有 provider；名字与 Angular / React 对齐
- 所有权：provider 只销毁自己造的东西 —— 工厂/Promise 归它，已就绪实例与调用方自己的 `Ref` 归调用方
- 响应式：`useFind()` 返回 reactive 对象，自动追踪依赖
- Ref 支持：查询选项接受 `Ref<T>` / `ComputedRef<T>`，自动重新执行
- 生命周期：`onScopeDispose` 自动取消 RxJS 订阅
- 跨框架一致性：与 Angular/React API 完全一致

## 实现文件

- `packages/rxdb-vue/src/rxdb.ts` — Composables 核心
- `packages/rxdb-vue/src/rxdb-vue.ts` — Vue 响应式封装
- `packages/rxdb-vue/src/rxdb-infinite-scroll.ts` — 无限滚动
- `packages/rxdb-vue/src/rxdb-tree.ts` — Tree composables

## 参考

- [文档: Vue 集成](../../../website/docs/frameworks/vue.md)
