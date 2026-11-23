---
id: ADESK-US-110
title: Finder 文件管理与废纸篓恢复
status: Done
priority: High
epic: ADESK-EPIC-002
created: 2026-11-17
updated: 2026-11-20
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
- 将本机文件批量拖入桌面、Finder 当前目录、文件夹图标、分栏目录或侧栏快捷位置（每批最多 256 MiB）。支持单文件下载，保留原始字节。
- Finder 工具栏移除独立的导入按钮，「更多」菜单保留键盘选取本机文件的入口。
- Finder 分隔线从工具栏顶部即可拖动，悬停和拖动时保持原色。侧栏第一组紧贴工具栏下沿，到 132 像素后再向左拖 24 像素即可收起。关闭、最小化和缩放按钮固定在工具栏中线。收起后前进和后退按钮排在绿色缩放按钮右侧，侧栏可从左缘拖回。
- Finder 侧栏快捷项可在各自分组内上下拖动，落点显示占位，相邻条目滑动让位，顺序保存在本地。
- Finder 侧栏的拖动预览为透明底，可随指针自由移动。Favourites 快捷项拖出侧栏时显示 ×，松手即移除快捷项。拖回侧栏后 × 消失，聚焦快捷项后可按 Alt+Backspace 移除。
- 桌面和 Finder 显示进入视野的真实图片缩略图。缩略图按内容 ID 缓存在 OPFS 的 `Library/Caches/Thumbnails`，双击用预览打开原图。
- 明确选择已支持文件的内置应用打开；不伪装任意应用都支持文件传入。
- 废纸篓使用 `~/.Trash` 作为统一中转，支持从桌面和 Finder 移入、Dock 满空状态、Finder Empty Trash 确认清倒、Put Back 和指定目录恢复；旧条目、失效原目录、重名时不覆盖。
- 桌面移入废纸篓时图标只淡出一次。桌面和 Finder 支持在当前标签页按 ⌘Z 或 Ctrl+Z 撤销最近一次移入（多选按批还原），复用 RxDB 行标识和废纸篓保存的原路径。清倒后不能撤销，刷新后仍可用 Put Back。
- 目录、文件体、多个标签页与终端的既有同步；系统拥有的路径仍受保护。
- 新增界面的键盘路径、焦点、错误提示；schema 升级与旧数据保留。

### Out of Scope

- 操作本机任意目录、文件夹拖入、ZIP 打包目录下载、完整桌面备份；备份属于后续数据保障任务。
- 永久删除后的恢复；中断的整批导入/复制事务恢复由后续数据保障任务继续验收。

## 验收标准

| #   | 前置条件                             | 操作                               | 预期结果                                                             | 状态 |
| --- | ------------------------------------ | ---------------------------------- | -------------------------------------------------------------------- | ---- |
| 1   | 文件或嵌套目录存在                   | 重命名、同名、无效名、已有目标     | 有效改名保留内容，错误不覆盖和丢失，取消不改动                       | ✅   |
| 2   | 嵌套目录含空目录、空文件与二进制     | 连续复制与注入写入失败             | 独立副本、重名序号、失败撤回不完整副本，源内容不变                   | ✅   |
| 3   | Finder 打开实际目录                  | 导入同名、二进制、零字节文件并下载 | 字节一致、原文件保留，失效目录与读取/写入失败可见                    | ✅   |
| 4   | 文本或图片文件选中                   | Open With 与取消                   | 选择支持的应用后打开真实文件，取消不启动                             | ✅   |
| 5   | 文件/目录移入废纸篓                  | 刷新、改名、Put Back               | 原位置仍可恢复，目录子内容保留，记录与移动同一次提交                 | ✅   |
| 6   | 旧条目无记录、原目录消失或有同名文件 | Put Back / Restore to Folder       | 原目录不被悄悄重建，明确选位置，重名不覆盖，取消保留条目             | ✅   |
| 7   | 原有 schema 与文件                   | 升级当前构建、升级失败后重试       | 文件和文件体保留；新字段与版本一起提交；旧构建拒绝较新库             | ✅   |
| 8   | 新增菜单、输入框、目录选择           | 纯键盘操作和 Esc                   | 焦点进入并约束于对话框，取消回原条目，错误可感知                     | ✅   |
| 9   | 桌面与 Finder 可见                   | 将本机文件拖到可写目录或只读位置   | 可写目标接收副本，只读位置拒绝拖入，更多菜单可用键盘导入             | ✅   |
| 10  | Finder 侧栏显示 AirDrop 等快捷项     | 组内上下拖动，或聚焦后按 Alt+↑/↓   | 拖动时显示占位和让位动画，松手排序，刷新保持顺序                     | ✅   |
| 11  | 桌面或 Finder 显示图片               | 切换视图、刷新、覆盖、删除         | 等比缩图，刷新复用 OPFS，覆盖和永久删除清理旧缓存                    | ✅   |
| 12  | Finder 侧栏显示 Favourites           | 横向拖出 Documents 快捷项并松手    | 透明预览随指针移动，出界显示 ×，刷新后快捷项仍已移除，原目录可访问   | ✅   |
| 13  | 桌面或 Finder 中存在普通文件         | 右键 Move to Trash 或按 ⌘Backspace | 原目录立即消失，条目进入 `~/.Trash`，Dock 图标变满，刷新后仍在 Trash | ✅   |
| 14  | Trash 中存在条目                     | 点击 Empty Trash，取消后再次确认   | 取消保留条目；确认后永久删除，Finder 数量归零，Dock 图标恢复为空     | ✅   |

