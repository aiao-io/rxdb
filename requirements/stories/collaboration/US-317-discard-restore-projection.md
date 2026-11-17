---
id: US-317
title: 放弃与恢复回写业务表
status: Backlog
priority: High
epic: epic-014-commit-graph-remote-exchange
created: 2026-11-17
updated: 2026-11-17
tags: [collaboration, working-tree, trusted-write, tri-framework]
---

# 用户故事：放弃与恢复回写业务表

## 作为/我想要/以便

**作为** 用 working-tree 承载「草稿」的产品开发者
**我想要** `discard()` 之后业务表回到 HEAD 的数据，`restore()` 之后业务表呈现所选历史内容（作为未提交改动）
**以便** 列表与表单读到的数据始终与工作树状态一致，「放弃草稿」不会残留已放弃的编辑。

## 范围边界

### In Scope

- 新增受信写意图并登记调用点：`discard()` 用工作树条目的 inversePatch 把业务行回写到 HEAD；`restore()` 把所选提交的内容写入业务表，差异计为未提交改动。
- 回写与修订号比较交换、条目清理在同一事务内完成。
- 更新受信写漂移用例、一致性套件与文档，写明相对 v1 的语义变化。

### Out of Scope

- 选择性丢弃部分单元：沿用 v1 只能整棵工作树丢弃的硬裁决。
- 改写提交历史：discard / restore 都不移动 HEAD、不删历史。

## 验收标准

| #   | 前置条件                                 | 操作                      | 预期结果                                                            | 状态 |
| --- | ---------------------------------------- | ------------------------- | ------------------------------------------------------------------- | ---- |
| 1   | 工作树有跨实体的插入、修改与删除         | `discard()`               | 业务表逐行等于 HEAD；工作树 clean；修订号规则与 v1 一致             | ⬜   |
| 2   | 工作树 clean                             | `discard()`               | 仍为 no-op：不写库、修订号不涨                                      | ⬜   |
| 3   | 选择一个可达的历史提交                   | `restore()`               | 业务表等于该提交的数据，这些差异计为未提交改动；HEAD 不动、历史不删 | ⬜   |
| 4   | 回写中途注入失败                         | `discard()` / `restore()` | 业务表、工作树条目与修订号都保持操作前状态                          | ⬜   |
| 5   | 受信写入口                               | 运行漂移用例              | 新意图与调用点已登记；未登记的调用点仍被拒绝                        | ⬜   |
| 6   | 六个支持 working-tree 的适配器与三端绑定 | 运行一致性套件            | 结果一致，三端 API 不变                                             | ⬜   |
| 7   | 依赖 v1 语义的现有调用方                 | 升级                      | 文档与发布说明写明 discard / restore 的语义变化及迁移方式           | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：尚无。

## 技术笔记

- 现状（2026-11-17 核对）：`packages/rxdb-plugin-working-tree/src/working-tree/discard-command.ts` 注明 v1 的 discard 只回滚逻辑工作树，投影重写只能经 `mergeChanges` / `switchBranch` 两个已登记的原语；跨这条线需要连同 epic-006「受信调用点登记表」、登记表、意图枚举与漂移用例一起显式修改。`restore()` 目前只写条目与会话行。
- 首个使用方是 [ADMIN-US-221](../../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md) 的「放弃草稿」。

## 实现文件

尚未实施。预计涉及 `packages/rxdb-plugin-working-tree/src/working-tree/`（discard 与 restore 命令）、核心受信写登记与漂移用例。

## References

- [epic-014](../../epics/epic-014-commit-graph-remote-exchange.md)
- [epic-006](../../epics/epic-006-working-tree-commits.md)
