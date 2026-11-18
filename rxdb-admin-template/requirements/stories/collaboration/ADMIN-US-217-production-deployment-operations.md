---
id: ADMIN-US-217
title: 协作服务生产部署与运维闭环
status: In Progress
priority: High
epic: ADMIN-EPIC-004
created: 2026-11-17
updated: 2026-11-18
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
| 3   | 构建产物与部署配置                     | 运行密钥扫描并检查部署环境变量                         | 前端产物与仓库不含 service role key、数据库连接串等 secret；服务端 secret 只来自部署环境 |      | ⚠️  |
| 4   | staging 已配置邮件服务与验证码模板     | 用真实邮箱请求并使用验证码；另取一码等其自然过期再提交 | 真实邮箱收到验证码并完成登录；过期验证码被拒绝且可重新请求                               | ⬜   |
| 5   | staging 部署完成                       | 对部署地址运行三端协作 E2E 与 RLS 验收                 | 全部通过，结果与该次发布记录关联                                                         | ⬜   |
| 6   | 工作区累积了预设规模的回执、审计与通知 | 执行普通命令并读取团队快照                             | 单次命令耗时与快照体积在预算内；保留期内的幂等重试仍返回原结果；审计按策略归档且仍可查询 | ⬜   |
| 7   | 协作 API 运行中                        | 访问健康检查，并人为触发一次未处理错误                 | 健康检查反映数据库与 Auth 可用性；错误进入监控，记录中不含 token、验证码或受邀邮箱       | ⬜   |
| 8   | 新版本发布后发现回归                   | 按回滚预案操作                                         | 应用回到上一版本；已执行迁移有对应的回滚或前向修复说明，共享数据不丢失                   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：尚无。本故事的证据必须来自真实部署环境；本地临时 PostgreSQL 与隔离 Supabase 测试栈的结果不能替代。

owner 2026-11-18 决定先用本机 Docker 搭完整的自托管 Supabase 做预演：按生产步骤部署并跑 AC#1～#8，本条「证据必须来自真实部署环境」不变，预演证据一律标 ⚠️，上线前在真实环境复验。

部署前准备（不构成验收证据）：

- AC#3：2026-11-17 新增密钥扫描门禁 `pnpm nx run rxdb-admin-template:secrets-check`（先构建三端，再扫产品根被跟踪的文件与三端产物）。规则：服务端角色 JWT、`sb_secret_` 密钥、带密码的数据库连接串、PEM 私钥；产物里另禁服务端变量名（出现即说明服务端模块被打进前端包）；报告只带打码前缀。规则用例 7 条（`secrets-test`，并入产品根 `test`）。真实发布流水线接入与部署环境变量核对仍待完成。

## 技术笔记

- 本故事排在协作后端收敛之后（[D-09](../../decisions.md#d-09协作后端收敛方向)）：差量提交、拆表与有界命令成本由 [ADMIN-US-218](ADMIN-US-218-delta-commits-bounded-cost.md) 交付，RLS 读取、Broadcast、Presence 与本地 JWT 校验由 [ADMIN-US-219](ADMIN-US-219-supabase-native-read-realtime.md) 交付，只部署 Supabase 的形态由 [ADMIN-US-220](ADMIN-US-220-supabase-only-deployment.md) 交付。本故事在真实环境中验证它们的预算与保留策略（AC#6），不再在首版整行 JSONB 上治理状态增长。
- 审计查询入口落地时，同步补 `(team_id, app_id, created_at)` 等对应索引，避免按时间范围全表扫描。
- 命令入口已对请求头与请求体接收设置超时（10 秒 / 60 秒），慢速客户端无法长期占用连接；连接上限、限流与 TLS 由部署环境负责。
- 测试 fixture 当前把工作区版本与成员投影同步到隔离 Supabase CI 数据库以覆盖 Realtime；正式部署必须让 `ADMIN_DATABASE_URL` 指向同一 Supabase 项目数据库（见 [协作实现与验收记录](../../plans/collaboration-implementation.md#测试环境与部署差异)）。
- 本故事完成后，ADMIN-US-201～216 才具备「合入并在真实环境验收」的关闭条件。
- 前置故事留下的部署事项（2026-11-18 汇总）：
  - 部署顺序见协作包 README「只部署 Supabase」：迁移 → 用 `nx run admin-collaboration:service-role` 设专用角色口令 → `build-edge` 后 `supabase functions deploy admin-collaboration --no-verify-jwt` → 设函数密钥（`ADMIN_DATABASE_URL` 经 Supavisor 6543 端口、`ADMIN_JWKS_URL`、`ADMIN_JWT_ISSUER`、`ADMIN_ALLOWED_ORIGINS`）→ `bootstrap`（读 `ADMIN_OWNER_DATABASE_URL`）→ 三端静态站点把 `/collaboration-api/*` 改写到函数地址。
  - 身份：在项目上启用非对称 JWT 签名密钥；access token 有效期缩短到 10～15 分钟。
  - PostgREST `db-max-rows` 设为 ≥ 500；评估开启 Realtime「只允许私有频道」；监控 `realtime.send` 的 WARNING（它不抛错，靠跳号补齐兜底），确认 `realtime.messages` 的分区清理。
  - Supavisor 连接的 SSL 与 CA 配置；本地是用 PgBouncer 代测 transaction 模式的约束。托管环境的冷启动与 CPU 计量要复测。
  - CI 需要能拉取 `supabase/edge-runtime:v1.74.0` 与固定摘要的 PgBouncer 镜像。

## 实现文件

- 密钥扫描：[check-secrets.mjs](../../../scripts/check-secrets.mjs)、[check-secrets.spec.mjs](../../../scripts/check-secrets.spec.mjs)，目标定义在 [project.json](../../../project.json)。
- 其余尚未实施。预计涉及 `rxdb-admin-template/supabase/migrations/`、`rxdb-admin-template/packages/collaboration/src/server/` 与部署流水线配置。

## References

- [协作首版共享契约](../../collaboration-contract.md)
- [协作实现与验收记录](../../plans/collaboration-implementation.md)
- [ADMIN-EPIC-004](../../epics/ADMIN-EPIC-004.md)
