# `@aiao/rxdb-plugin-search-angular` 代码评审

> ## ⚠️ 本报告已作废（superseded）
>
> **不要引用本报告的结论。** 它给出的 🟢 绿灯是错的。
>
> - **失效原因**（SRA-007）：报告基于旧 SHA、13 个文件 / 333 行，称本包无 P0-P2。
>   其中「核心 `install(): void`」问题确已修复，但当时未出现的问题现在都在。
> - **实际状态**：后续评审提出 SRA-001 ~ 007，其中 SRA-001（Nx release 发布源码包而非 APF 产物）
>   与 SRA-002（声明允许值导入 `SearchExecutionError`，FESM 没有运行时导出）是 P1。
>   **SRA-003（四个「只读」signal 实际带 `.set/.update`）与 SRA-004（订阅无 error observer，
>   流错误逃逸成全局未捕获异常）恰好落在本报告断言「正确桥接并随 DestroyRef 释放」的那一处。**
>   002 / 003 / 004 已于 2026-08-04 修复。
> - **当前基线**：`code-reviews/incomplete/SRA-*.md` 与 `code-reviews/incomplete/TRIAGE.md`。
>
> 保留原文仅为存档。

## 结论（已作废）

🟢 好。`injectSearch()` 正确把 handle 流桥接为 signal，并随 `DestroyRef` 释放订阅和搜索 handle。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：Angular 搜索 binding、测试、公开入口；13 个文件，约 333 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 三端对称性

- 共享类型 `SearchExecutionError`、`SearchHandle`、`SearchOptions`、`SearchResult`、`SearchState`：Angular/React/Vue 均透传。
- 运行时入口：Angular `injectSearch`，React/Vue `useSearch`，符合各框架约定。
- 结果、状态、错误、分页、clear/retry 都完整暴露。

## 问题

本包未发现 P0–P2 问题。核心 FTS 安装 Promise 未上抛的问题见 `rxdb-plugin-search` 报告。
