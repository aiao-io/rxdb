---
id: ADESK-US-110
title: Finder 文件管理与废纸篓恢复
status: Done
priority: High
epic: ADESK-EPIC-002
created: 2026-11-17
updated: 2026-11-17
tags: [desktop, files, data-safety]
dependsOn: [ADESK-US-102, ADESK-US-106, ADESK-US-109]
capabilities: []
---

# 用户故事：Finder 文件管理与废纸篓恢复

## 作为/我想要/以便

作为管理本地文件的用户，我想在 Finder 重命名、复制、选择打开方式、导入下载文件和恢复误删内容，以便不用终端也能完成日常文件操作。

## 范围边界

### In Scope

- 文件与目录重命名、递归复制、扩展名前重名消解。
- 本机文件批量导入当前目录（每批最多 256 MiB）、单文件下载，保留原始字节。
- 明确选择已支持文件的内置应用打开；不伪装任意应用都支持文件传入。
- 废纸篓原位置持久化、Put Back、指定目录恢复；旧条目、失效原目录、重名时不覆盖。
- 目录、文件体、多个标签页与终端的既有同步；系统拥有的路径仍受保护。
- 新增界面的键盘路径、焦点、错误提示；schema 升级与旧数据保留。

### Out of Scope

- 操作本机任意目录、文件夹拖入、ZIP 打包目录下载、完整桌面备份；备份属于后续数据保障任务。
- 永久删除后的恢复；中断的整批导入/复制事务恢复由后续数据保障任务继续验收。

## 验收标准

| #   | 前置条件                             | 操作                               | 预期结果                                                 | 状态 |
| --- | ------------------------------------ | ---------------------------------- | -------------------------------------------------------- | ---- |
| 1   | 文件或嵌套目录存在                   | 重命名、同名、无效名、已有目标     | 有效改名保留内容，错误不覆盖和丢失，取消不改动           | ✅   |
| 2   | 嵌套目录含空目录、空文件与二进制     | 连续复制与注入写入失败             | 独立副本、重名序号、失败撤回不完整副本，源内容不变       | ✅   |
| 3   | Finder 打开实际目录                  | 导入同名、二进制、零字节文件并下载 | 字节一致、原文件保留，失效目录与读取/写入失败可见        | ✅   |
| 4   | 文本或图片文件选中                   | Open With 与取消                   | 选择支持的应用后打开真实文件，取消不启动                 | ✅   |
| 5   | 文件/目录移入废纸篓                  | 刷新、改名、Put Back               | 原位置仍可恢复，目录子内容保留，记录与移动同一次提交     | ✅   |
| 6   | 旧条目无记录、原目录消失或有同名文件 | Put Back / Restore to Folder       | 原目录不被悄悄重建，明确选位置，重名不覆盖，取消保留条目 | ✅   |
| 7   | 原有 schema 与文件                   | 升级当前构建、升级失败后重试       | 文件和文件体保留；新字段与版本一起提交；旧构建拒绝较新库 | ✅   |
| 8   | 新增菜单、输入框、目录选择           | 纯键盘操作和 Esc                   | 焦点进入并约束于对话框，取消回原条目，错误可感知         | ✅   |

## 验收证据

2026-11-17，基线 `2a3e46183` 加本次工作区改动，macOS/Node 26.12.0/headless Chromium 158，命令与原始结果见[本轮证据](../../evidence/2026-11-17/README.md#a02-finder-文件管理adesk-us-110)。

- AC1–4：`fileManagement.renameValidatesAndPreservesContent`、`duplicateIsIndependent`、`folderCopyKeepsNestedAndEmptyEntries`、`columnActionsUseExactPath`、`galleryActionsAndDuplicateShortcut`、`importPreservesBytes`、`importKeepsExistingNames`、`readFailureKeepsBatchAndExistingData`、`openWithOpensSelectedFile`；写入失败和 256 MiB 边界由操作单测覆盖。
- AC5–6：`trashOriginSurvivesReloadAndRename`、`restoreKeepsCollidingFile`、`missingOriginRequiresExplicitFolder`、`legacyTrashCanChooseFolder`；RxdbDiskStore 单测验证同一行提交和失败不更新原位置。
- AC7：真实 `2026111301` 产物升级到 `2026111701`，upgrade-previous 六项通过；upgrade-legacy 与 upgrade-protection 继续通过。
- AC8：`renameCancellationAndKeyboardFocus`、`a11y.fileOperations.*` 全绿，新增对话框 axe 无违规。自动化不能替代物理设备与读屏人工证据。

新 schema 版本为 `2026111701`；之前的构建不能直接打开升级后的库，沿用既有降级保护。本次尚未发布。

## 实现文件

- `aiao-desktop/apps/web/src/app/apps/finder/`
- `aiao-desktop/apps/web/src/app/disk/`
- `aiao-desktop/apps/web/src/app/services/file-system.ts`
- `aiao-desktop/apps/web/src/app/data/schema-version.ts`
- `aiao-desktop/apps/e2e/src/groups/`
