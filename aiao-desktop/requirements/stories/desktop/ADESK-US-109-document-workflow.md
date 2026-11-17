---
id: ADESK-US-109
title: 文档保存、冲突与未保存内容保护
status: Done
priority: High
epic: ADESK-EPIC-002
created: 2026-11-17
updated: 2026-11-17
tags: [desktop, files, data-safety]
dependsOn: [ADESK-US-102, ADESK-US-105, ADESK-US-206]
capabilities: []
---

# 用户故事：文档保存、冲突与未保存内容保护

## 作为/我想要/以便

作为在桌面记录和编辑文本的用户，我想把新文档保存到虚拟磁盘，并在退出或遇到冲突时保留草稿，以便可靠地继续工作。

## 范围边界

### In Scope

- TextEdit 新建保存、另存为、重新打开、保存状态与可重试错误。
- 同一文件并发改动的版本拒绝、重新加载和另存副本。
- 关闭、退出应用、重启、关机的保存／放弃／取消；多个窗口全部批准后才销毁。
- 刷新/离开页面的浏览器未保存提示；请求期间保留编辑和正确状态。

### Out of Scope

- 富文本格式落盘、多人合并算法；浏览器异常退出后的任意内存恢复。
- 物理快捷键与读屏播报另按 US-107/108 的证据边界记录。

## 验收标准

| #   | 前置条件                     | 操作                             | 预期结果                                                 | 状态 |
| --- | ---------------------------- | -------------------------------- | -------------------------------------------------------- | ---- |
| 1   | 新建文档含中文与 emoji       | 保存、选择目录与名称、关闭再打开 | 内容字节一致，标题和恢复位置更新                         | ✅   |
| 2   | 新建或已有文档有修改         | 另存为或取消面板                 | 确认后生成目标且原文件不变，取消保留草稿                 | ✅   |
| 3   | 两个窗口编辑同一文件         | 先后保存                         | 后者拒绝覆盖，保留草稿，可另存副本或确认重新加载         | ✅   |
| 4   | 保存遇到删除、容量或写入错误 | 保存后重试                       | 错误可见，旧数据和草稿保留，成功后才清除未保存状态       | ✅   |
| 5   | 文档未保存                   | 关闭并分别选择保存、放弃、取消   | 保存成功或明确放弃才关闭，取消和保存失败保留窗口及焦点   | ✅   |
| 6   | 同应用多个窗口含未保存内容   | 退出，其中一个取消或保存失败     | 所有窗口仍在，不发生部分退出；重复请求不重复弹窗         | ✅   |
| 7   | 多个应用窗口含未保存文档     | 重启或关机并取消                 | 不启动关机/开机流程，原会话仍可操作                      | ✅   |
| 8   | 保存或读取请求尚未返回       | 继续编辑、重复保存或请求关闭     | 晚到结果不覆盖新草稿，不重复写入，不把新编辑误报为已保存 | ✅   |
| 9   | 有未保存文档                 | 离开页面或刷新                   | 注册浏览器离页保护；保存或销毁后解除对应保护             | ✅   |
| 10  | 使用键盘                     | 保存面板和未保存对话框操作、取消 | 焦点进入并保持在对话框，关闭后回到原文档                 | ✅   |

## 验收证据

基线 `2a3e46183` 加本次工作区改动，2026-11-17，macOS/Node 26.12.0/headless Chromium 158，完整命令与原始结果见[证据目录](../../evidence/2026-11-17/README.md)。

- AC1–3：`documentWorkflow.newDocumentSaved`、`savedPathRestored`、`reopenedBytesMatch`、`saveAsKeepsOriginal`、`concurrentConflict`、`conflictCanSaveCopy`；multi-tab 五轮并发拒绝覆盖与显式重载。
- AC4：`multiTab.saveFailsAfterTrash` / `saveFailsAfterRename` / `saveFailsAfterErase` / `failedSaveKeepsWindowContent` / `failedSaveCreatesNothing`；TextDocument 单测注入写入失败与重试。
- AC5–7：`documentWorkflow.cancelCloseKeepsDraft`、`discardCloses`、`saveOnClose`、`cancelSaveKeepsDraft`、`quitCancellationIsAtomic`、`restartCancellationKeepsSession`；WindowManager / Session 单测覆盖关闭失败、重复请求和关机分支。
- AC8：TextDocument 单测覆盖保存期间编辑、请求合并、迟到加载、dispose；WindowManager 单测覆盖协商期间重复关闭。
- AC9–10：`beforeUnloadProtectsDraft`、`savedDocumentDoesNotBlockUnload`、`keyboardDialogFocus`，以及原 file-panel/a11y 回归；真实设备验收边界不变。

## 实现文件

- `aiao-desktop/apps/web/src/app/apps/textedit/`
- `aiao-desktop/apps/web/src/app/services/window-manager.ts`
- `aiao-desktop/apps/web/src/app/services/desktop-window.ts`
- `aiao-desktop/apps/web/src/app/services/session.ts`
- `aiao-desktop/apps/e2e/src/groups/`
