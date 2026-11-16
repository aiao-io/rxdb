---
id: ADMIN-US-214
title: 评论通知与增强讨论协作
status: In Review
priority: Low
epic: ADMIN-EPIC-003
created: 2026-11-16
updated: 2026-11-16
tags: [admin, data-pr, comments, notification, future]
dependsOn: [ADMIN-US-208]
capabilities: []
---

# 用户故事：评论通知与增强讨论协作

## 作为/我想要/以便

**作为** PR 参与者
**我想要** 被提及、订阅或被分配的讨论及时提醒，并能筛选需要我处理的线程
**以便** 在多人协作时不会漏掉数据问题。

## 范围边界

### In Scope

- 支持评论中提及成员、订阅 PR 或线程、未读状态和站内通知。
- 支持按未处理、必须处理、我参与和当前版本筛选讨论。
- 通知携带团队、PR、记录、字段和提交版本上下文，并遵守权限隔离。
- 作为基础评论故事的后续增强，首版没有通知时仍不改变评论和合并规则。

### Out of Scope

- 邮件、短信、企业 IM 推送、复杂富文本编辑器和跨产品通知中心。
- 通过通知授予评论、审核或合并权限。

## 验收标准

| #   | 前置条件                             | 操作                 | 预期结果                                                       | 状态 |
| --- | ------------------------------------ | -------------------- | -------------------------------------------------------------- | ---- |
| 1   | 用户被评论提及或订阅 PR              | 产生新评论或审核结果 | 生成当前团队范围内的未读通知，并能跳转到正确 PR、字段和版本    | ⬜   |
| 2   | 用户打开通知或对应线程               | 查看未读状态         | 只将当前用户相关通知标记为已读；其他成员和其他团队状态不受影响 | ⬜   |
| 3   | PR 有多个线程和版本                  | 使用筛选器           | 能按必须处理、未处理、我参与和当前版本筛选，结果不改变线程历史 | ⬜   |
| 4   | 用户无权访问原 PR 或团队             | 通过通知链接打开     | 服务端拒绝读取并不泄露标题、记录值或评论内容                   | ⬜   |
| 5   | Angular、React、Vue 使用同一通知数据 | 查看通知和跳转       | 未读计数、上下文和跳转语义一致                                 | ⬜   |

验收证据：后续实现时补充通知权限、版本跳转、未读同步和筛选的三端用例。

## 技术笔记

通知是派生的协作体验，不应改变 PR 的授权和合并判定。通知目标必须保存版本上下文；旧版本评论产生的通知打开后应明确显示历史版本，而不是把用户带到不相关的新字段。

## 实现文件

本故事的产品实现位于私有包 `rxdb-admin-template/packages/collaboration/`，三端通过 `/collaboration` 路由接入同一共享 UI。具体入口：`rxdb-admin-template/packages/collaboration/src/server/discussion.ts`、`src/client/mount.ts`、`src/client/pr-view.ts`。

验收记录与未关闭边界见 [协作实现与验收记录](../../plans/collaboration-implementation.md)。故事保持 `In Review`，不把本地实现或测试结果直接等同于已合入、已部署的 `Done`。

## References

- [ADMIN-US-208](ADMIN-US-208-data-pr-discussion-comments.md)
- [ADMIN-US-209](ADMIN-US-209-review-approval.md)
- [ADMIN-EPIC-003](../../epics/ADMIN-EPIC-003.md)
