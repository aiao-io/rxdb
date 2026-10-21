---
id: US-526
title: 模型驱动数据工作台：预置 schema 的录入 / 编辑 / 筛选闭环
status: In Review
priority: Low
epic: epic-010-model-driven-admin-framework
created: 2026-10-19
updated: 2026-10-21
tags: [domain, admin-framework, workbench, rxdb-model, e2e]
---

# 用户故事：模型驱动数据工作台：预置 schema 的录入 / 编辑 / 筛选闭环

## 作为/我想要/以便

**作为** 试用 RxDB 的开发者
**我想要** 预置两三个有关联的实体 schema 后得到一个可用的本地数据工作台（导航、列表、详情、
创建 / 编辑 / 删除、校验反馈与查询筛选，刷新重开不丢数据）
**以便** 用最小接线管理自己的真实数据，并看清「定义实体之后少写了多少 CRUD」

## 交付阶段

| 阶段 | 内容                                                                                                                                 | 状态 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| A    | 应用壳 `apps/dev-rxdb-admin`：预置有关联的实体 schema + 会持续维护的轻量数据场景（非演示种子）、实体可见性声明、列表与详情构成的导航 | ✅   |
| B    | CRUD 接线：创建 / 编辑 / 删除、校验反馈、查询筛选；加载 / 失败 / 空态                                                                | ⬜   |
| C    | 本地持久化（刷新 / 重开继续编辑）+ `apps/dev-rxdb-admin-e2e` 端到端组合验收                                                          | ⬜   |

阶段归属：A 关闭 AC#1 / #2；B 关闭 AC#3～#6；C 关闭 AC#7 / #8。

## 范围边界

### In Scope

- 预置 2~3 个**有关联**的实体 schema（关联字段出现在筛选与详情里），只对声明可见的实体给出导航入口
- 预置数据对应一个使用者会持续维护的轻量数据场景（如个人轻量事项 / 样例资产清单），录入 / 编辑闭环
  在该数据上验证——纯粹播放预置数据不能证明重复 CRUD 劳动已减少（优先级评审的反方结论）
- 列表 / 详情 / 表单 / 筛选一律复用 rxdb-model 三框架组件与三端 demo 实体页已验证的用法，
  **不新增公共框架 API**——首版只做产品化组装；若组装中发现必须新增公共 API，需三端对称并另立 story
- 实体操作入口按 `deriveEntityCapabilities` 派生（`both / system` 声明即权限真相源），工作台不引入
  角色 / owner / 行级隔离
- 加载、失败与空态在列表 / 详情 / 表单上都有可断言的呈现
- 本地持久化走已验证的浏览器本地适配器，刷新与关闭重开后数据仍在、可继续编辑
- 组合验收在 `apps/dev-rxdb-admin-e2e` 以端到端用例关闭（domain/ 目录硬约束，见 [CONVENTIONS](../../CONVENTIONS.md)）

### Out of Scope

- 任意运行时建表 / schema 编辑（schema 是编译期预置的）
- 完整应用源码生成与发布模板
- 多用户 RBAC / owner / 行级隔离（→ [US-029](../core/US-029-rbac-owner-role-permission.md)）
- 备份与恢复（→ [US-527](US-527-admin-backup-restore.md)）
- 独立消费接入示例与成本记录（→ [US-528](US-528-admin-consumer-example.md)）
- 多人协作、附件、AI、任务看板

## 验收标准

