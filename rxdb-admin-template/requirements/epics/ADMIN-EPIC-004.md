---
id: ADMIN-EPIC-004
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 协作服务部署与运维

## 愿景

让协作首版在真实 Supabase 项目和协作 API 环境中可重复部署、逐条验收并长期稳定运行，使 [ADMIN-EPIC-002](ADMIN-EPIC-002.md) 与 [ADMIN-EPIC-003](ADMIN-EPIC-003.md) 的故事具备关闭所需的外部环境证据。

## 为什么单列一个 Epic

这是横跨认证团队与数据变更中心两个 Epic 的发布约束，不属于其中任何一个的产品能力：ADMIN-EPIC-002 的非目标明确不含独立部署，ADMIN-EPIC-003 只负责数据 PR 与合并治理。部署、迁移、环境配置、部署后验收与长期运行护栏需要单独排期和验收。

## 目标

- [ ] 迁移、协作 API 与三端产品可重复部署到 staging / production，部署后完成协作验收并补齐生产 SMTP 证据，具备长期运行的状态治理、健康检查和回滚预案（[ADMIN-US-217](../stories/collaboration/ADMIN-US-217-production-deployment-operations.md)）。

## 故事

本清单只列范围，状态见 [status-overview](../status-overview.md)。

- [ADMIN-US-217 协作服务生产部署与运维闭环](../stories/collaboration/ADMIN-US-217-production-deployment-operations.md) (High)

## 非目标

- 不新增协作产品能力；功能缺口在对应故事或 [后续候选](../future-requirements.md#后续候选) 中处理。
- 不建设多区域、自动扩缩容或跨产品的统一运维平台。