## 验收证据

2026-11-17，基线 `2a3e46183` 加本次工作区改动，macOS/Node 26.12.0/headless Chromium 158，命令与原始结果见[本轮证据](../../evidence/2026-11-17/README.md#a02-finder-文件管理adesk-us-110)。

- AC1–4：`fileManagement.renameValidatesAndPreservesContent`、`duplicateIsIndependent`、`folderCopyKeepsNestedAndEmptyEntries`、`columnActionsUseExactPath`、`galleryActionsAndDuplicateShortcut`、`importPreservesBytes`、`importKeepsExistingNames`、`readFailureKeepsBatchAndExistingData`、`openWithOpensSelectedFile`；写入失败和 256 MiB 边界由操作单测覆盖。
- AC5–6：`trashOriginSurvivesReloadAndRename`、`restoreKeepsCollidingFile`、`missingOriginRequiresExplicitFolder`、`legacyTrashCanChooseFolder`；RxdbDiskStore 单测验证同一行提交和失败不更新原位置。
- AC13–14：2026-11-20 的 `file-management` 检查组验证 `trashShortcutMovesItem` 和 `emptyTrashRequiresConfirmation`；`applications-protection` 验证预装应用拒绝移入和清倒后的保护状态。
- AC13 的桌面回归：`fileManagement.desktopTrashAnimatesOnce` 检查单次淡出且不闪回，`fileManagement.desktopUndoMoveToTrash` 检查 ⌘Z 还原图标及原始内容；`file-system.spec.ts` 覆盖快速撤销、批量、重名和废纸篓条目的身份校验。
- AC7：真实 `2026111301` 产物升级到 `2026111701`，upgrade-previous 六项通过；upgrade-legacy 与 upgrade-protection 继续通过。
- AC8：`renameCancellationAndKeyboardFocus`、`a11y.fileOperations.*` 全绿，新增对话框 axe 无违规。自动化不能替代物理设备与读屏人工证据。

`2026-11-20` 的拖放回归覆盖 AC3 和 AC9。`file-management` 检查组验证 `dropsOnDesktop`、`dropsOnDesktopFolder`、`dropsOnFolder`、`dropsOnSidebar`、`dropsOnVisibleColumn`、`rejectsReadOnlyDrops` 及批量导入的数据完整性。`a11y.fileOperations.keyboardImport` 验证通过键盘打开「更多」菜单并选取本机文件。

侧栏调整由 `finderSidebarResize.dragAndNavigation` 验收，覆盖从工具栏拖动、分隔线颜色、侧栏顶部对齐、固定窗口按钮，以及收起后导航与恢复宽度。`a11y.finder.sidebarSplitter` 和 `a11y.finder.sidebarKeyboard` 验证分隔线的无障碍角色、键盘调宽与收起后的焦点。

AC10 由 `finderSidebar.animatesWithPlaceholder`、`finderSidebar.reordersWithoutNavigating`、`finderSidebar.persists` 和 `a11y.finder.sidebarKeyboardReorder` 验收。

AC11 由 `imageThumbnails.showsActualImage`、`allFinderViews`、`keepsOriginalResolution`、`reusesOpfsAfterReload` 和 `replacesAndRemovesCache` 验收。

AC12 由 `finderSidebar.favouritesDragOut` 验收，覆盖出界提示、拖回取消、移除持久化和原目录完整性。`a11y.finder.sidebarKeyboardRemove` 验证快捷键和移除后的焦点。

2026-11-24 分支评审修复：同级名称不区分大小写、保留大小写（像 macOS），与库里 `desktop_file_parent_name` 的归一化唯一索引同口径，不再把原始 `UNIQUE constraint failed` 报给用户。`file-management` 检查组新增 `importCaseVariantGetsNewName`（拖入只差大小写的同名文件时追加序号，原文件不动）、`renameRejectsCaseVariantOfSibling`（改成同级文件的大小写变体时报「已存在」）与 `caseOnlyRenameKeepsContent`（纯大小写改名保留内容），覆盖 AC1–3。保存面板的覆盖确认、复制、移动、恢复与终端写回的同口径判定由 `rxdb-disk-store`、`memory-disk-store`、`file-panel-model`、`file-system` 与 `disk-vm-sync` 单测覆盖；终端里写出只差大小写的文件时只提示一次，不再每轮扫描重试。

新 schema 版本为 `2026111701`；之前的构建不能直接打开升级后的库，沿用既有降级保护。本次尚未发布。

## 实现文件

- `aiao-desktop/apps/web/src/app/apps/finder/`
- `aiao-desktop/apps/web/src/app/disk/`
- `aiao-desktop/apps/web/src/app/services/file-system.ts`
- `aiao-desktop/apps/web/src/app/data/schema-version.ts`
- `aiao-desktop/apps/e2e/src/groups/`
