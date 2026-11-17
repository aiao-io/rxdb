---
id: ADMIN-US-220
title: 协作服务只部署 Supabase 即可运行
status: Backlog
priority: High
epic: ADMIN-EPIC-004
created: 2026-11-17
updated: 2026-11-17
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
| 1   | 全新 Supabase 项目                    | 执行迁移、部署函数、运行一次初始化      | 三端指向该项目即可完成登录、邀请、任务提交、PR、审批与合并，不需要额外服务器                                     | ⬜   |
| 2   | 同一套命令契约测试                    | 分别针对 Edge Function 与 Node 入口运行 | 结果逐项一致，包括幂等、并发、权限拒绝与事务失败回滚                                                             | ⬜   |
| 3   | 10000 条共享记录、1000 个提交的工作区 | 执行最重的候选生成、合并与批量上传      | 单次请求的 CPU 与内存在 Edge Function 限制内并留有计划规定的余量                                                 | ⬜   |
| 4   | 部署配置                              | 检查数据库连接、权限与前端产物          | 函数使用专用数据库角色，只拥有协作所需权限；不用超级用户或 service role 执行业务命令；前端产物不含任何服务端密钥 | ⬜   |
| 5   | 函数冷启动、超时或连接池耗尽          | 发起命令并重试                          | 客户端得到可重试的明确错误；操作幂等键保证重试不重复执行                                                         | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：尚无。

## 技术笔记

见 [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md) 第 4 节。Edge Function 每个请求 2 秒 CPU、256 MB 内存，只有在 [ADMIN-US-218](ADMIN-US-218-delta-commits-bounded-cost.md) 把单次命令成本降到与改动量成正比之后才可行。transaction 模式下事务内的 `FOR UPDATE` 可用，但不能依赖会话级状态与预编译语句。最重用例超出预算时，保留 Node 入口作为部署选项，并在运维文档中写明取舍。

## 实现文件

尚未实施。预计新增 Edge Function 入口，并涉及 `rxdb-admin-template/packages/collaboration/src/server/`（`http.ts`、`main.ts`、`repository.ts`）与迁移中的数据库角色授权。

## References

- [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md)
- [协作包运行说明](../../../packages/collaboration/README.md)
- [ADMIN-EPIC-004](../../epics/ADMIN-EPIC-004.md)
