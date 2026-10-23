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

- [ ] 预置两三个有关联的实体 schema 后，工作台即提供导航、列表、详情、创建 / 编辑 / 删除、校验反馈与
      查询筛选，覆盖加载 / 失败 / 空态（[US-526](../stories/domain/US-526-admin-workbench.md)）
- [ ] 本地持久化：刷新 / 关闭重开后可继续编辑；备份可在独立环境恢复并继续使用，失败结果与数据保留
      状态明确（[US-526](../stories/domain/US-526-admin-workbench.md) / [US-527](../stories/domain/US-527-admin-backup-restore.md)）
- [ ] 一份独立消费接入示例存在，记录新增代码、依赖与样式要求，证明接入成本降低
      （[US-528](../stories/domain/US-528-admin-consumer-example.md)）

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-526 模型驱动数据工作台：预置 schema 的录入 / 编辑 / 筛选闭环](../stories/domain/US-526-admin-workbench.md) (Low)
- [US-527 工作台备份恢复闭环：失败语义与数据保留](../stories/domain/US-527-admin-backup-restore.md) (Low)
- [US-528 独立消费接入示例与接入成本记录](../stories/domain/US-528-admin-consumer-example.md) (Low)

## 价值待证（整个 Epic）

**解锁记录（2026-10-21，owner 决定）**：本 Epic 的 3 条故事原标价值待证、不进任何排期批次；
owner 于 2026-10-21 决定解锁，**驱动者 = 尽快交付可用的单人本地数据工作台**——首版闭环
（录入 / 编辑 / 筛选 / 持久化 / 备份恢复 + 独立消费示例）直接验证「定义实体之后少写了多少 CRUD」
这一接入成本主张，正是 domain-research 优先级评审确定的第一顺位。

原判据是 [CONVENTIONS 的病灶数 ≥ 抽象数](../CONVENTIONS.md#价值待证)：这三条故事**不新增引擎抽象**
（全部行为复用 rxdb-model 四包与已 Done 的 US-217），对应零个已知病灶；入场条件（具名团队 CRUD
重复劳动第三遍，或仓库自举）至今未出现。本记录按 **owner 决定豁免**（先例
[epic-009](epic-009-bom-domain-model.md#价值待证整个-epic)），驱动者是产品交付与接入成本验证，
不是缺陷；「空工作台只是更好看的 DevTools」的反方已由 US-526 的「会持续维护的真实数据」要求
与 US-528 的成本记录承接。

`priority` 保持 `Low`，排期以 roadmap 批次 5 为准；`startDate` 定为本记录日期，`targetDate` 仍 `TBD`
（不估完整三条故事的交期）。开工顺序：US-526 阶段 A → B → C，随后 US-527、US-528（见
[roadmap 批次 5](../roadmap.md#批次-5模型驱动后台首版epic-010-已解锁)）。

## 非目标

- 任意运行时建表 / schema 编辑、完整应用源码生成与发布模板
- 多用户 RBAC / owner / 行级隔离（→ [US-029](../stories/core/US-029-rbac-owner-role-permission.md)）、协作、附件同步、AI
- 任务看板（第二顺位候选，不在同一轮开发）
