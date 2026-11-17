---
id: ADESK-US-122
title: 提醒事项列表筛选与动态统计
status: Done
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-18
updated: 2026-11-18
tags: [desktop, reminders, data]
dependsOn: [ADESK-US-115, ADESK-US-106]
capabilities: []
---

# 提醒事项列表筛选与动态统计

作为整理提醒事项的用户，我希望 Today、Scheduled、All、Flagged 和 Completed 侧栏真正筛选本地记录，数量随数据变化，而不是看到固定的演示数字。

## 范围边界

### In Scope

- 侧栏五个列表可切换，标题和提醒行跟随当前列表更新。
- Today、Scheduled、All、Flagged、Completed 的数量从本地 SQLite 活查询计算；Today 数量只统计未完成项目，Today 列表保留当天已完成项目。
- 提醒新增 `flagged` 字段，旧库通过 schema `2026111801` 迁移并默认未标旗；新建库按种子写入初始标旗状态。
- 普通提醒可通过行内可达控件 Flag/Unflag，成功状态写回真实 SQLite，失败保留错误反馈和当前数据。
- 新建提醒草稿仍固定归入 Today；即使在编辑草稿时勾选完成，草稿不会因为筛选而从编辑器消失。

### Out of Scope

- 远程提醒服务、账号、跨设备同步和自然语言日期解析。
- 自定义列表、重复提醒、通知调度和系统提醒事项集成。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 初始提醒数据 | 打开 Today、Scheduled、All、Completed | 五个列表按本地记录筛选，数量分别为 3、2、5、2 | ✅ |
| 2 | 初始提醒数据 | 打开 Flagged | 显示两条种子标旗提醒，数量为 2 | ✅ |
| 3 | 未标旗提醒 | Flag 后再 Unflag | `flagged` 在真实 SQLite 中依次变为 `1`、`0`，侧栏数量同步变化 | ✅ |
| 4 | 新建提醒草稿 | 输入标题、勾选完成、保存失败后重试 | 草稿和错误仍可见，成功后 Today 列表仍显示当天完成项 | ✅ |
| 5 | 旧本地库 | 从 `2026111703` 升级到当前版本 | `desktop$reminder.flagged` 自动补列，已有提醒数据不丢失 | ✅ |
| 6 | 本地正式构建 | 单测、lint、typecheck、生产构建和浏览器回归 | 主要路径通过并有原始报告，不替代人工 VoiceOver 验收 | ✅ |

## 验收证据

2026-11-18 本地正式构建自动验收完成，未提交、未发布。`reminder-filters` 在生产构建上验证五个列表的动态统计、筛选及 Flag/Unflag 真实 SQLite 持久化，报告见[证据](../../evidence/2026-11-17/aiao-reminder-filters-green.json)。

- Reminders 模型与 schema 单测 34/34 通过，`aiao-desktop-web:typecheck`、`aiao-desktop-web:lint`、`aiao-desktop-e2e:lint` 和生产构建通过。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=reminder-filters --parallel=1 --report=/tmp/aiao-reminder-filters-green.json --output-style=static`：1 组全绿，七项结果为 `true`，无页面错误。
- 既有 `reminder-drafts` 回归组重新通过，覆盖失败保留、关闭等待、重试、切换完成和键盘持久化；新建草稿不会因完成状态被筛选器卸载。
