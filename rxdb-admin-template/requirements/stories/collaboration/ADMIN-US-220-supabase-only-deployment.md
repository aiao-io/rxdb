---
id: ADMIN-US-220
title: 协作服务只部署 Supabase 即可运行
status: In Review
priority: High
epic: ADMIN-EPIC-004
created: 2026-11-17
updated: 2026-11-18
tags: [admin, collaboration, supabase, edge-functions, deployment]
dependsOn: [ADMIN-US-218, ADMIN-US-219]
capabilities: []
---

# 用户故事：协作服务只部署 Supabase 即可运行

## 作为/我想要/以便

**作为** 协作模板的部署者
**我想要** 不另外托管 Node 服务，只用 Supabase 的迁移、Edge Function 与一次初始化就能上线团队协作
**以便** 以最小的部署和运维成本使用这套 Git 式数据协作后端。

## 范围边界

### In Scope

- 命令入口打包为 Supabase Edge Function，与 Node 入口共用同一领域引擎模块。
- 经 Supavisor transaction 模式连接数据库，使用只授予协作表权限的专用数据库角色；密钥只来自函数环境。
- Node 入口保留为等价运行时，二者共享一套命令契约测试。
- 资源预算与最重用例的验收：候选生成、合并、批量上传。

### Out of Scope

- 多区域部署、自定义网关与限流平台。
- staging / production 的发布流水线与真实邮箱证据，由 [ADMIN-US-217](ADMIN-US-217-production-deployment-operations.md) 承接。

## 验收标准

| #   | 前置条件                              | 操作                                    | 预期结果                                                                                                         | 状态 |
| --- | ------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 全新 Supabase 项目                    | 执行迁移、部署函数、运行一次初始化      | 三端指向该项目即可完成登录、邀请、任务提交、PR、审批与合并，不需要额外服务器                                     | ⚠️   |
| 2   | 同一套命令契约测试                    | 分别针对 Edge Function 与 Node 入口运行 | 结果逐项一致，包括幂等、并发、权限拒绝与事务失败回滚                                                             | ✅   |
| 3   | 10000 条共享记录、1000 个提交的工作区 | 执行最重的候选生成、合并与批量上传      | 单次请求的 CPU 与内存在 Edge Function 限制内并留有计划规定的余量                                                 | ✅   |
| 4   | 部署配置                              | 检查数据库连接、权限与前端产物          | 函数使用专用数据库角色，只拥有协作所需权限；不用超级用户或 service role 执行业务命令；前端产物不含任何服务端密钥 | ✅   |
| 5   | 函数冷启动、超时或连接池耗尽          | 发起命令并重试                          | 客户端得到可重试的明确错误；操作幂等键保证重试不重复执行                                                         | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据（2026-11-18，本地）：

