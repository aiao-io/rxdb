---
id: epic-010-model-driven-admin-framework
status: Backlog
startDate: TBD
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

**本 Epic 未解锁**：三条故事没有一条能写出「今天用户踩得到的具体症状」——没有具名试用者，仓库自身
也还没有用本框架管理 requirements。按 [CONVENTIONS 价值待证](../CONVENTIONS.md#价值待证) 留在 Backlog、
不进任何排期批次。

**解锁条件**（出现其一即提请 owner 解锁，与[候选分析入场条件](../domain-research/admin-framework.md)一致）：

- 已有团队报告「又一个 CRUD 系统要写」——列表 + 表单 + 权限 + 审计的重复劳动出现第三遍；
- 或自举：仓库自己的 requirements / roadmap / status-overview 改用本框架管理（story 实体、状态机、
  批次排期），内部工具即活 demo。

解锁后的推进顺序按 [roadmap 立项池](../roadmap.md#立项池待-owner-决策未进任何批次) 的登记执行。

## 非目标

- 任意运行时建表 / schema 编辑、完整应用源码生成与发布模板
- 多用户 RBAC / owner / 行级隔离（→ [US-029](../stories/core/US-029-rbac-owner-role-permission.md)）、协作、附件同步、AI
- 任务看板（第二顺位候选，不在同一轮开发）
