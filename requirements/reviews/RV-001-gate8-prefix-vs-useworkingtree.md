---
id: RV-001
title: 发布门禁 8 的「全部使用 Commit*/WorkingTree*/Index* 前缀」字面规则会拦住 useWorkingTree()
status: Open
created: 2026-08-22
updated: 2026-08-22
pr:
---

# Review：发布门禁 8 的前缀规则与本 Epic 自己的核心导出冲突

## 问题

[epic-006 发布门禁 8](../epics/epic-006-working-tree-commits.md:386) 要求「api-baseline 新增导出**全部**使用
`Commit*` / `WorkingTree*` / `Index*` 前缀」，而术语表（[同文件:46](../epics/epic-006-working-tree-commits.md:46)）
只定义负向约束「新契约里**不得**出现 `Workspace` 前缀的新导出」。

`useWorkingTree()` 是 [US-306:297](../stories/collaboration/US-306-working-tree-index.md:297) 阶段 C 必交付的导出；
三个框架包各有自己的 api-baseline（`requirements/api-baseline/rxdb-angular.json` / `rxdb-react.json` /
`rxdb-vue.json`），且 US-306 横切测试要求「api-baseline diff 未同步更新即失败」
（[US-306:359](../stories/collaboration/US-306-working-tree-index.md:359)）。按门禁 8 的字面，
`useWorkingTree` 不满足任何前缀要求——门禁会拦下本 Epic 自己的核心交付物。

## 根因

门禁 8 把术语表的负向命名约束写成了对**全部**新增导出的正向前缀要求。框架侧 hook 沿用仓库既有的
`use*` 命名约定（如 `useRxDB`），不属于 `@aiao/rxdb` 的共享 DTO 域，但同样会被登记进框架包的
api-baseline。

## 修复方案

二选一，plan 阶段冻结前定死：

1. 把门禁 8 的正向前缀要求限定到 `@aiao/rxdb` 核心共享类型与错误码（`requirements/api-baseline/rxdb.json`）；
   框架包只检查负向规则（无 `Workspace*` 新导出、不复用 `SwitchBranchOptions`）。
2. 或显式豁免遵循既有 `use*` 约定的框架 hook 入口。

## 审查结论（2026-08-22 复核）

**成立（轻微）。** 已核对 `requirements/api-baseline/rxdb-react.json`：三框架现有 20 个 `use*` 导出
（`useAction` / `useCount` / `useFind` / `useRxDB` …）确实构成既有约定，门禁 8 原文的「全部使用
`Commit*` / `WorkingTree*` / `Index*` 前缀」按字面执行会把本 Epic 自己要交付的 `useWorkingTree()` 判红。

**已修复**：epic-006 发布门禁 8 改写为两层——核心包走**正向前缀规则**，框架绑定包只走**反向禁止规则**
（不得引入与既有 `use*` 约定冲突的新命名），并把 `useWorkingTree()` 明确标注为合规示例。

## 解决记录

- [x] 文档修复已落在工作区（见「审查结论」）
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