- AC#1 ⚠️：协作 e2e 的 Edge 模式（`nx e2e admin-collaboration -c edge`）42/42 通过，此时不起任何 Node 协作服务，命令全部经 `supabase/edge-runtime:v1.74.0` 里的函数执行；「干净库 → 迁移 → 设专用角色口令 → 起函数 → 初始化 → 走完全部命令」由契约测试覆盖（无浏览器）。在全新的真实 Supabase 项目上部署并跑三端，由 ADMIN-US-217 承接。
- AC#2 ✅：`contract.integration.spec.ts` 23 例，同一套用例按基础 URL 分别打 Node 与 Edge 入口：幂等重放与换参数复用操作 ID、同任务并发上传一胜一负、撤权与批准交错（触发器加咨询锁确定性制造两种顺序）、9 种权限拒绝、合并中途失败回滚后原操作 ID 重试、等锁超时与连接池耗尽返回 503、客户端按 `Retry-After` 重发只执行一次、21 种命令由专用角色执行；两个入口的规范化结果逐项相等（[结果](../../plans/evidence/collaboration-edge-contract-2026-11-18.json)）。拓扑为干净的临时 PostgreSQL 加 transaction 模式的 PgBouncer（代测 Supavisor 的约束）。
- AC#3 ✅：10000 条共享记录、1002 个提交的工作区上，每个请求由新建的 worker 处理（含冷启动、建连与认证），限额同线上（CPU 软限 1 s、硬限 2 s，内存 256 MB）。改动 100 条记录的上传 / 候选 / 合并最大 CPU 51 / 74 / 76 ms，1000 条 80 / 145 / 297 ms，5000 条 161 / 383 / 650 ms；最坏情形是一个 PR 改动全部 10000 条记录后合并，CPU 1423 ms，为硬限的 71%（余量 1.41 倍，收紧到 1.5 s 仍通过），内存峰值在 64～96 MB 之间（余量至少 2.7 倍）（[结果](../../plans/evidence/collaboration-edge-resource-2026-11-18.json)）。托管平台的冷启动与 CPU 计量在 ADMIN-US-217 复测。 提交改为平台交换格式（ADMIN-US-221-A）后复测：请求上限由 2 MiB 放宽到 4 MiB，让单个提交一万项变更在资产体量下可上传；改动一万条的上传 2.26 MiB、CPU 318 ms，合并 1068 ms（硬限的 53%，余量 1.87 倍）（[结果](../../plans/evidence/collaboration-edge-resource-exchange-2026-11-18.json)）。
- AC#4 ✅：迁移建 NOLOGIN、无口令的专用角色 `admin_collaboration`，只授予协作对象的最小权限，广播只能经 SECURITY DEFINER 函数 `admin_private.broadcast()` 发往协作频道；口令由部署步骤以 SCRAM 校验值设置。`service-role.integration.spec.ts` 6 例证明它不是超级用户、不能绕过 RLS、读不到 `bootstrap_key`、访问不了 auth / storage / vault / realtime、不能改表与策略或切换角色；两个入口启动时检查连接串用户名必须是该角色，`runtime.spec` 断言从不读取 service role key 与 `SUPABASE_DB_URL`；`secrets-check` 通过。
- AC#5 ✅：连接池耗尽、语句或等锁超时、连接中断与重试用尽的死锁统一返回 503、`Retry-After` 与错误码 `unavailable`，事务整体回滚；客户端对 503 / 504 / 546 用同一操作 ID 自动重发，最多 4 次。`availability.spec` 25 例与契约测试三项证明两个入口都只执行一次。
- 复验时另修一处已有泄露：初始化审计事件把初始化密钥当操作 ID 写进成员可读的审计，现改为新生成的 ID（`engine.spec.ts`「审计事件不含初始化密钥」先红后绿）；密钥扫描名单补上 `ADMIN_OWNER_DATABASE_URL`、`ADMIN_SERVICE_PASSWORD`、`ADMIN_JWT_SECRET`。

## 技术笔记

见 [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md) 第 4 节。Edge Function 每个请求 2 秒 CPU、256 MB 内存，只有在 [ADMIN-US-218](ADMIN-US-218-delta-commits-bounded-cost.md) 把单次命令成本降到与改动量成正比之后才可行。transaction 模式下事务内的 `FOR UPDATE` 可用，但不能依赖会话级状态与预编译语句。最重用例超出预算时，保留 Node 入口作为部署选项，并在运维文档中写明取舍。

## 实现文件

- 两个入口共用的 fetch 处理函数与装配：`packages/collaboration/src/server/handler.ts`、`runtime.ts`；Node 入口 `http.ts` / `start.ts` / `main.ts`，Edge 入口 `edge.ts` 与 `rxdb-admin-template/supabase/functions/admin-collaboration/index.ts`。
- 打包与本地运行：`scripts/build-edge.mjs`（esbuild 自包含 ESM，产物不进仓库）、`scripts/serve-edge.mjs`、`scripts/edge-runtime/`（限额同线上的主服务）。
- 可重试错误：`src/server/availability.ts`，客户端重发在 `src/client/api.ts`。
- 专用角色：`rxdb-admin-template/supabase/migrations/202611180001_service_role.sql`，口令设置 `nx run admin-collaboration:service-role`。
- 部署步骤与 Supavisor 约束见协作包 README「只部署 Supabase」一节。

## References

- [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md)
- [协作包运行说明](../../../packages/collaboration/README.md)
- [ADMIN-EPIC-004](../../epics/ADMIN-EPIC-004.md)
