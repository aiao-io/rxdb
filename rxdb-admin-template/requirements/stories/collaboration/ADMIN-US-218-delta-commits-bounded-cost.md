---
id: ADMIN-US-218
title: 差量提交与有界命令成本
status: In Progress
priority: High
epic: ADMIN-EPIC-004
created: 2026-11-17
updated: 2026-11-17
tags: [admin, collaboration, storage, performance, working-tree]
dependsOn: []
capabilities: []
---

# 用户故事：差量提交与有界命令成本

## 作为/我想要/以便

**作为** 团队成员与协作服务的部署者
**我想要** 团队长期使用、积累大量提交、评论和审计之后，各项操作依然流畅，同步与刷新只传输变化的部分
**以便** 协作服务可以长期运行，并能放进 Edge Function 的资源限制里，只部署 Supabase。

## 范围边界

### In Scope

- 提交改为字段级 ChangeSet，形状对齐平台 working-tree 的 `CommitChangeSet`；提交 ID 使用 UUIDv7，服务端重算内容指纹。
- 工作区整行 JSONB 拆为成员、策略、提交、引用、共享记录、PR、候选、审核、讨论、通知、回执、审计等表；引用以比较交换推进，按固定顺序加细粒度锁。
- 合并候选只加载合并基以来双方改动过的记录；字段级三方合并语义不变。
- 回执保留期，通知与审计分页；读路径不加锁、不写库。
- 由 RxDB 实体元数据生成的 schema 清单驱动 ChangeSet 校验，取代写死的资产规则。
- 快照接口拆为摘要、PR 详情、提交元数据、PR 变更记录与审计分页。

### Out of Scope

- RLS 直读、Realtime Broadcast / Presence 与本地 JWT 校验，由 [ADMIN-US-219](ADMIN-US-219-supabase-native-read-realtime.md) 承接。
- Edge Function 部署形态，由 [ADMIN-US-220](ADMIN-US-220-supabase-only-deployment.md) 承接。
- 客户端改用 RxDB 工作树，由 [ADMIN-US-221](ADMIN-US-221-task-drafts-on-working-tree.md) 承接；本故事中客户端仍用现有 IndexedDB 任务存储，只把提交协议切换为 ChangeSet。
- 审计的合规导出与归档，另行立项。

## 验收标准

| #   | 前置条件                                                     | 操作                                     | 预期结果                                                                                                           | 状态 |
| --- | ------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 工作区已有 1000 个提交、10000 条共享记录                     | 执行评论、审核、已读、成员变更等普通命令 | 服务端耗时与 10 个提交时相比差异不超过计划预算，命令路径不读取完整历史                                             | ⬜   |
| 2   | 任务有若干本地提交                                           | 同步上传                                 | 上传体积与本次改动的记录数成正比；服务端重算指纹，不一致或父链非法即拒绝；同 ID 同内容幂等返回，同 ID 不同内容拒绝 | ⬜   |
| 3   | 共享分支与任务分支各自改动了少量记录                         | 生成合并候选并合并                       | 只加载合并基以来改动过的记录；候选、冲突、检查与字段级合并结果和现行实现一致                                       | ⬜   |
| 4   | 一名成员批准或合并的同时另一名成员被撤权，或两台设备并发上传 | 并发执行                                 | 授权与数据变更仍按统一裁决顺序；现有并发、交错与事务失败回滚的集成用例全部通过                                     | ⬜   |
| 5   | 待确认请求超过回执保留期                                     | 客户端重试或用户手动确认                 | 保留期内重试返回原结果；过期后客户端停止自动重试并交给用户确认，已接受的提交按 ID 去重，不会重复建提交             | ⬜   |
| 6   | 成员打开团队页后收到版本通知                                 | 刷新                                     | 只获取摘要与当前打开的 PR 详情，单次响应在预算内且不随提交数增长；读取不加排他锁、不在读路径写库                   | ⚠️   |
| 7   | 用一套非资产实体的 schema 清单（测试夹具）                   | 走任务提交、候选、审批与合并全流程       | 协作包不含实体特定的校验代码即可通过；必填、唯一、关系与数值约束由清单驱动                                         | ⬜   |
| 8   | ADMIN-US-201～216 的验收用例                                 | 在新实现上运行单元、集成和三端协作 E2E   | 全部通过，用户可见行为不变                                                                                         | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：阶段 0 基线见 [收敛实施计划 3.1 节](../../plans/collaboration-convergence-tasks.md#31-阶段-0-基线与切片进度)，#1、#6 的预算以同一脚本 `admin-collaboration:benchmark-growth` 前后对照关闭。#6 已完成「读取不加排他锁、不在读路径写库」（切片 A）：`repository.integration.spec.ts` 的「写锁期间读取立即返回」与「心跳不能越过并发撤权」两例，分别用改动前实现（`111f7a6ce`）与 Presence 无锁变异验证会红；切片 B 已让版本通知后只拉摘要，提交与候选内容、共享数据和更早审计按需读取（`engine.spec`、`http.spec`、`controller.spec`、`pr-view.spec`、`history-view.spec` 与集成用例，30 个协作 E2E 同轮通过）；200 个提交时摘要 66 KB（基线快照 26.8 MB），但仍按约 0.3 KB/提交线性增长、超出 50 KB 预算，提交元数据分页在切片 D 完成，故保持 ⚠️。

## 技术笔记

方案、表结构、锁顺序、合并输入的推导方式与预算见 [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md) 第 3 节。要点：

- 合并基的值由物化的共享头反向应用共享分支上的 `inversePatch` 得到，不需要另存每条记录的历史版本。
- 治理行对普通命令加 `FOR SHARE`、对成员与策略变更加 `FOR UPDATE`，保留 [D-06](../../decisions.md#d-06数据协作的产品模型) 的统一裁决顺序。
- 产品尚未部署，迁移文件可按新结构重写，没有线上数据迁移。
- ChangeSet 协议是 [ADMIN-US-221](ADMIN-US-221-task-drafts-on-working-tree.md) 切换客户端存储的前提：切换时服务端与已存数据不变。

## 实现文件

尚未实施。预计涉及 `rxdb-admin-template/supabase/migrations/`、`rxdb-admin-template/packages/collaboration/src/server/`（`repository.ts`、`engine.ts`、`governance.ts`、`tasks.ts`）、`src/records.ts`、`src/model.ts` 与 `src/client/controller.ts`。

## References

- [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md)
- [协作首版共享契约](../../collaboration-contract.md)
- [ADMIN-EPIC-004](../../epics/ADMIN-EPIC-004.md)
- [平台 working-tree 插件](../../../../packages/rxdb-plugin-working-tree/README.md)
