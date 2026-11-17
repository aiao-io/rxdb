---
id: US-316
title: 导入远端提交：保留提交身份并快进分支头
status: Backlog
priority: High
epic: epic-014-commit-graph-remote-exchange
created: 2026-11-17
updated: 2026-11-17
tags: [collaboration, working-tree, commit-graph, remote, tri-framework]
---

# 用户故事：导入远端提交：保留提交身份并快进分支头

## 作为/我想要/以便

**作为** 基于 working-tree 构建团队协作的产品开发者
**我想要** 把服务端下发的提交（ChangeSet、作者、消息、父链、内容指纹）原样导入本地分支，并把分支头快进到最后一个导入的提交
**以便** 第二台设备上的分支拥有与服务端相同的提交身份，之后的本地提交以它为父继续，而不会把拉取到的变化记成自己的提交。

## 范围边界

### In Scope

- 新增导入入口：校验父链从当前分支头延续（或从空分支开始），逐个校验内容指纹，以新的受信写意图把 ChangeSet 应用到业务表；导入的变化不进工作树、不计为未提交单元；提交节点按原 ID、作者、消息写入；分支头按修订号比较交换推进。
- `CommitKind` 增加合并种类，导入的合并提交可以有多个父，第一父必须是当前分支头。
- 幂等：已存在且指纹一致的提交跳过；同 ID 不同内容拒绝。
- 导出侧沿用 `commits$` / `commitChanges()`；如缺少「某提交之后」的增量列举，一并补齐。
- Angular / React / Vue 绑定暴露同一入口。

### Out of Scope

- 推送协议、服务端与权威裁决（由使用方负责）。
- 三方合并与冲突裁决。
- 可写检出位上的导入（沿用 epic-006「只有主检出位同步」）。

## 验收标准

| #   | 前置条件                                 | 操作                         | 预期结果                                                                              | 状态 |
| --- | ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- | ---- |
| 1   | 空分支                                   | 导入一段远端提交链           | 提交 ID、父链、作者、消息与指纹和输入一致；业务表等于链末提交的数据；工作树保持 clean | ⬜   |
| 2   | 分支头为 X，工作树 clean                 | 导入以 X 为父的提交          | 分支头快进，`listCommits()` 的顺序与父链一致                                          | ⬜   |
| 3   | 工作树有未提交改动，或链首的父不是当前头 | 导入                         | 拒绝，且不写入任何提交或业务数据                                                      | ⬜   |
| 4   | 某个提交的指纹与内容不符                 | 导入                         | 整批拒绝，不写入                                                                      | ⬜   |
| 5   | 同一批提交再次导入                       | 导入                         | 幂等：不重复建提交、业务表不变；同 ID 不同内容拒绝                                    | ⬜   |
| 6   | 有两个父的合并提交                       | 导入                         | 以合并种类写入，第一父为当前头；`listCommits()`、`restore()` 与分支对比都能正确遍历   | ⬜   |
| 7   | 导入完成后本地继续编辑                   | `commit()`                   | 新提交以导入的头为父；`commitChanges()` 只含本地变化，作者为本次提交者                | ⬜   |
| 8   | 六个支持 working-tree 的适配器           | 运行导入一致性套件           | 结果一致                                                                              | ⬜   |
| 9   | 三端绑定                                 | 经 `useWorkingTree` 调用导入 | 三端 API 对称，类型与行为一致                                                         | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：尚无。

## 技术笔记

- 现状（2026-11-17 核对）：提交 ID 在本地生成，写路径的父提交只取当前 HEAD，`commit()` 不伪造远端作者；外部只有 `BranchMaterializationSource` 能物化数据，且只写一个无父的 `branch_baseline`，不带提交历史；远端同步拉下的变化以 `remote_sync` 来源进工作树。
- 新的受信写意图需要按 epic-006「受信调用点登记表」登记调用点，并更新意图枚举与漂移用例。
- 首个使用方 [ADMIN-US-221](../../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md) 的服务端提交协议已对齐 `CommitChangeSet` 形状（ADMIN-US-218 切片 C），提交 ID 同为 UUIDv7、指纹同为 SHA-256。

## 实现文件

尚未实施。预计涉及 `packages/rxdb-plugin-working-tree/src/commit/`、`src/working-tree/`、核心的受信写意图登记，以及三端绑定包。

## References

- [epic-014](../../epics/epic-014-commit-graph-remote-exchange.md)
- [epic-006](../../epics/epic-006-working-tree-commits.md)
- [Admin 协作后端收敛实施计划](../../../rxdb-admin-template/requirements/plans/collaboration-convergence-tasks.md)
