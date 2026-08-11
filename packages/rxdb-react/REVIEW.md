# `@aiao/rxdb-react` 代码评审

> ## ⚠️ 本报告已作废（superseded）
>
> **不要引用本报告的结论。** 它给出的 🟢 绿灯是错的。
>
> - **失效原因**（RRE-009）：基线是 `03a46a5d…`（2026-07-14，17 文件 / ~1,351 行），
>   当时代码已经演进到 11 文件 / ~2,329 行；更要紧的是本报告称「实现完整」的依据是一套
>   **把 `EntityManager` 与 `Repository` 整体 mock 掉**的窄单测，真实实体、真实游标查询、
>   浏览器提交时序在那套夹具里根本表达不出来。
> - **实际状态**：后续评审在本包提出 12 条 finding（RRE-001 ~ 012，现存 11 条 active），其中 RRE-002
>   （真实 Entity 当 `after` 游标必抛 `TypeError`，而该形参的公开类型就是 `InstanceType<T>`）、
>   RRE-003（options factory 非幂等 → `Too many re-renders`）、RRE-004（旧订阅在 passive
>   cleanup 之前把新查询写成「已加载完成」）是 P1，**恰好落在本报告断言「完整」的那两处**
>   （查询资源与无限滚动）。
> - **当前基线**：`code-reviews/incomplete/RRE-*.md`（每条顶部的 `## 判定：` 块为准）
>   与 `code-reviews/incomplete/TRIAGE.md`；真实集成门禁见
>   `packages/rxdb-react/src/hooks.browser.spec.tsx`（`nx test-browser rxdb-react`）。
>
> 保留原文仅为存档，说明「高覆盖率的 mock 单测会把绿灯颁给测不到的地方」。

## 结论（已作废）

🟢 好。查询资源、Provider 和无限滚动实现完整；Angular 已补齐同名 `useInfiniteScroll` 公共入口。

## 修复状态（2026-07-15）

- 三端均公开 `useInfiniteScroll(EntityType, options)` 与 `InfiniteScrollResource`。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：React hooks、Context Provider、无限滚动、测试和公开入口；17 个文件，约 1,351 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 三端对称性

- 基础查询、树/图 hooks 与 Angular/Vue 对齐，资源模型均包含 value/error/isLoading/isEmpty/hasValue。
- React/Vue 都公开 `useInfiniteScroll`；Angular 对应能力为不同名 `InfiniteScrollingList`，详见 `rxdb-angular` 报告。

## 问题

本包未发现独有 P0–P2 问题。
