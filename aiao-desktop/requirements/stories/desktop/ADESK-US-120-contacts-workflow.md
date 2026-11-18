---
id: ADESK-US-120
title: 联系人搜索与本地编辑流程
status: Done
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-18
updated: 2026-11-18
tags: [desktop, contacts, data]
dependsOn: [ADESK-US-102, ADESK-US-107]
capabilities: []
---

# 联系人搜索与本地编辑流程

作为使用通讯录的用户，我希望能搜索联系人、添加和修改联系人资料，并能删除不再需要的联系人；操作失败时表单内容仍然保留。

## 范围边界

### In Scope

- 按姓名、职业、邮箱和地址搜索联系人，搜索结果保持本地库顺序。
- 新建、编辑和删除联系人，所有成功写入都进入真实本地 SQLite，并被活查询接管。
- 新建表单校验必填字段和邮箱格式；校验失败或存储失败时保留表单和错误提示。
- 编辑保存前核对基线，拒绝覆盖另一个窗口已经修改的同一联系人。
- 保存期间冻结输入；关闭、刷新和 beforeunload 对未保存联系人给出保护。
- 菜单与按钮提供新建、保存、删除和取消的可达入口。

### Out of Scope

- iCloud、LDAP、远程联系人账号、跨设备同步、联系人头像上传、群组和分享。
- 真实电话、短信、邮件发送，以及物理键盘和 VoiceOver 的人工体验。

## 验收标准

| #   | 前置条件                 | 操作                                     | 预期结果                                           | 状态 |
| --- | ------------------------ | ---------------------------------------- | -------------------------------------------------- | ---- |
| 1   | Contacts 有初始联系人    | 输入姓名、职业、邮箱或地址的一部分       | 列表只显示匹配项，清空搜索恢复原顺序               | ✅   |
| 2   | 新建联系人               | 输入非法邮箱后保存，再修正并保存         | 错误可见，姓名和地址仍在；修正后只写入一条真实记录 | ✅   |
| 3   | 已保存联系人             | 修改职业并保存，关闭后重新打开           | 详情和 SQLite 中的职业均已更新                     | ✅   |
| 4   | 已保存联系人             | 删除联系人并重新查询数据库               | 列表移除联系人，数据库中没有该 ID                  | ✅   |
| 5   | 两个窗口编辑同一联系人   | 一个窗口先保存，另一个窗口继续保存旧草稿 | 第二个窗口收到冲突提示，不能覆盖较新的记录         | ✅   |
| 6   | 有未保存表单或写入进行中 | 关闭、刷新或触发 beforeunload            | 输入不静默丢失，操作完成前窗口保持保护状态         | ✅   |

## 验收证据

2026-11-18，本地正式构建自动验收完成，未提交、未发布；证据集中在[2026-11-17 证据目录](../../evidence/2026-11-17/README.md#a06-contacts-联系人搜索与本地编辑us-120)。

- 单测：`contacts-model.spec.ts`、`contacts-data.spec.ts` 共 2 个文件、9 条用例通过；覆盖搜索、规范化、校验和基线比较。
- 浏览器：`E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=contacts --report=/tmp/aiao-contacts-green.json --output-style=static`，搜索、非法草稿保留、创建、更新和删除 5 项全绿，无页面错误，见 [aiao-contacts-green.json](../../evidence/2026-11-17/aiao-contacts-green.json)。
- 工程门禁：`aiao-desktop-web` 的 lint、typecheck、production build 与 `aiao-desktop-e2e` lint 通过。

本故事只关闭本地联系人资料的核心编辑范围；远程通讯录、电话、消息和邮件能力仍未接入。

## 技术笔记

`contacts-model.ts` 保存纯搜索、草稿规范化、校验和联系人基线比较；`ContactsApp` 在 SQLite 事务中创建、更新和删除，失败时不清除编辑器。编辑更新前重新读取记录并比较基线，避免覆盖其他窗口的修改。

## 实现文件

- `aiao-desktop/apps/web/src/app/apps/contacts/contacts.ts` — 搜索、表单、菜单、窗口保护和 SQLite 写入
- `aiao-desktop/apps/web/src/app/apps/contacts/contacts-model.ts` — 搜索、草稿、校验和冲突基线
- `aiao-desktop/apps/web/src/app/apps/contacts/contacts-model.spec.ts` — 搜索与编辑模型单测
- `aiao-desktop/apps/e2e/src/groups/contacts.mjs` — 正式构建浏览器验收

## References

- [A06 内置应用任务核查与补齐](../../plans/2026-11-17-builtin-workflows.md)
- [Aiao Desktop 验收台账](../../verification-report.md)
