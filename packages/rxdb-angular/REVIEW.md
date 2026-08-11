# `@aiao/rxdb-angular` 代码评审

> [!WARNING]
> **本文档已失效，不要按它做判断。**
>
> 基线是 `03a46a5d5992a958c19ae33d5fed15c9c3322021`（2026-07-14），其后代码已大幅变动：
> 结论、问题表与「修复状态」章节均未随之更新，照它排期会重复处理已修项、漏掉新增项。
>
> 当前有效的评审见 [`code-reviews/packages/rxdb-angular.md`](/code-reviews/packages/rxdb-angular.md)；
> 未收口条目的逐条判定见 [`code-reviews/incomplete/`](/code-reviews/incomplete/) 下对应编号的文件
> （每个文件顶部的 `## 判定：` 块给出对照**当前源码**的结论与证据）。

## 结论

🟢 好。Angular 已公开 `useInfiniteScroll(EntityType, options)` 与 `InfiniteScrollResource`，并保留 `InfiniteScrollingList` 兼容入口。

## 修复状态（2026-07-15）

- RXDB-ANGULAR-001 已修复并补充注入上下文测试。
- `test` 95 个用例通过，`lint`、`typecheck`、`build` 全部通过。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：Angular hooks、provider、无限滚动、状态/action 工具、测试和公开入口；24 个文件，约 2,533 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 问题

| ID               | 级别 | 位置             | 问题与影响                                                                                                                                                                                                                           | 建议                                                                                                                                   |
| ---------------- | ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| RXDB-ANGULAR-001 | P1   | `src/index.ts:7` | React 与 Vue 均公开 `useInfiniteScroll(EntityType, options)`，Angular 仅导出 `new InfiniteScrollingList(rxdb, EntityType, options)`。能力相近但 API、依赖注入方式和返回类型不同，违反三框架同功能同 API 的约束，迁移和文档无法复用。 | 提供 Angular `useInfiniteScroll(EntityType, options)`（内部可复用现有类），返回与三端同名字段；保留类作为兼容 API 并增加三端契约测试。 |

## 三端对称性

- `useGet/useFindOne/useFindOneOrFail/useFind/useFindByCursor/useFindAll/useCount` 以及树/图 hooks 三端都有。
- Provider 层按框架惯例分别为 Angular DI、React Context、Vue provide/inject。
