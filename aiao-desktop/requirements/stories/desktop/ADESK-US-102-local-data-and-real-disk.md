---
id: ADESK-US-102
title: 本地数据与真实磁盘
status: Done
priority: High
epic: ADESK-EPIC-002
created: 2026-11-12
updated: 2026-11-13
tags: [desktop, rxdb, sqlite, opfs, terminal, e2e]
dependsOn: [ADESK-US-101]
capabilities: []
---

# 用户故事：本地数据与真实磁盘

## 作为/我想要/以便

**作为** 在浏览器里使用 Aiao Desktop 的人
**我想要** 桌面上的文件是真文件、系统与应用的数据刷新后还在，终端也能看到并修改同一块磁盘
**以便** 像用一台真电脑一样，在 Finder、TextEdit 与终端之间来回处理同一批文件。

## 范围边界

### In Scope

- 本地库：`@aiao/rxdb` + `@aiao/rxdb-adapter-sqlite-wasm`，OPFS 可用时库文件在 OPFS（[D-07](../../decisions.md#d-07系统数据存在本地-sqlite)）。系统设置、桌面图标位置、最近使用与各内置应用的数据都在库里，首次打开写入内置内容，之后保留改动。
- 磁盘：目录树是 tree 插件的 `DesktopFile` 实体，文件体由 storage 插件放在 OPFS（[D-08](../../decisions.md#d-08文件体由-storage-插件放在-opfs)）；改写前虚拟文件系统里的全部条目都变成真文件，大小与日期是真实值；废纸篓是 `~/.Trash`，应用是带 `Contents/Info.plist` 的程序包。
- Finder、桌面图标（来自 `~/Desktop`）、聚焦搜索、TextEdit（读写真实内容）、预览（显示文件本身）与 Dock 的废纸篓都读同一块磁盘；磁盘工具的「抹掉」恢复内置内容。
- 终端：打开时把磁盘复制进 Vivari，从 `~` 开始，终端与桌面两边的改动互相同步；补上 `touch`、`mv`、`cp`、`open`，shell 展开 `~` 与 `$NAME`（[D-09](../../decisions.md#d-09终端按需复制磁盘)）。

### Out of Scope

- `node_modules` 同步回磁盘、glob（`*`）展开、`ls -l` 等 Vivari shell 本身没有的能力。
- 多个标签页同时打开时的实时互通：每个标签页各有一台虚拟机与一份内存索引，写入落在同一个库，刷新后才看到另一个标签页的改动。
- 视频、音频、HEIC 等占位文件的真实播放与解码；库与文件体的备份、导出与跨设备同步。
- 非 Chromium 浏览器。

## 验收标准

| #   | 前置条件                 | 操作                                                           | 预期结果                                                                                       | 状态 |
| --- | ------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---- |
| 1   | 全新浏览器配置，正式构建 | 打开 `/?boot=0`                                                | OPFS 里有 `aiao-desktop@…sqlite` 库文件，storage 插件的 `aiao-desktop-files/blobs/` 下有文件体 | ✅   |
| 2   | 桌面已打开               | 看桌面图标                                                     | 除 Macintosh HD 外的图标就是 `~/Desktop` 里的条目                                              | ✅   |
| 3   | 桌面已打开               | 双击桌面上的 `prasenx.txt`                                     | TextEdit 显示文件的真实内容                                                                    | ✅   |
| 4   | 桌面已打开               | 双击桌面上的截图                                               | 预览显示文件本身（1440 宽的 PNG）                                                              | ✅   |
| 5   | 打开终端                 | 依次执行 `pwd`、`cat Desktop/prasenx.txt`、`ls ~/Desktop`      | 从 `/Users/prasenjit` 开始，读到与 Finder 相同的文件与内容                                     | ✅   |
| 6   | 终端已打开               | `echo … > ~/Desktop/terminal-note.txt`                         | 桌面上出现 `terminal-note.txt`                                                                 | ✅   |
| 7   | 终端已打开               | 用 `touch`、`mv`、`cp` 在 `~/Desktop` 里建、改名、复制文件     | 改名后的文件与副本出现在桌面上，改名前的文件不在                                               | ✅   |
| 8   | 终端已打开               | `open ~/Desktop/terminal-note.txt`                             | TextEdit 打开并显示终端写进去的内容                                                            | ✅   |
| 9   | 终端已打开               | 在 Finder 的「桌面」里新建文件夹，再在终端 `ls ~/Desktop`      | 桌面出现 `untitled folder`，终端里也列得出来                                                   | ✅   |
| 10  | 完成 #6 与 #9            | 刷新页面                                                       | `terminal-note.txt` 与 `untitled folder` 仍在桌面上                                            | ✅   |
| 11  | 桌面已打开               | 用聚焦搜索切到深色外观，再刷新页面                             | 仍是深色外观（系统设置在库里）                                                                 | ✅   |
| 12  | 桌面已打开               | 在备忘录里新建一条并输入文字、在提醒事项里新建一条，再刷新页面 | 两条都还在（内置应用的数据在库里）                                                             | ✅   |
| 13  | 磁盘上有改动             | 在磁盘工具里抹掉 Macintosh HD                                  | 改动全部消失，内置内容恢复                                                                     | ✅   |
| 14  | 外网请求全部拦截         | 依次完成 #1～#13                                               | 没有页面错误；控制台错误只有资源加载失败                                                       | ✅   |

验收证据：[smoke.mjs](../../../apps/e2e/src/smoke.mjs)（`aiao-desktop-e2e:e2e`）。各 AC 对应输出 JSON 里的检查项：#1 `diskState.sqliteInOpfs` 与 `diskState.fileBodiesInOpfs`，#2 `diskState.desktopFromFolder`，#3 `diskState.textEditShowsFile`，#4 `diskState.previewShowsImage`，#5 `diskState.shellStartsAtHome`、`shellReadsFile` 与 `shellListsDesktop`，#6 `diskState.shellWritesDisk`，#7 `diskState.shellCommandsWork`，#8 `diskState.openCommandOpensTextEdit`，#9 `diskState.finderFolderOnDesktop` 与 `shellSeesFinderChange`，#10 `persistence.fileSurvivesReload` 与 `folderSurvivesReload`，#11 `persistence.settingsSurviveReload`，#12 `persistence.noteSurvivesReload` 与 `reminderSurvivesReload`，#13 `persistence.eraseRestoresDisk`，#14 脚本收集的页面错误与控制台错误；#10～#13 都在同一次运行里刷新页面后检查。磁盘、终端同步、shell 补丁、补充命令与各应用的数据转换另有 web 的单测（`aiao-desktop-web:test`，22 个文件、161 个用例）。结论见[验收台账](../../verification-report.md#浏览器冒烟)。

## 技术笔记

- 写操作经 [file-system.ts](../../../apps/web/src/app/services/file-system.ts) 的串行队列进入 [rxdb-disk-store.ts](../../../apps/web/src/app/disk/rxdb-disk-store.ts)：先写文件体、再写行，行写失败就删掉刚写的文件体。界面读的那棵树由 `DesktopFile` 的活查询组装，谁改了文件行，Finder、桌面与 Dock 都跟着变。
- 种子内容在 [disk-seed.ts](../../../apps/web/src/app/disk/disk-seed.ts) 与 [seed-text.ts](../../../apps/web/src/app/disk/seed-text.ts)；图片由 [photo-encoder.ts](../../../apps/web/src/app/services/photo-encoder.ts) 把 Finder 缩略图用的同一套插画渲染成 PNG / JPEG。
- 终端：[virtual-machine.ts](../../../apps/web/src/app/vm/virtual-machine.ts) 管理共用的虚拟机，[disk-vm-sync.ts](../../../apps/web/src/app/vm/disk-vm-sync.ts) 负责双向同步，[shell-patch.ts](../../../apps/web/src/app/vm/shell-patch.ts) 与 [coreutils.ts](../../../apps/web/src/app/vm/coreutils.ts) 是 shell 补丁与补充命令。
- 内置应用的数据：每个应用一份 `<app>.entities.ts` 与 `<app>.seed.ts`，登记在 [entities.ts](../../../apps/web/src/app/data/entities.ts) 与 [seeds.ts](../../../apps/web/src/app/data/seeds.ts)；备忘录、提醒事项、日历、通讯录、邮件、信息、照片、音乐、语音备忘录、股票、天气（城市）、时钟（世界时钟）、无边记（笔迹）、Safari（书签、阅读列表、历史）、地图（收藏地点）、FaceTime（通话记录）、书架与字体册共 17 个数据域。选中项、搜索词、播放进度与外网拉来的行情、天气、网页仍是运行时状态；活动监视器的进程表是模拟读数，没有进库。
- 随之改变的行为：所有窗口共用库里的数据（原先每个窗口各持一份）；记录 id 从数字变成 UUID（`data-id`、`data-ri`、`data-ev` 等属性值随之变化，选择器不变）；邮件按邮箱过滤（发出的邮件进「已发送」）；备忘录输入后 0.42 秒自动保存；写入是异步的，新建的记录等活查询带回后才出现。
- 数据底座：[desktop-database.ts](../../../apps/web/src/app/data/desktop-database.ts)、[desktop-data.ts](../../../apps/web/src/app/data/desktop-data.ts)（连库、初始数据）、[preferences.ts](../../../apps/web/src/app/data/preferences.ts)（系统偏好键值）、[live-query.ts](../../../apps/web/src/app/data/live-query.ts)。

## 实现文件

- `aiao-desktop/apps/web/src/app/data/` — 本地库、初始数据与偏好。
- `aiao-desktop/apps/web/src/app/disk/` — 磁盘实体、存储后端、目录树与种子内容。
- `aiao-desktop/apps/web/src/app/vm/` — 终端虚拟机与同步。
- `aiao-desktop/apps/web/src/app/services/file-system.ts`、`system-settings.ts` — 磁盘门面与系统设置持久化。
- `aiao-desktop/apps/e2e/src/smoke.mjs` — 冒烟。

## References

- [ADESK-EPIC-002](../../epics/ADESK-EPIC-002.md)
- [D-07](../../decisions.md#d-07系统数据存在本地-sqlite)、[D-08](../../decisions.md#d-08文件体由-storage-插件放在-opfs)、[D-09](../../decisions.md#d-09终端按需复制磁盘)
