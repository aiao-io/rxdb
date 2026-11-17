---
id: ADMIN-US-217
title: 协作服务生产部署与运维闭环
status: Backlog
priority: High
epic: ADMIN-EPIC-004
created: 2026-11-17
updated: 2026-11-17
tags: [admin, collaboration, deployment, operations, supabase]
dependsOn: [ADMIN-US-218, ADMIN-US-219, ADMIN-US-220]
capabilities: []
---

# 用户故事：协作服务生产部署与运维闭环

## 作为/我想要/以便

**作为** Admin 模板的部署与运维负责人
**我想要** 用可重复的流程把迁移、协作 API 和三端应用部署到 staging 与 production，并在部署后逐条验收、长期监控
**以便** 协作故事获得真实环境证据，服务在长期运行后仍可用、可排障、可回滚。

## 范围边界

### In Scope

- Supabase 项目与 PostgreSQL 迁移：干净项目上可重复执行，部署流水线先执行迁移再发布。
- 命令入口（Edge Function，见 [ADMIN-US-220](ADMIN-US-220-supabase-only-deployment.md)）与三端静态产物的部署；环境变量与 secret 集中管理，前端产物不含任何服务端 secret。
- staging 与 production 两套环境；邮件发送服务与 passwordless 验证码模板配置。
- 部署后验收：对部署地址运行三端协作 E2E 与 RLS 验收，补齐 [ADMIN-US-201](ADMIN-US-201-supabase-email-otp-session.md) AC#2 / #3 的真实邮箱证据。
- 长期运行护栏：工作区状态的保留策略与快照规模预算、健康检查、错误监控、发布记录与回滚预案。

### Out of Scope

- OAuth、企业 SSO、计费、多区域部署和自动扩缩容。
- 新的协作产品能力；本故事只部署和守护 ADMIN-US-201～216 已定义的行为。

## 验收标准

| #   | 前置条件                               | 操作                                                   | 预期结果                                                                                 | 状态 |
| --- | -------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---- |
| 1   | 干净的 Supabase 项目                   | 连续执行两次产品迁移                                   | 第二次不报错、不产生变更；表、RLS、授权与 Realtime publication 与仓库迁移一致            | ⬜   |
| 2   | 部署流水线已配置                       | 发布到 staging 或 production                           | 先执行迁移，再发布协作 API 与三端产物；任一步失败即停止发布，线上保留上一版本            | ⬜   |
| 3   | 构建产物与部署配置                     | 运行密钥扫描并检查部署环境变量                         | 前端产物与仓库不含 service role key、数据库连接串等 secret；服务端 secret 只来自部署环境 | ⬜   |
| 4   | staging 已配置邮件服务与验证码模板     | 用真实邮箱请求并使用验证码；另取一码等其自然过期再提交 | 真实邮箱收到验证码并完成登录；过期验证码被拒绝且可重新请求                               | ⬜   |
| 5   | staging 部署完成                       | 对部署地址运行三端协作 E2E 与 RLS 验收                 | 全部通过，结果与该次发布记录关联                                                         | ⬜   |
| 6   | 工作区累积了预设规模的回执、审计与通知 | 执行普通命令并读取团队快照                             | 单次命令耗时与快照体积在预算内；保留期内的幂等重试仍返回原结果；审计按策略归档且仍可查询 | ⬜   |
| 7   | 协作 API 运行中                        | 访问健康检查，并人为触发一次未处理错误                 | 健康检查反映数据库与 Auth 可用性；错误进入监控，记录中不含 token、验证码或受邀邮箱       | ⬜   |
| 8   | 新版本发布后发现回归                   | 按回滚预案操作                                         | 应用回到上一版本；已执行迁移有对应的回滚或前向修复说明，共享数据不丢失                   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：尚无。本故事的证据必须来自真实部署环境；本地临时 PostgreSQL 与隔离 Supabase 测试栈的结果不能替代。

## 技术笔记

- 本故事排在协作后端收敛之后（[D-09](../../decisions.md#d-09协作后端收敛方向)）：差量提交、拆表与有界命令成本由 [ADMIN-US-218](ADMIN-US-218-delta-commits-bounded-cost.md) 交付，RLS 读取、Broadcast、Presence 与本地 JWT 校验由 [ADMIN-US-219](ADMIN-US-219-supabase-native-read-realtime.md) 交付，只部署 Supabase 的形态由 [ADMIN-US-220](ADMIN-US-220-supabase-only-deployment.md) 交付。本故事在真实环境中验证它们的预算与保留策略（AC#6），不再在首版整行 JSONB 上治理状态增长。
- 审计查询入口落地时，同步补 `(team_id, app_id, created_at)` 等对应索引，避免按时间范围全表扫描。
- 命令入口已对请求头与请求体接收设置超时（10 秒 / 60 秒），慢速客户端无法长期占用连接；连接上限、限流与 TLS 由部署环境负责。
- 测试 fixture 当前把工作区版本与成员投影同步到隔离 Supabase CI 数据库以覆盖 Realtime；正式部署必须让 `ADMIN_DATABASE_URL` 指向同一 Supabase 项目数据库（见 [协作实现与验收记录](../../plans/collaboration-implementation.md#测试环境与部署差异)）。
- 本故事完成后，ADMIN-US-201～216 才具备「合入并在真实环境验收」的关闭条件。

## 实现文件

尚未实施。预计涉及 `rxdb-admin-template/supabase/migrations/`、`rxdb-admin-template/packages/collaboration/src/server/` 与部署流水线配置。

## References

- [协作首版共享契约](../../collaboration-contract.md)
- [协作实现与验收记录](../../plans/collaboration-implementation.md)
- [ADMIN-EPIC-004](../../epics/ADMIN-EPIC-004.md)
