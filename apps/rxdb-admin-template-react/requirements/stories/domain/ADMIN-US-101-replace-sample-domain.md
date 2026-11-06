---
id: ADMIN-US-101
title: 示例实体替换与元数据贯通
status: Backlog
priority: Medium
epic: ADMIN-EPIC-001
created: 2026-11-06
updated: 2026-11-06
tags: [admin, domain, customization]
dependsOn: [ADMIN-US-002]
capabilities: [rxdb:US-526, rxdb:US-702]
---

# 用户故事：示例实体替换与元数据贯通

## 作为/我想要/以便

**作为** 复用 Admin 基线的业务开发者
**我想要** 按明确步骤接入一组新的关联实体，并使名称与操作贯通页面和搜索
**以便** 保留通用外壳和 CRUD，而不用逐处排查资产样例的硬编码。

## 范围边界

### In Scope

- 保留资产模块作为默认样例，提供另一组具备关联的最小业务验证夹具。
- 由元数据提供实体显示名，清理搜索页等位置对资产实体名称的专用映射。
- 记录实体注册、命名空间、图标、关联和搜索字段的完整修改路径。

### Out of Scope

- 运行时建模、自动生成完整应用、引擎迁移设计或独立仓库复制。
- 通过删除默认资产样例绕过原应用回归。

## 验收标准

| #   | 前置条件                           | 操作                           | 预期结果                                             | 状态 |
| --- | ---------------------------------- | ------------------------------ | ---------------------------------------------------- | ---- |
| 1   | 新的关联实体使用非 assets 命名空间 | 按文档注册并打开应用           | 导航、列表、表单、关系筛选可用，系统内部实体不暴露   | ⬜   |
| 2   | 新实体有可搜索字段与显示名         | 搜索并跳转记录                 | 搜索页与命令面板使用新实体元数据，跳转到正确实体页面 | ⬜   |
| 3   | 新业务浏览器已录入记录             | 编辑、筛选、刷新重开并备份恢复 | 数据闭环通过，默认资产回归仍通过，文档步骤与实际一致 | ⬜   |

验收证据要求：新增业务的浏览器用例；配置单测不能替代本故事的整应用验收。

## 技术笔记

当前样例注册在 [ENTITIES](../../../src/app/entities/asset-entities.ts)，搜索页的 `ENTITY_DISPLAY_NAMES` 需要结合实际代码复核与替换；菜单图标映射位于 [workbench-menu.tsx](../../../src/app/shell/workbench-menu.tsx)。读取这些入口可复验替换实体并非仅改一个列表。

## 实现文件

- `apps/rxdb-admin-template-react/src/app/entities/` — 实体注册与样例。
- `apps/rxdb-admin-template-react/src/app/pages/search-page.tsx` — 搜索显示名。
- `apps/rxdb-admin-template-react/src/app/shell/record-search.ts` — 搜索跳转。
- `apps/rxdb-admin-template-react-e2e/src/` — 新业务闭环验收。

## References

- [ADMIN-US-002](../platform/ADMIN-US-002-application-configuration.md)
- [US-526](../../../../../requirements/stories/domain/US-526-admin-workbench.md)
- [US-702](../../../../../requirements/stories/future/US-702-full-text-search.md)
