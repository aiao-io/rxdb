---
id: MEDIA-US-308
product: aiao-media
title: 配置分支提交与后台应用同步
status: In Progress
priority: High
epic: MEDIA-EPIC-004
created: 2026-11-15
updated: 2026-11-25
dependsOn: [MEDIA-US-306, MEDIA-US-307]
tags: [rxdb, branch, commit, sync, config, audit]
---

# 用户故事：配置分支提交与后台应用同步

## 作为/我想要/以便

**作为** 配置管理员和后台服务

**我想要** 通过 RxDB 分支、working-tree 和提交逻辑同步配置内容及其变更记录

**以便** 后台可以校验提交的父节点、内容指纹和 revision，再原子应用、发布或回滚配置

## 范围边界

### In Scope

- Admin 编辑配置时由 working-tree 捕获业务实体变更。
- 支持创建、切换、提交和合并配置分支，并同步 `rxdb_branch` 分支元数据。
- 每个配置提交生成领域级 `media_config_commits` 和 `media_config_commit_changes` 投影。
- commit projection 包含 `commitId`、`operationId`、`branchId`、`parentIds`、操作者、内容指纹、变更顺序和 patch。
- 后台服务拉取完整 commit envelope，校验父提交、fingerprint、权限和 revision。
- 通过原子 `apply_media_config_commit` RPC 应用配置、写审计并更新提交状态。
- 支持重复推送、投影补偿、后台重启、冲突、拒绝、应用、发布和回滚状态。

### Out of Scope

- 直接同步 RxDB 内部 `Commit`、`CommitChangeSet`、`WorkingTreeEntry` 等系统表。
- 第一阶段还原所有设备上的完整 RxDB commit graph。
- 没有完整投影时把配置标记为已应用或已发布。
- 绕过 RLS 直接写配置或提交状态。

## 验收标准

| #   | 前置条件                                          | 操作                               | 预期结果                                                                 | 状态 |
| --- | ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ | ---- |
| 1   | 管理员在配置分支上编辑实体                        | 调用 `workingTree.commit(message)` | 业务实体变更被捕获，并生成唯一的 commit identity                         | ✅   |
| 2   | 本地提交完成                                      | 模拟 `commits$` 处理延迟或进程崩溃 | 启动补偿扫描能从 `listCommits()` 找到缺失 projection 并补齐              | ✅   |
| 3   | commit projection 和业务变更已同步                | 后台服务拉取提交                   | 收到完整 envelope；`parentIds`、sequence、fingerprint 和 revision 可验证 | ✅   |
| 4   | commit change 缺失、顺序错误或 fingerprint 不匹配 | 后台尝试应用                       | 提交进入 rejected/incomplete 状态，不写入部分配置，不得标记 applied      | ✅   |
| 5   | 完整提交且父节点和 revision 正确                  | 调用 `apply_media_config_commit`   | 配置表、审计记录和 commit 状态在一个数据库事务中一致更新                 | ✅   |
| 6   | 同一 `operationId` 或 `commitId` 重复推送         | 重试同步和应用请求                 | 不重复写配置、不重复写审计、不重复发布，返回第一次结果                   | ✅   |
| 7   | 两个分支修改同一配置                              | 合并或应用变更                     | 冲突按规则暴露；未经解决不能发布，原始双方变更仍可恢复                   | ✅   |
| 8   | 后台应用后管理员查看配置                          | 刷新列表、详情和提交记录           | 可见 branch、commit、同步、应用、发布或拒绝状态及操作者                  | ✅   |
| 9   | 分支元数据已同步但 commit projection 未到齐       | 后台执行同步                       | 分支存在但不会误认为完整提交历史已同步；系统等待或请求补偿               | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 当前实现证据

- 2026-11-21 九条 AC 均已完成本地验证；AC7 的本地分支、合并和发布边界证据见[配置同步交付记录](../../plans/config-sync-delivery-20261116.md)。公共目录发布链路仍未接通，因此故事继续保持 In Progress。
- 真实 RxDB 工作树集成：编辑被捕获，`commit()` 只发一次事件；进程在投影前退出后，补偿扫描补齐且不重复；父提交跳过系统基线（AC1、AC2）。
- 投影写入 RxDB 形状的新表：客户端只能写 prepared，变更到齐才能标记 synced；后台节点经查询缓存读取完整 envelope 并复核指纹，变更未到齐或仍为 prepared 时等待补偿（AC3、AC4、AC9）。
- 应用 RPC 在一个事务内写配置、审计与提交状态；同一 operationId 重放复用首次回执（AC5、AC6，真实本地 Supabase 集成与 SQL 包测试）。
- 应用后提交详情显示状态、操作者、分支、父提交与应用时间，刷新后保持（AC8，真实浏览器 e2e）。
- AC7：配置页现在能读取本地分支、创建并切换 feature 分支、预览合并并列出同字段覆盖冲突；工作树有未提交修改、恢复中或冲突时禁止切换和合并，有冲突时合并按钮保持禁用。原始双方提交继续保留在各自历史中，服务端以 revision CAS 拒绝冲突应用。
- 发布边界：只有 `main` 分支允许生成 commit projection 并执行应用，feature 分支提交只保留在本机；远端分支仍只开放 `main`。
- 2026-11-25 提示词模板接入独立发布动作。应用提交后，普通用户继续看到旧版；点击「发布模板到灵感页」后，用户刷新可读取新标题。已通过本地 Supabase 与 Playwright 验证，生产部署待验。

## 交付阶段

| 阶段 | 范围                                | 关闭条件   |
| ---- | ----------------------------------- | ---------- |
| A    | working-tree、分支和领域投影 schema | AC1–3 通过 |
| B    | 后台校验和原子应用 RPC              | AC4–6 通过 |
| C    | 冲突、发布、回滚和恢复              | AC7–9 通过 |

## 技术笔记

现有 [working-tree 插件](../../../../packages/rxdb-plugin-working-tree/README.md) 已提供 `status()`、`diff()`、`commit()`、`discard()`、`restore()`、`listCommits()`、`commitChanges()`、分支切换和合并能力；Supabase 同步已有 `syncBranches()`。但 RxDB 内部系统表不是普通业务同步范围，因此本故事采用领域级投影，而不是把内部提交图直接暴露给 Supabase。

推荐领域表：

- `media_config_commits`：提交身份、父提交、分支、操作者、fingerprint、状态和幂等信息；
- `media_config_commit_changes`：提交内的实体、操作、顺序、patch、inverse patch 和 fingerprint。

提交状态建议为 `prepared → synced → validated → applied → released`，异常状态为 `rejected`。projection 生成必须具备唯一 `commitId`、`operationId` 和补偿扫描；后台只能应用完整提交。

## 实现文件

- `packages/rxdb-plugin-working-tree/` — working-tree、分支和提交能力。
- `packages/rxdb-plugin-sync/` — 业务变更和分支同步。
- `aiao-media/infra/supabase/migrations/` — commit projection 表和原子应用 RPC。
- `aiao-media/apps/admin/src/app/admin-console.ts` — 当前配置管理入口，迁移目标。
- `aiao-media/apps/api/` — 后台同步与配置应用服务。

## References

- [架构评审](../../plans/supabase-first-architecture-review-20261115.md#72-rxdb-分支提交和后台同步)
- [MEDIA-US-306 后台服务 RxDB 双向同步](MEDIA-US-306-backend-rxdb-sync.md)
- [MEDIA-US-307 rxdb-model 驱动后台配置编辑](MEDIA-US-307-admin-rxdb-model.md)
- [需求约定](../../CONVENTIONS.md)
