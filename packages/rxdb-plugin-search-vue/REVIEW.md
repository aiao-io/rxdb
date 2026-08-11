# `@aiao/rxdb-plugin-search-vue` 代码评审

> ## ⚠️ 本报告已作废（superseded）
>
> **不要引用本报告的结论。** 它给出的 🟢 绿灯是错的。
>
> - **失效原因**（SRCHV-009）：报告停在 2026-07-14、旧提交，称 10 个文件 / 约 245 行且无 P0-P2；
>   当前已是 12 个文件 / 499 行。
> - **实际状态**：后续评审在本包提出 SRCHV-001 ~ 010，其中 SRCHV-001（SSR 每次 render 建句柄且无销毁路径）
>   是 P1；SRCHV-002（销毁后命令仍打到旧 handle）与 SRCHV-003（输出被暴露成可写 Ref）
>   **恰好落在本报告断言「在 scope 销毁时释放全部资源」的那一处**。
>   002 / 003 / 005 / 010 已于 2026-08-04 修复。
> - **当前基线**：`code-reviews/incomplete/SRCHV-*.md` 与 `code-reviews/incomplete/TRIAGE.md`。
>
> 保留原文仅为存档。

## 结论（已作废）

🟢 好。`useSearch()` 以 `ref` 暴露状态，watch 查询词，并在 scope 销毁时释放全部资源。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：Vue 搜索 composable、测试、公开入口；10 个文件，约 245 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 三端对称性

- 共享类型 `SearchExecutionError`、`SearchHandle`、`SearchOptions`、`SearchResult`、`SearchState` 三端一致。
- 运行时入口与 React 同为 `useSearch`；Angular 对应 `injectSearch`。
- results/state/error/hasMore/loadMore/clear/retry 的能力集合一致。

## 问题

本包未发现 P0–P2 问题。React source 切换缺陷见 `rxdb-plugin-search-react` 报告。
