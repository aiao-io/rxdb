---
id: epic-010-model-driven-admin-framework
status: In Progress
startDate: 2026-10-21
targetDate: TBD
owner: jimmy
---

# 模型驱动后台管理框架

## 愿景

后台管理 = 看数据 + 提交数据的重复劳动。把 `EntityMetadata` 作为唯一真相源，从同一份 schema 派生表单、
表格、查询构建器、校验、权限与审计——开发者预置实体 schema，其余接线由框架与工作台承担。首版切片是
**给定实体 schema 的单人 Web 本地数据工作台**（录入、编辑、筛选、持久化与备份恢复闭环），即
[domain-research 优先级评审](../domain-research/README.md) 确定的第一顺位候选。

## 为什么单列一个 Epic

epic-001~006 按产品能力分组，[epic-009](epic-009-bom-domain-model.md) 是 BOM 业务领域模型。本 Epic 是
**开发者工具向的领域解决方案**：一层建立在 rxdb-model 四包与三端 demo 实体页面之上的产品化组装
（布局 / 导航 / 权限接线 / 备份接线 / 接入示例）。与 BOM 不同，首版**不新增引擎抽象**——它复用已交付
组件，验证的是「定义实体之后少写了多少 CRUD」这一接入成本主张
（候选分析见 [admin-framework.md](../domain-research/admin-framework.md)）。

## 目标

三条都是可核对的状态：

- [x] 预置两三个有关联的实体 schema 后，工作台即提供导航、列表、详情、创建 / 编辑 / 删除、校验反馈与
      查询筛选，覆盖加载 / 失败 / 空态（[US-526](../stories/domain/US-526-admin-workbench.md)）
- [x] 本地持久化：刷新 / 关闭重开后可继续编辑；备份可在独立环境恢复并继续使用，失败结果与数据保留
      状态明确（[US-526](../stories/domain/US-526-admin-workbench.md) / [US-527](../stories/domain/US-527-admin-backup-restore.md)）
- [ ] 独立消费示例通过发布产物隔离安装与按文档重搭，记录新增代码、依赖、样式和真实接入任务，验证接入成本
      （[US-528](../stories/domain/US-528-admin-consumer-example.md)）

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-526 模型驱动数据工作台：预置 schema 的录入 / 编辑 / 筛选闭环](../stories/domain/US-526-admin-workbench.md) (Low)
- [US-527 工作台备份恢复闭环：失败语义与数据保留](../stories/domain/US-527-admin-backup-restore.md) (Low)
- [US-528 独立消费接入示例与接入成本记录](../stories/domain/US-528-admin-consumer-example.md) (Low)
- [US-529 实体列表视图配置：字段显隐、多字段排序与分组](../stories/domain/US-529-entity-list-view-settings.md) (Medium)

## 列表视图扩展

owner 批准的列表字段配置、排序和分组切片见
[US-529 实体列表视图配置](../stories/domain/US-529-entity-list-view-settings.md)。该故事扩展通用模型 UI，
新增公共逻辑与三端接线独立评审，首版 US-526～528 的范围保持各自 story 定义。

## 价值待证（整个 Epic）

**owner 已批准首版范围并解锁**，驱动者是尽快交付可用的单人本地数据工作台。首版闭环
（录入 / 编辑 / 筛选 / 持久化 / 备份恢复 + 独立消费示例）直接验证「定义实体之后少写了多少 CRUD」
这一接入成本主张，正是 domain-research 优先级评审确定的第一顺位。

[CONVENTIONS 的价值待证准入](../CONVENTIONS.md#价值待证)按 **owner 决定豁免**：首版三条故事
不新增引擎抽象，复用 rxdb-model 四包与 US-217，驱动者是产品交付与接入成本验证。
这份授权继续生效；真实数据任务与独立接入收益由 US-526 / US-528 验收，不重新以缺少具名团队阻止已批准范围。

首版故事 `priority` 保持 `Low`，US-529 为 `Medium`。当前剩余验收是 US-528 的发布产物独立消费，
排期以 [roadmap 批次 5](../roadmap.md#批次-5模型驱动后台首版epic-010-已解锁)为准，`targetDate` 为 `TBD`。

## 非目标

- 任意运行时建表 / schema 编辑、完整应用源码生成与发布模板
- 多用户 RBAC / owner / 行级隔离（→ [US-029](../stories/core/US-029-rbac-owner-role-permission.md)）、协作、附件同步、AI
- 任务看板（第二顺位候选，不在同一轮开发）