| #   | 前置条件                                 | 操作                                                  | 预期结果                                       | 状态 |
| --- | ---------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- | ---- |
| 1   | 工作台已启动，schema 预置完成            | 打开导航                                              | 只出现声明可见的实体入口；未声明实体无入口     | ✅   |
| 2   | 工作台已启动，两个可见实体间存在关联字段 | 从导航进入实体列表，再从行进入详情                    | 列表与详情由现有组件构成，详情显示关联字段的值 | ✅   |
| 3   | 实体列表为空                             | 打开列表                                              | 空态有明确呈现                                 | ✅   |
| 4   | 创建表单已打开                           | 提交缺少必填字段或非法格式的数据                      | 校验反馈可读、数据不入库、表单保留输入         | ✅   |
| 5   | 已有一条记录                             | 编辑并保存，再删除                                    | 保存后列表与详情即时刷新；删除后行消失且有反馈 | ✅   |
| 6   | 已有多条记录                             | 用查询筛选（含关联字段条件）筛选                      | 列表即时只显示命中行；无命中时呈现空态         | ✅   |
| 7   | 已录入数据                               | 刷新页面、关闭并重开浏览器标签                        | 数据仍在、可继续编辑（本地 SQLite 持久化）     | ✅   |
| 8   | e2e 应用已就绪                           | Playwright 走 录入 → 编辑 → 筛选 → 刷新 → 重开 全流程 | 组合验收用例绿；加载与失败态有断言覆盖         | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**现有组件与页面是半成品，本故事是组装不是重写。** [`deriveEntityCapabilities`](../../../packages/rxdb-model/src/entity-capabilities.ts)
从实体元数据的 `permissions` 派生 `canCreate / canEdit / canDelete`（US-027 交付）；三端列表组件均已消费
（[`EntityList`](../../../packages/rxdb-model-vue/src/index.ts) / [`EntityList`](../../../packages/rxdb-model-react/src/index.ts) /
[`EntityListComponent`](../../../packages/rxdb-model-angular/src/index.ts)）。三端 demo 的实体页是现成的装配先例：
[React 实体列表页](../../../apps/dev-rxdb-react/src/app/pages/entities/entity-list-page.tsx)、
[Angular 实体页](../../../apps/dev-rxdb-angular/src/app/pages/entity/entity.page.ts)、
[Vue GeneratorPage](../../../apps/dev-rxdb-vue/src/pages/GeneratorPage.vue)。

**框架与适配器选取（已定案）**：React + wa-sqlite 主线程 `IDBBatchAtomicVFS`（IndexedDB 持久化，满足 AC#7）。
选主线程 IndexedDB 而不是 OPFS 是硬约束：US-217 的备份 / 恢复矩阵里浏览器可备份的组合只有主线程 memory/idb，
OPFS 系 VFS 与 worker/sharedWorker transport 都报 `unsupported_combination`（US-527 依赖备份能力）。
本故事不新增公共框架 API，不触发三端对称义务；组装中发现的两处组件缺口（校验反馈展示）已另立
[US-104](../framework/US-104-validation-feedback.md) 三端同改。

**权限接线**：实体可见性（AC#1）与操作入口（AC#4 / #5 的按钮）都从同一份 `EntityMetadata` 派生，不另建
菜单配置表——与「schema 单一真相源」的候选定位一致（见 [admin-framework 候选分析](../../domain-research/admin-framework.md)）。

## 价值待证

本故事已随 [epic-010 解锁记录](../../epics/epic-010-model-driven-admin-framework.md#价值待证整个-epic) 解锁
（2026-10-21，owner 决定）：三条故事不新增引擎抽象、对应零个已知病灶，「病灶数 ≥ 抽象数」按 owner
决定豁免，依据与边界见 epic。

## 实现文件

- `apps/dev-rxdb-admin/` — 待建；工作台应用（壳、预置 schema、导航、CRUD 接线、持久化）
- `apps/dev-rxdb-admin-e2e/` — 待建；端到端组合验收（domain/ 目录硬约束的领域测试应用）

## References

- [epic-010 模型驱动后台管理框架](../../epics/epic-010-model-driven-admin-framework.md)
- [admin-framework 候选分析](../../domain-research/admin-framework.md) — 设计依据（孵化即冻结；首版边界与成功信号见其「首版边界与验收」）
- [US-527 工作台备份恢复闭环](US-527-admin-backup-restore.md) · [US-528 独立消费接入示例](US-528-admin-consumer-example.md)
- [US-027 实体操作权限模型](../core/US-027-entity-permission-model.md) — `both / system` 声明与能力派生
- [`deriveEntityCapabilities`](../../../packages/rxdb-model/src/entity-capabilities.ts) — 操作入口派生的证据锚点
- 现有消费页面先例：[React](../../../apps/dev-rxdb-react/src/app/pages/entities/entity-list-page.tsx) · [Vue GeneratorPage](../../../apps/dev-rxdb-vue/src/pages/GeneratorPage.vue) · [Angular](../../../apps/dev-rxdb-angular/src/app/pages/entity/entity.page.ts)
