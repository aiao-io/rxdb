---
id: MODEL-US-001
title: 应用需求管理与结构门禁
status: In Progress
priority: High
epic: MODEL-EPIC-001
created: 2026-11-11
updated: 2026-11-11
tags: [requirements, tooling]
dependsOn: []
capabilities: []
---

# 用户故事：应用需求管理与结构门禁

## 作为/我想要/以便

**作为** 模型设计器的维护者
**我想要** 用独立的应用故事、决策、派生视图和可执行门禁管理这次智能体重构
**以便** 分清应用产品工作和平台能力，不把文档统计或离线测试当成真实环境的交付。

## 范围边界

### In Scope

- 按根 app-template 建立完整的应用需求目录、模板、编号段、初始故事与决策。
- 把 Admin 应用的结构门禁抽成按前缀参数化的共享脚本，两个应用各自绑定前缀，Admin 的行为不变。
- 本应用的 Nx 门禁目标与夹具测试，接入应用 `test` 目标。
- 从应用 README 和根需求入口导航到本目录。

### Out of Scope

- 根 `audit:requirements` 自动扫描全部 `apps/*/requirements/`（另立机制故事）。
- 自动认定浏览器、Trigger.dev 实例或真实模型的验收通过。

## 验收标准

| #   | 前置条件                    | 操作                                                  | 预期结果                                                             | 状态 |
| --- | --------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- | ---- |
| 1   | 阅读需求入口                | 查看目录、编号段、故事、决策与派生视图                | 应用范围与平台引用清楚，具有 app-template 要求的管理入口与模板       | ⬜   |
| 2   | 有合法与错误的夹具          | 执行 `aiao-model-design:requirements-test`            | `MODEL` 前缀的需求树通过；其他应用前缀的故事与史诗编号被拒绝         | ⬜   |
| 3   | 当前需求目录可用            | 执行 `aiao-model-design:requirements-check`           | 本应用文档一致，没有失效的本地链接或标题锚点                         | ⬜   |
| 4   | 共享门禁脚本已从 Admin 抽出 | 执行 Admin 的 `requirements-test` 与 `requirements-check` | 原有负例全部仍被拒绝，Admin 当前需求目录仍通过                     | ⬜   |

验收证据入口：[门禁测试](../../../scripts/check-requirements.spec.mjs)、[验收台账](../../verification-report.md)。

## 技术笔记

story YAML 是状态真相源，`dependsOn` 只表示应用内的硬依赖，`capabilities` 是平台能力引用，不继承状态。共享脚本 `checkAppRequirements({ appRoot, prefix })` 从前缀生成故事、史诗、清单链接与状态索引的全部正则；应用脚本只是一层绑定前缀的包装，门禁保持只读。

## 实现文件

- `apps/aiao-model-design/requirements/` — 当前范围、故事、决策、派生视图与模板。
- `scripts/audit/app-requirements.mjs` — 按前缀参数化的应用需求门禁。
- `apps/aiao-model-design/scripts/check-requirements.mjs` / `check-requirements.spec.mjs` — 本应用门禁入口与夹具测试。
- `apps/rxdb-admin-template-react/scripts/check-requirements.mjs` — Admin 门禁改为绑定 `ADMIN` 前缀的包装。
- `apps/aiao-model-design/project.json` — `requirements-check` / `requirements-test` 目标。

## References

- [应用级需求管理办法](../../../../../requirements/app-template/README.md)
- [MODEL-EPIC-001](../../epics/MODEL-EPIC-001.md)
