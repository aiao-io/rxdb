---
id: US-322
title: 仅经 PR 写入：实体声明写入模式，共享数据只能经绑定候选的审核与原子合并改变
status: Backlog
priority: Medium
epic: epic-017-pr-only-team-data
created: 2026-11-28
updated: 2026-11-28
tags: [collaboration, permission, supabase, review, merge]
---

# 用户故事：仅经 PR 写入

## 作为/我想要/以便

**作为** 需要「改动先审后合」的团队数据应用开发者（主数据、配置、价目表这一类）
**我想要** 给实体声明写入模式「仅经 PR」：本地写只进任务分支；共享数据只能经数据 PR 改变——服务端生成不可变的合并候选，检查与审核都绑定这个候选，有合并权的成员原子合并
**以便** 管理员与合并者也绕不过审核直写共享数据，换一个应用不必重写一遍 Admin 协作包的领域引擎

## 解锁条件

价值待证（[epic-017](../../epics/epic-017-pr-only-team-data.md#价值待证)），前置 [US-321](US-321-supabase-commit-exchange.md)。出现以下任一信号即可提请解锁：

- Admin 之外的第二个应用需要「改动先审后合」的共享数据；
- owner 决定把 Admin 协作包的领域引擎迁到平台。

## 现状

1. **平台只有直写。** Supabase 推送经 `rxdb_mutations` 按 RLS 直写业务表，有 `edit` 的成员就能改共享数据（[US-234](../adapter/US-234-supabase-tenant-member-permissions.md)）。[epic-015](../../epics/epic-015-identity-scoped-sync.md) 的写入模式目标里「仅经 PR **尚无故事认领**」，[US-029](../core/US-029-rbac-owner-role-permission.md) 把它列在范围外、待另立故事。
2. **Admin 协作包有完整实现。** PR → 候选（服务端三方字段合并 [`mergeRecords()`](../../../rxdb-admin-template/packages/collaboration/src/records.ts) 加合并前检查，绑定合并基 B、来源头 S、目标头 T、冲突选择与规则版本）→ 审核（多阶段、要求修改阻塞、批准随权限代次失效、不能自审）→ 合并（[`governance.ts`](../../../rxdb-admin-template/packages/collaboration/src/server/governance.ts) 重算结果与候选比对，一个事务写共享记录、键索引、共享头、变更、审计、回执与广播）。检查由 schema 清单驱动（`describeEntityFields()` 生成），协作包的非测试源码不含任何业务实体名。

## 范围边界

### In Scope

- **写入模式声明**：实体声明「仅经 PR」；推送、直写 RPC 与离线重放对它一律拒绝，本地写只进任务分支的工作树。
- **数据 PR 生命周期**：创建、追加提交、关闭与重开；候选由服务端生成且不可变；B / S / T、冲突选择或规则版本任一变化，候选、检查与批准一起过期（Admin C04）。
- **审核聚合与唯一写入口**：按 Admin C05 聚合批准与阻塞；共享数据、共享头与合并审计只在合并事务里写（Admin C06）。
- **三方字段级合并与冲突裁决**：平台今天只有单向覆盖合并（epic-014 非目标），本故事补齐。
- **schema 清单驱动的检查**：必填、唯一、引用、取值；新 schema 版本必须让现有共享数据全部通过。
- **回到各端**：合并产生的共享提交经 US-321 的下载回到各端的共享分支。

### Out of Scope

- 多级审批的配置界面、通知中心与审核人自动分配（应用自己做）。
- 字段级权限与脱敏。

## 验收标准

| #   | 前置条件                                           | 操作                           | 预期结果                                                           | 状态 |
| --- | -------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------ | ---- |
| 1   | 实体声明仅经 PR，调用者有 `edit` 与 `merge`        | 经推送或直写 RPC 改共享数据    | 被拒；共享数据、共享头与审计都不变                                 | ⬜   |
| 2   | 任务分支有提交                                     | 创建 PR 并生成候选             | 候选不可变，记下 B / S / T、冲突选择、结果摘要与规则版本           | ⬜   |
| 3   | 审核者批准候选 C1 之后，合并者把冲突结果改成别的值 | 重新生成候选并请求合并         | 得到 C2；C1 的批准与检查不能授权 C2（Admin C04 的回归例）          | ⬜   |
| 4   | 有未解除的要求修改，或批准人已失去审核权           | 请求合并                       | 拒绝，给出阻塞原因                                                 | ⬜   |
| 5   | 合并条件全部满足                                   | 合并                           | 共享数据、共享头、合并提交、审计与回执一起提交；任一步失败整笔回滚 | ⬜   |
| 6   | 同一幂等键重试已成功的合并                         | 再次请求                       | 返回原回执，不重复合并；同一键配不同候选被拒                       | ⬜   |
| 7   | 新 schema 版本会让现有共享数据不合法               | 登记新版本                     | 拒绝，列出不合法的记录                                             | ⬜   |
| 8   | Angular / React / Vue                              | 对同一权限矩阵跑同一组用户流程 | 入口、拒绝语义与服务端结果一致                                     | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：随实现补齐。

## 技术笔记

- 审核权与合并权的判定依赖成员与权限（[US-239](../adapter/US-239-supabase-team-membership-realtime.md)）；撤权与批准、合并要按同一个锁顺序裁决（Admin D-09 第 2 条：治理行 `FOR SHARE` / `FOR UPDATE` → PR 行 → 引用行）。
- 引擎能不能原样上移取决于 epic-017 待冻结的决策 1；Admin 的单测、PostgreSQL 集成用例与三端协作 e2e 是现成的回归基线。

## References

- [Admin 协作契约 C04～C06](../../../rxdb-admin-template/requirements/collaboration-contract.md)
- [US-321 Supabase 上的提交图远端交换](US-321-supabase-commit-exchange.md)
- [epic-015 写入模式目标](../../epics/epic-015-identity-scoped-sync.md)
