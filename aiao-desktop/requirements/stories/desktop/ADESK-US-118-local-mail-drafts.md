---
id: ADESK-US-118
title: 本地邮件草稿保存与失败保护
status: Done
priority: High
epic: ADESK-EPIC-002
created: 2026-11-17
updated: 2026-11-17
tags: [desktop, mail, data]
dependsOn: [ADESK-US-102, ADESK-US-109, ADESK-US-114]
capabilities: []
---

# 本地邮件草稿保存与失败保护

作为写本地邮件草稿的用户，我希望保存失败、隐藏面板或关闭窗口时不会丢失输入，并明确知道当前没有邮件传输服务。

## 范围边界

### In Scope

- 新邮件写入 Drafts，实际保存后才提示成功；不再写入 Sent 并声称已发送，历史 Sent 数据保留并标为本地存档。
- 收件人、主题、纯文本正文保留在独立于弹出面板的草稿模型中；Escape、点外面和隐藏面板后可恢复；明确丢弃才清空未保存输入。
- 稳定 ID 保存和重试，保存中禁止编辑与丢弃；Mail 关闭、退出及重启等待写入，有未保存草稿则阻止关闭；刷新前提示。
- 已保存草稿可重新编辑；事务内核对正文、主题和收件人，拒绝覆盖外部修改或已删除记录，支持保存副本。
- 当前邮箱关键词搜索、真实统计及标旗失败反馈；本地范围说明不伪装收发邮件能力。
- 回复、转发以及 Preview/Photos 的本地草稿入口保留对应文本或图片地址，明确无文件附件发送。

### Out of Scope

- 邮箱账号、SMTP/IMAP/API 传输、远程附件与真实投递确认；不能把本地保存算作远程邮件功能已开发。
- 尚未保存的草稿在浏览器强制终止后的恢复；schema 不变；物理键盘和 VoiceOver 需人工验收。

## 验收标准

| #   | 前置条件           | 操作                                   | 预期结果                                                  | 状态 |
| --- | ------------------ | -------------------------------------- | --------------------------------------------------------- | ---- |
| 1   | 新草稿             | 输入、保存并刷新重开                   | 真实 Drafts 中仅一份完整记录，界面不声称已发送            | ✅   |
| 2   | 未保存草稿         | 隐藏、Esc、点击面板外或请求新草稿      | 原字段不丢失，恢复入口可达，新草稿不覆盖旧输入            | ✅   |
| 3   | 存储失败或写入等待 | 保存、重试、关闭或重启                 | 稳定 ID、原文保留；在途等待，失败取消关闭；明确丢弃才清空 | ✅   |
| 4   | 已保存草稿         | 编辑、外部修改或删除后再保存           | 正常修改保留 ID，冲突不覆盖对方记录，副本可恢复输入       | ✅   |
| 5   | 邮箱和分享入口     | 搜索、标旗失败恢复、回复/转发/内容草稿 | 搜索匹配实际数据，失败不伪造成功，草稿内容对应选择对象    | ✅   |
| 6   | 正式构建           | 键盘、axe、真实存储失败与关联回归      | 主要路径通过，证据归档，不替代人工体验                    | ✅   |

## 验收证据

2026-11-17 本地正式构建自动验收完成，未提交、未发布，schema `2026111703` 不变；完整日志、环境与迭代失败见[证据](../../evidence/2026-11-17/README.md#a06-本地邮件草稿us-118)。

- AC#1：`localScope`、`retrySavesOneLocalDraft`、`persistedDraftEditable` 校验真实 Drafts 行、稳定 ID、全部字段和换行，Sent 行数不增加，刷新后可继续编辑。
- AC#2：`hiddenAndReplacedPanelKeepsDraft` 覆盖隐藏、Esc、打开菜单替换面板、新建请求不覆盖旧输入。
- AC#3：`failedSaveKeepsFields`、`closeAndRestartKeepDraft`、`pendingSaveBlocksClose`、`beforeUnloadGuard` 使用真实 SQLite INSERT 拒绝和真实写锁；输入保留、关闭等待，失败草稿取消关闭。合成 beforeunload 仅检查事件保护。
- AC#4：`conflictAndCopyRecovery` 使用两个实际页面编辑同一草稿，拒绝覆盖远端保存；副本 INSERT 失败后重试只写一条。`deletedDraftRetained` 验证已删除原记录不被重建覆盖，明确丢弃才清空。
- AC#5：`searchAndFlagFailure`、`replyAndForwardContent`、`sharedContentDrafts` 校验往来人/主题/正文搜索、标旗真实 UPDATE 失败与恢复、实际回复/转发文本以及 Preview 文件名和 Photos 对应图片地址。
- AC#6：`keyboardRecovery`、`noViolations`、定向模型与原覆盖率门槛、lint/typecheck 通过；五组其他关联回归和最终复制打印回归全绿。失败界面截图已目视核查。

真实邮件收发、账号和附件传输仍未接入；历史 Sent 保留且标为本地存档。软件键盘和 axe 不替代物理输入或 VoiceOver。
