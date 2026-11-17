---
id: ADMIN-US-221
title: 团队任务草稿落在 RxDB 工作树
status: Backlog
priority: Medium
epic: ADMIN-EPIC-004
created: 2026-11-17
updated: 2026-11-17
tags: [admin, collaboration, working-tree, rxdb, model-driven]
dependsOn: [ADMIN-US-218]
capabilities: [rxdb:US-316, rxdb:US-317]
---

# 用户故事：团队任务草稿落在 RxDB 工作树

## 作为/我想要/以便

**作为** 团队编辑者与模板使用方
**我想要** 在团队任务中用与本机工作台相同的模型驱动列表和表单编辑数据，保存、提交、另存与恢复都沿用平台 working-tree
**以便** 换一套业务实体时不用修改协作代码，本机与团队两种模式的交互保持一致。

## 范围边界

### In Scope

- 每个「用户 × 团队 × 应用」一个团队库（sqlite-wasm IndexedDB + history + working-tree），关闭通用同步。
- 本地共享分支经导入镜像服务端共享引用；任务即从导入的共享提交建出的分支。
- 团队模式的编辑复用各应用的 `EntityList`；协作包保留团队、PR、审核、历史面板，删除自写的任务存储、编辑器与表单缓冲。
- 保存、同步、另存为新任务、版本恢复分别对应 RxDB 写入、`commit()` 加 `commitChanges()` 上传、`createBranchFromCommit()`、`restore()`。

### Out of Scope

- 平台的三方字段级合并与冲突裁决：合并继续由产品服务端执行，上移平台为后续候选。
- 用可写检出位让同一用户并行编辑多个任务。

### 前置的平台能力

以下能力是平台 epic-006 的非目标，已在根 requirements 以 [epic-014](../../../../requirements/epics/epic-014-commit-graph-remote-exchange.md) 立项（2026-11-17），完成后本故事才能开始：

1. 导入远端提交：保留提交 ID、父链、原作者与内容指纹，并把分支头快进到外部提交；合并类（多父）提交可以导入——[US-316](../../../../requirements/stories/collaboration/US-316-remote-commit-import.md)。
2. `discard()` / `restore()` 同步回写业务表，放弃的编辑不再被查询读到——[US-317](../../../../requirements/stories/collaboration/US-317-discard-restore-projection.md)。

## 验收标准

| #   | 前置条件                      | 操作                                 | 预期结果                                                                                    | 状态 |
| --- | ----------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- | ---- |
| 1   | 用户在设备 A 提交并同步了任务 | 在设备 B 打开同一任务                | 设备 B 本地分支的提交 ID、父链与原作者和服务端一致，不记为拉取者的提交（ADMIN-US-206 AC#2） | ⬜   |
| 2   | 团队任务已打开                | 用实体列表新增、编辑、删除跨实体记录 | 改动进入任务工作树，界面区分未保存、已保存与已提交（ADMIN-US-205 AC#3～5）                  | ⬜   |
| 3   | 任务有已保存未提交的改动      | 放弃草稿                             | 列表与表单立即回到任务头的数据，不残留已放弃的编辑                                          | ⬜   |
| 4   | 应用改用另一套业务实体        | 在团队模式编辑、同步并发起 PR        | 不修改协作包代码即可工作，编辑界面由实体元数据生成                                          | ⬜   |
| 5   | 选择一个历史版本              | 恢复并同步                           | 形成新的未提交改动，不移动共享头、不删除历史（ADMIN-US-213）                                | ⬜   |
| 6   | 三端运行同一任务场景          | 创建、编辑、保存、同步、另存与恢复   | 三端行为一致；ADMIN-US-205、206、213 的 AC 在新实现上回归通过                               | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：尚无。

## 技术笔记

结合评估、可复用能力、平台缺口与「为什么不现在就切」见 [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md) 第 5 节。[ADMIN-US-218](ADMIN-US-218-delta-commits-bounded-cost.md) 先把提交协议切换为与 `CommitChangeSet` 同形的 ChangeSet，因此本故事只改客户端，服务端与已存数据不变。`enable()` 是库级且不可逆的开关，团队库必须与匿名工作台分库。

## 实现文件

尚未实施。预计涉及三端应用的实体页与 RxDB 装配、`rxdb-admin-template/packages/collaboration/src/client/`（删除 `local.ts`、`editor.ts`、`form-drafts.ts`，改造 `controller.ts` 与 `mount.ts`）。

## References

- [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md)
- [平台 working-tree 插件](../../../../packages/rxdb-plugin-working-tree/README.md)
- [平台 epic-006](../../../../requirements/epics/epic-006-working-tree-commits.md)
- [ADMIN-EPIC-004](../../epics/ADMIN-EPIC-004.md)
