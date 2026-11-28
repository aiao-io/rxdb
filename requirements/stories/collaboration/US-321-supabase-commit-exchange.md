---
id: US-321
title: Supabase 上的提交图远端交换：服务端存提交与引用，按预期头上传、分页下载，跨设备保留提交身份
status: Backlog
priority: Medium
epic: epic-017-pr-only-team-data
created: 2026-11-28
updated: 2026-11-28
tags: [collaboration, working-tree, supabase, commit-graph]
---

# 用户故事：Supabase 上的提交图远端交换

## 作为/我想要/以便

**作为** 想让团队成员在多台设备上续作同一份草稿的应用开发者
**我想要** 平台提供提交图的服务端一半：提交与引用存在 Supabase，上传时校验父链、作者与内容指纹并按预期头比较交换，下载按页返回某个提交之后的提交
**以便** 第二台设备拿到的是原提交（ID、父链、作者、指纹都不变）；另一台设备先推进时上传被拒、可以另存为新分支；而不必每个应用自写一套服务端

## 解锁条件

价值待证（[epic-017](../../epics/epic-017-pr-only-team-data.md#价值待证)）。出现以下任一信号即可提请解锁：

- Admin 之外的第二个应用需要跨设备续作草稿，并且要保留提交身份；
- owner 决定把 Admin 协作包的服务端迁到平台（先定 epic-017「待冻结的决策」第 1 条）。

## 现状

1. **本地一半已交付。** epic-014 的 [US-319](US-319-remote-commit-import.md) 原样导入远端提交并快进分支头（含多父合并提交），`exportCommits()` 按交换记录形态导出；推送协议与服务端是 epic-014 的非目标。
2. **服务端只在 Admin 协作包里。** 上传校验在 Admin 的 `acceptChain()`（[`tasks.ts`](../../../rxdb-admin-template/packages/collaboration/src/server/tasks.ts)）：只收普通提交、父链连续、作者等于调用者、schema 版本一致、变更能应用到父内容；预期头不符返回 `diverged`，客户端另存为新任务。提交、提交变更与引用落在 `admin_private`，下载经只读函数 `admin_commit_exchange` 分页。
3. **日志同步给不了这些。** `rxdb_change` 按行记最终变化，拉取方把它落成本地写入；Admin 协作契约 C02 写明「不能将拉取到的实体变化重新记成拉取者的原始提交」。

## 范围边界

### In Scope

- 参考 SQL：提交、提交变更、引用三张表，按分区（如团队 × 应用）隔离，客户端只经 RLS 只读投影读取；引用按预期头比较交换推进。
- 上传：一批提交（父先于子）连同预期远端头；服务端校验父链从预期头延续、作者等于真实会话、内容指纹按规范化变更集重算一致；同一操作重试返回原回执；预期头不符返回当前头。
- 下载：某个已知提交之后的提交，按页、父先于子，交换记录形态与 `importCommits()` 直接对接；不受 PostgREST `max-rows` 截断。
- 分叉：上传被拒之后，客户端按 `createBranchFromCommit()` 另存为新分支，以新的操作 ID 上传。
- 客户端入口：上传与下载接在适配器或 working-tree 侧，会话与身份取自 [US-237](../adapter/US-237-supabase-session-layer.md) 的会话层。

### Out of Scope

- 数据 PR、候选、审核与合并（[US-322](US-322-pr-only-write-mode.md)）。
- 同一分支多人同时推进时的自动合并（Admin C03 首版同样不做）。
- 提交历史的保留与归档。

## 验收标准

| #   | 前置条件                                   | 操作                    | 预期结果                                                          | 状态 |
| --- | ------------------------------------------ | ----------------------- | ----------------------------------------------------------------- | ---- |
| 1   | 设备 A 在任务分支上提交两次并上传          | 设备 B 下载并导入       | B 上的提交 ID、父链、作者与指纹和 A 相同；B 的分支头快进到 A 的头 | ⬜   |
| 2   | 一批提交因超时重试                         | 以同一操作 ID 再上传    | 返回原回执，不重复建提交；同一 ID 配不同内容被拒                  | ⬜   |
| 3   | 设备 B 先推进了同一任务                    | 设备 A 以旧的预期头上传 | 被拒并返回当前头；A 另存为新分支后上传成功，原提交身份保留        | ⬜   |
| 4   | 提交作者不是当前会话用户，或指纹与内容不符 | 上传                    | 被拒，服务端没有任何写入                                          | ⬜   |
| 5   | 分支上的提交超过一页                       | 下载                    | 按页取完、父先于子，结果与一次性导出一致                          | ⬜   |
| 6   | 调用者不属于该分区                         | 上传或下载              | 被拒或读到空，不泄露提交内容                                      | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：随实现补齐。

## 技术笔记

- Admin 的实现与证据是现成的参照：上传成本与历史长度无关（ADMIN-US-218 切片 C、D），读取函数不受 `max-rows` 截断（ADMIN-US-219）。
- 回执保留期（Admin 为 30 天）与超期之后的处理，随 epic-017 待冻结的决策 1 一起定。

## References

- [epic-014 提交图远端交换与草稿回写](../../epics/epic-014-commit-graph-remote-exchange.md)
- [US-319 导入远端提交](US-319-remote-commit-import.md)
- [Admin 协作契约 C02、C03](../../../rxdb-admin-template/requirements/collaboration-contract.md)
- [ADMIN-US-218 差量提交与有界命令成本](../../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-218-delta-commits-bounded-cost.md)
