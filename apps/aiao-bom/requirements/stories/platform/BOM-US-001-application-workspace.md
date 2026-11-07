---
id: BOM-US-001
title: 独立应用目录、需求与工程门禁
status: In Review
priority: High
epic: BOM-EPIC-001
created: 2026-11-06
updated: 2026-11-06
tags: [bom, platform]
dependsOn: []
capabilities: []
---

# 用户故事：独立应用目录、需求与工程门禁

## 作为/我想要/以便

作为维护者，我想独立管理 BOM 应用及其需求，以便项目配置、范围和验证命令能一起审查。

## 范围边界

### In Scope

迁移目录、Nx 项目标识、包身份、缓存与产物位置、需求目录、开发启动配置和文档引用。

### Out of Scope

运行时数据库 schema、数量引擎与界面交互重写；正式部署与发行。

## 验收标准

| #   | 前置条件                   | 操作                                            | 预期结果                                                   | 状态 |
| --- | -------------------------- | ----------------------------------------------- | ---------------------------------------------------------- | ---- |
| 1   | 迁移前可启动 BOM 工作区    | 使用 aiao-bom 的 serve、build、test 与 e2e 目标 | 代码、生产产物与 E2E 依赖全部解析到新目录                  | ✅   |
| 2   | 浏览器已有工作区数据       | 在相同 origin 重开应用                          | 继续使用原数据库标识，不因项目改名清空已有数据             | ✅   |
| 3   | 编辑应用需求               | 运行 requirements-check 和 requirements-test    | 非法编号、依赖、AC、派生数字与本地死链被阻断；合法需求通过 | ✅   |
| 4   | 同一变更包含应用或需求修改 | 运行应用 lint/test 或 CI 的应用需求门禁         | 需求结构检查与门禁回归自动执行                             | ✅   |

## 实现文件

- [project.json](../../../project.json)
- [check-requirements.mjs](../../../scripts/check-requirements.mjs)
- [check-requirements.spec.mjs](../../../scripts/check-requirements.spec.mjs)
- [project.json](../../../../aiao-bom-e2e/project.json)

## 验收证据

本地应用验收通过，当前 AC 标为 ✅；证据符号包括 `合法应用需求通过，应用统计独立于平台故事`、`硬依赖环必须拒绝`，以及浏览器用例 `既有数据重开仍可开始核对，查询保留原来的记录统计`。

复验命令和结果见[验收台账](../../verification-report.md)与[应用化验收记录](../../plans/application-promotion-verification.md)。story 保留 In Review，等待 PR 评审及合并后再置 Done。

## References

- [应用决策](../../decisions.md)
- [应用约定](../../CONVENTIONS.md)
