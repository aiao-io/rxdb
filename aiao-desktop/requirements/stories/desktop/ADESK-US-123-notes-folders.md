---
id: ADESK-US-123
title: 备忘录新建文件夹
status: Done
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-18
updated: 2026-11-18
tags: [desktop, notes, data]
dependsOn: [ADESK-US-116, ADESK-US-106]
capabilities: []
---

# 备忘录新建文件夹

作为整理笔记的用户，我希望在 Notes 里新建自己的文件夹，把新笔记放进选中的文件夹，并在刷新后继续看到这些目录和笔记。

## 范围边界

### In Scope

- File 菜单和 Notes 侧栏按钮都能打开 New Folder 面板，创建结果写入真实本地 SQLite。
- 用户文件夹显示在系统文件夹下面，侧栏数量来自活查询；选中文件夹后新建笔记归入该文件夹。
- 空名、系统保留名、大小写重复名和过长名称给出可操作错误，原有目录和笔记保持不变。
- 从旧 schema 升级时由 RxDB 补建用户文件夹表，既有笔记和系统虚拟文件夹不被改写。

### Out of Scope

- 文件夹重命名、删除、嵌套目录、云端同步和 iCloud Notes。
- 跨设备同步、远程笔记账号和系统 Notes 集成。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | Notes 已打开 | 通过侧栏按钮或 File > New Folder 创建 `Projects` | `Projects` 出现在侧栏，名称写入 `desktop$note_folder` | ✅ |
| 2 | 已选中 `Projects` | 新建笔记 | 笔记的 `folder` 在真实 SQLite 中为 `Projects`，侧栏数量同步增加 | ✅ |
| 3 | 已有 `Projects` | 输入空名、`Notes` 或大小写变体 `projects` | 面板保留并显示错误，原目录和笔记不被覆盖 | ✅ |
| 4 | 已创建自定义文件夹 | 刷新并重新打开 Notes | 自定义文件夹仍在，目录表和笔记数据都保留 | ✅ |
| 5 | 旧本地库 | 从 schema `2026111801` 升级到当前构建 | 当前 schema 为 `2026111802`，自动补建空的 `desktop$note_folder`，既有数据不丢 | ✅ |
| 6 | 本地正式构建 | 跑 Notes 单测、schema 指纹、lint、typecheck、生产构建和浏览器回归 | 主要路径通过并归档原始报告，不替代人工 VoiceOver 验收 | ✅ |

## 验收证据

2026-11-18 本地正式构建自动验收完成，未提交、未发布。`notes-folders` 在生产构建上验证用户文件夹写入、当前目录中新建笔记、重复名称拒绝和刷新持久化，报告见[证据](../../evidence/2026-11-17/aiao-notes-folders-green.json)。

- Notes 模型、schema 和实体指纹单测通过；`aiao-desktop-web:typecheck`、`aiao-desktop-web:lint`、`aiao-desktop-e2e:lint` 和生产构建通过。
- `E2E_TRACE=1 NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=notes-folders --parallel=1 --report=/tmp/aiao-notes-folders-green.json --output-style=static`：4 项全绿，`folderPersists`、`noteUsesFolder`、`duplicateNameIsRejected` 和 `folderSurvivesReload` 均为 `true`，无页面错误。
- schema 升级为 `2026111802`，新增 `NoteFolder` 实体；没有字段变更，所以旧库升级由 RxDB 连接阶段补建新表，不执行破坏性迁移。`upgrade-previous` 回归同时确认旧库内容、文件体和版本记录都保留，报告见 [证据](../../evidence/2026-11-17/aiao-upgrade-previous-after-notes-folders-green.json)。
