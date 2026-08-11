# `@aiao/rxdb-plugin-search-react` 代码评审

> ## ⚠️ 本报告已作废（superseded）
>
> **不要引用本报告的结论。** 它给出的 🔴 判据早已不成立。
>
> - **失效原因**（SRCHR-008）：报告停在 2026-07-14 / 10 文件，唯一 P1
>   「source/options 永远锁在首次 handle」**已经修复** ——
>   当前 `use-search.ts` 会在 source 与语义化 options 变化时重建 handle，并有五组 rerender 用例覆盖。
> - **但本包并非无问题**：后续评审提出 SRCHR-001 / 003 / 004 / 005 / 006 / 008 / 009，
>   其中 SRCHR-009（首次 passive effect 前的命令被静默丢弃）是 P1 —— 与本报告所述完全不同。
> - **当前基线**：`code-reviews/incomplete/SRCHR-*.md`（每条顶部的 `## 判定：` 块为准）
>   与 `code-reviews/incomplete/TRIAGE.md`。
>
> 保留原文仅为存档。`REVIEW.md` 不在 `package.json` 的 `files` 内，不会进入 tarball（已用 `npm pack --dry-run` 核实）。

## 结论（已作废）

🔴 不通过。`useSearch()` 宣称 source 变化时重建 handle，但实际把首次 source 永久锁进 ref；组件切换数据库/collection 后仍订阅和查询旧 source。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：React 搜索 hook、测试、公开入口；10 个文件，约 311 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过

## 问题

| ID               | 级别 | 位置                   | 问题与影响                                                                                                                                                                                                         | 建议                                                                                                                                        |
| ---------------- | ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| SEARCH-REACT-001 | P1   | `src/use-search.ts:67` | `handleRef` 只在 null 时用 source 创建，订阅 effect 的依赖数组为空；rerender 传入新 source/options 时，hook 仍对旧 handle 调用 setQuery/loadMore，并显示旧数据库结果。源码注释“仅在 source 变化时重建”与实现相反。 | 用 source/稳定 options key 作为 handle 生命周期依赖，切换时先取消旧订阅并 destroy 旧 handle；增加 rerender source A→B 后只能调用 B 的测试。 |

## 三端对称性

- 共享类型透传与 Vue/Angular 一致；运行时入口 `useSearch` 符合 React 约定。
- source 切换语义目前不可靠，是此三端组唯一 P1。
