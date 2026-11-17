---
id: ADMIN-EPIC-004
status: In Progress
startDate: 2026-11-17
targetDate: TBD
owner: jimmy
---

# 协作后端收敛、部署与运维

## 愿景

把协作首版收敛成一套命令成本与历史长度无关、只部署 Supabase 即可运行的 Git 式数据协作后端，并在真实环境中逐条验收、长期稳定运行，使 [ADMIN-EPIC-002](ADMIN-EPIC-002.md) 与 [ADMIN-EPIC-003](ADMIN-EPIC-003.md) 的故事具备关闭条件。

## 为什么单列一个 Epic

这是横跨认证团队与数据变更中心两个 Epic 的实现与发布约束，不新增产品能力：存储模型、Supabase 接入方式、部署形态与上线验收同时影响 ADMIN-US-201～216。ADMIN-EPIC-002 的非目标明确不含独立部署，ADMIN-EPIC-003 只负责数据 PR 与合并治理。方向见 [D-09](../decisions.md#d-09协作后端收敛方向)。

## 目标

- [ ] 提交改为字段级 ChangeSet，工作区拆表，单次命令成本与历史长度无关（[ADMIN-US-218](../stories/collaboration/ADMIN-US-218-delta-commits-bounded-cost.md)）。
- [ ] 读取、实时通知、在线状态与身份校验改用 Supabase 原生能力（[ADMIN-US-219](../stories/collaboration/ADMIN-US-219-supabase-native-read-realtime.md)）。
- [ ] 命令入口可只部署为 Supabase Edge Function（[ADMIN-US-220](../stories/collaboration/ADMIN-US-220-supabase-only-deployment.md)）。
- [ ] 迁移、发布、真实邮箱证据、部署后协作验收与长期运行护栏（[ADMIN-US-217](../stories/collaboration/ADMIN-US-217-production-deployment-operations.md)）。
- [ ] 团队任务草稿落在平台 working-tree，编辑复用模型驱动界面（[ADMIN-US-221](../stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md)，依赖平台立项）。

## 故事

本清单只列范围，状态见 [status-overview](../status-overview.md)。

- [ADMIN-US-218 差量提交与有界命令成本](../stories/collaboration/ADMIN-US-218-delta-commits-bounded-cost.md) (High)
- [ADMIN-US-219 协作读取、实时与身份校验改用 Supabase 原生能力](../stories/collaboration/ADMIN-US-219-supabase-native-read-realtime.md) (High)
- [ADMIN-US-220 协作服务只部署 Supabase 即可运行](../stories/collaboration/ADMIN-US-220-supabase-only-deployment.md) (High)
- [ADMIN-US-217 协作服务生产部署与运维闭环](../stories/collaboration/ADMIN-US-217-production-deployment-operations.md) (High)
- [ADMIN-US-221 团队任务草稿落在 RxDB 工作树](../stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md) (Medium)

实施顺序与平台缺口见 [协作后端收敛实施计划](../plans/collaboration-convergence-tasks.md)。

## 非目标

- 不新增协作产品能力；功能缺口在对应故事或 [后续候选](../future-requirements.md#后续候选) 中处理。
- 不建设多区域、自动扩缩容或跨产品的统一运维平台。
- 不在本 Epic 内实现平台 working-tree 的远端提交交换；它在根 requirements 立项，本 Epic 只消费。
