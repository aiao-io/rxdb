---
id: ADMIN-US-001
title: 应用需求管理与结构门禁
status: In Review
priority: High
epic: ADMIN-EPIC-001
created: 2026-11-06
updated: 2026-11-06
tags: [admin, requirements, tooling]
dependsOn: []
capabilities: []
---

# 用户故事：应用需求管理与结构门禁

## 作为/我想要/以便

**作为** Admin 应用维护者
**我想要** 用独立的应用故事、派生视图和可执行门禁管理模板孵化
**以便** 分清应用产品工作与平台能力，不把文档统计或上游状态误当成应用交付。

## 范围边界

### In Scope

- 按根 app-template 建立应用完整目录、模板、编号段、四条初始故事与当前决策。
- 提供 Nx 结构门禁及正负夹具，校验 YAML、依赖、AC、派生视图与本地链接。
- 从应用和根需求入口导航到本目录。

### Out of Scope

- 将平台 US-526～533 迁入本目录或改变其状态。
- 自动认定浏览器能力通过、独立复制或发行。

## 验收标准

| #   | 前置条件             | 操作                       | 预期结果                                                           | 状态 |
| --- | -------------------- | -------------------------- | ------------------------------------------------------------------ | ---- |
| 1   | 阅读需求入口         | 查看目录、编号、故事与决策 | 应用范围和平台引用清楚，具有 app-template 要求的管理入口与模板     | ✅   |
| 2   | 有合法文档与错误夹具 | 执行 `requirements-test`   | 合法文档通过；字段、ID、AC、依赖环、关闭条件、统计与链接错误被拒绝 | ✅   |
| 3   | 当前需求目录可用     | 执行 `requirements-check`  | 本应用文档一致，无失效本地链接或标题锚点                           | ✅   |

验收证据入口：[门禁测试](../../../scripts/check-requirements.spec.mjs)、[当前验收台账](../../verification-report.md)。

## 技术笔记

story YAML 是状态真相源，`dependsOn` 只表示应用内硬依赖；`capabilities` 是平台能力引用，不继承状态。结构门禁保持只读。

## 实现文件

- `apps/rxdb-admin-template-react/requirements/` — 当前范围、故事、派生视图与工作集模板。
- `apps/rxdb-admin-template-react/scripts/check-requirements.mjs` — 应用结构门禁。
- `apps/rxdb-admin-template-react/scripts/check-requirements.spec.mjs` — 真实目录夹具回归。
- `apps/rxdb-admin-template-react/project.json` — Nx 门禁入口。

## References

- [应用级需求管理办法](../../../../../requirements/app-template/README.md)
- [ADMIN-EPIC-001](../../epics/ADMIN-EPIC-001.md)
