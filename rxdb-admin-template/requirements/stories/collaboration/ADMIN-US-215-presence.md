---
id: ADMIN-US-215
title: 在线成员与当前查看状态
status: In Review
priority: Low
epic: ADMIN-EPIC-003
created: 2026-11-16
updated: 2026-11-16
tags: [admin, data-pr, presence, realtime, future]
dependsOn: [ADMIN-US-204, ADMIN-US-207]
capabilities: []
---

# 用户故事：在线成员与当前查看状态

## 作为/我想要/以便

**作为** 团队协作者
**我想要** 看到谁在线、谁正在查看同一个 PR 或记录
**以便** 减少重复修改和相互等待，并在提交前主动沟通。

## 范围边界

### In Scope

- 在当前团队和 PR 范围内显示在线成员及最近心跳状态。
- 显示成员正在查看的 PR、提交、实体记录或字段上下文。
- Presence 只用于协作提示，不授予任何查看、编辑、审核或合并权限。
- 网络中断、切换团队和退出登录时及时清理或过期状态。

### Out of Scope

- 实时光标、字段锁、强制独占编辑和自动分配任务。
- 保存成员完整浏览历史或向其他团队暴露在线信息。

## 验收标准

| #   | 前置条件                         | 操作                             | 预期结果                                                      | 状态 |
| --- | -------------------------------- | -------------------------------- | ------------------------------------------------------------- | ---- |
| 1   | 多名成员登录同一团队并打开 PR    | 查看协作状态                     | 显示在线成员及其允许展示的 PR/记录上下文，且只对当前团队可见  | ✅   |
| 2   | 成员切换 PR、记录或团队          | 等待状态同步                     | 当前查看上下文更新；旧团队或旧 PR 不继续显示过期位置          | ✅   |
| 3   | 成员关闭页面、退出或网络中断     | 查看在线列表                     | 心跳超时后标记离线或移除，不把离线成员当作实时在线            | ✅   |
| 4   | 访客或无权限用户访问对应 PR      | 查看 Presence 频道               | 服务端不返回未授权团队、PR 或记录的成员状态                   | ✅   |
| 5   | 任意用户看到其他成员在线         | 尝试根据 Presence 发起合并或编辑 | Presence 不改变操作授权；实际操作仍按服务端权限和当前版本检查 | ✅   |
| 6   | Angular、React、Vue 使用同一团队 | 查看在线和当前查看状态           | 展示字段、超时语义和权限边界一致                              | ✅   |

验收证据：engine 验证同会话切换 PR/记录更新位置、45 秒过期、移除成员消失和无权访问拒绝；三端顺序审批场景验证实际在线成员，双团队场景验证旧团队在线信息不进入新团队；权限矩阵验证 Presence 不授予编辑或合并权限。 详见 [协作实现与验收记录](../../plans/collaboration-implementation.md)。✅ 表示已有本地验收证据；⚠️ 表示仍缺外部环境证据，均不等同于故事已合入或已部署。

## 技术笔记

Presence 数据应使用短生命周期 Realtime channel 或等价临时存储，不进入业务数据历史和审计。客户端发送的当前查看位置只作为提示，服务端必须按团队和 PR 可见范围过滤广播。

## 实现文件

本故事的产品实现位于私有包 `rxdb-admin-template/packages/collaboration/`，三端通过 `/collaboration` 路由接入同一共享 UI。具体入口：`rxdb-admin-template/packages/collaboration/src/server/discussion.ts`、`src/client/mount.ts`、`src/client/pr-view.ts`。

验收记录与未关闭边界见 [协作实现与验收记录](../../plans/collaboration-implementation.md)。故事保持 `In Review`，不把本地实现或测试结果直接等同于已合入、已部署的 `Done`。

## References

- [ADMIN-US-204](ADMIN-US-204-local-context-explicit-import.md)
- [ADMIN-US-207](ADMIN-US-207-data-pr-lifecycle.md)
- [团队操作权限与服务端隔离](ADMIN-US-203-permission-server-isolation.md)
- [ADMIN-EPIC-003](../../epics/ADMIN-EPIC-003.md)
