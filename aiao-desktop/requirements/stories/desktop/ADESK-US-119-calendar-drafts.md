---
id: ADESK-US-119
title: 日历事件草稿与失败保护
status: Done
priority: High
epic: ADESK-EPIC-002
created: 2026-11-18
updated: 2026-11-18
tags: [desktop, calendar, data]
dependsOn: [ADESK-US-102, ADESK-US-109, ADESK-US-114]
capabilities: []
---

# 日历事件草稿与失败保护

作为使用日历记录事件的用户，我希望日期和时间输入严格校验，保存失败或并发修改时保留我的内容，并能安全重试、另存副本或放弃修改。

## 范围边界

### In Scope

- 严格拒绝不存在的日期和非法时间，不把无效输入静默替换成另一组值。
- 新建和编辑使用独立编辑缓冲与稳定事件 ID；真实写入成功前不清除输入。
- 创建、更新、删除失败时显示局部错误，保留字段和事件；重试只产生一条正确记录。
- 保存中冻结输入、删除、放弃和替换操作；隐藏、关闭和重启等待在途写入，未保存内容可继续恢复。
- 事务内核对日历和事件基线，拒绝覆盖其他窗口的修改或已删除记录；支持 Save a Copy 恢复本地内容。
- 键盘操作、事件刷新持久化和编辑器无障碍名称进入正式构建验证。

### Out of Scope

- 远程日历账号、邀请、同步、通知、共享日历和系统 Calendar 桌面应用集成。
- 真实网络服务、浏览器强制终止后的内存恢复、物理键盘和 VoiceOver 体验；这些能力按现有人工验收边界单独记录。

## 验收标准

| #   | 前置条件                 | 操作                                                  | 预期结果                                                           | 状态 |
| --- | ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------ | ---- |
| 1   | 新建事件                 | 输入 `2026-02-30`、非法开始/结束时间并提交            | 字段级错误可见，原始输入保留，事件不写入                           | ✅   |
| 2   | 新建或编辑事件           | 注入真实 SQLite 写入失败后保存并重试                  | 局部失败反馈不泄露 SQL，全部字段保留；恢复后稳定 ID 只写入一条事件 | ✅   |
| 3   | 保存进行中或有未保存内容 | 输入、关闭、隐藏、重启或触发 beforeunload             | 在途操作不可被替换或丢弃；关闭等待完成，失败时继续保留编辑器和内容 | ✅   |
| 4   | 已保存事件               | 在另一窗口修改或删除后，本窗口继续保存、删除          | 检测并发冲突或缺失记录，不覆盖对方数据；失败时事件和修改仍可恢复   | ✅   |
| 5   | 冲突编辑器               | 选择 Save a Copy                                      | 使用新稳定 ID 保存当前输入，原记录保持不变，副本可再次编辑         | ✅   |
| 6   | 正式构建                 | 使用键盘完成新建、保存、刷新重开并运行 axe 与关联回归 | 新事件真实持久化，编辑器对话框有无障碍名称，页面无错误和 axe 违规  | ✅   |

## 验收证据

2026-11-18 本地正式构建自动验收完成，未发布；证据集中在[2026-11-17 证据目录](../../evidence/2026-11-17/README.md#a06-calendar-事件草稿与失败保护us-119)。

- AC#1～AC#5：`calendarDrafts.invalidInputIsRejected`、`failedCreateKeepsFields`、`retryCreatesOneEvent`、`pendingSaveBlocksClose`、`failedUpdateKeepsFields`、`conflictAndCopyRecovery`、`failedDeleteKeepsEvent` 和 `beforeUnloadGuard` 均通过。
- AC#6：`calendarDrafts.keyboardAndPersistence` 与 `noViolations` 通过；关联的 `persistence`、`apps`、`a11y`、`shell-interaction`、`document-workflow` 五组回归通过，所有组无页面错误。
- 单测：`calendar-draft.spec.ts`、`calendar-input.spec.ts`、`calendar-records.spec.ts`、`calendar-store.spec.ts` 共 4 个文件、73 条用例通过，见 [calendar-unit-green.txt](../../evidence/2026-11-17/calendar-unit-green.txt)。
- 浏览器证据：[aiao-calendar-drafts-green.json](../../evidence/2026-11-17/aiao-calendar-drafts-green.json)、[aiao-calendar-final.json](../../evidence/2026-11-17/aiao-calendar-final.json)；失败状态截图已目视检查，见 [aiao-calendar-failure.png](../../evidence/2026-11-17/aiao-calendar-failure.png)。

远程日历、账号、邀请和系统 Calendar 集成仍未接入；本故事只关闭本地事件编辑和失败保护范围。

## 技术笔记

`CalendarDraftEditor` 持有独立缓冲、稳定 ID、保存序列和基线快照；`CalendarStore.saveEditor` 在同一事务内核对日历、事件与基线，区分冲突、缺失和普通存储失败。编辑器将错误映射为用户可读提示，保持输入直到显式放弃或成功完成操作。

## 实现文件

- `aiao-desktop/apps/web/src/app/apps/calendar/calendar-draft.ts` — 编辑缓冲、校验、保存状态与失败恢复
- `aiao-desktop/apps/web/src/app/apps/calendar/calendar-event-editor.ts` — 编辑器、键盘路径和局部反馈
- `aiao-desktop/apps/web/src/app/apps/calendar/calendar.html` — 日历视图与新建入口
- `aiao-desktop/apps/web/src/app/apps/calendar/calendar-model.ts` — 严格日期和时间解析
- `aiao-desktop/apps/web/src/app/apps/calendar/calendar.ts` — 窗口关闭、隐藏和事件入口
- `aiao-desktop/apps/web/src/app/services/calendar-store.ts` — 事务写入、冲突和删除保护
- `aiao-desktop/apps/web/src/app/services/calendar-records.ts` — 记录字段和错误映射
- `aiao-desktop/apps/e2e/src/groups/calendar-drafts.mjs` — 正式构建浏览器验收

## References

- [A06 内置应用任务核查与补齐](../../plans/2026-11-17-builtin-workflows.md)
- [Aiao Desktop 验收台账](../../verification-report.md)
