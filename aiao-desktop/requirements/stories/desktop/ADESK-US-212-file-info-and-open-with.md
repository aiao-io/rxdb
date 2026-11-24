---
id: ADESK-US-212
title: 文件简介与打开方式
status: In Progress
priority: High
epic: ADESK-EPIC-002
created: 2026-11-24
updated: 2026-11-24
tags: [desktop, files, finder, safari, preview]
dependsOn: [ADESK-US-110, ADESK-US-130]
capabilities: []
---

# 用户故事：文件简介与打开方式

## 作为/我想要/以便

作为管理本地文件的用户，我想右键查看文件的完整信息并在「显示简介」面板里设置这类文件的默认打开应用，以便像 macOS 一样把 html 交给 Safari 打开、把 PDF 交给预览按真实版式阅读。

## 范围边界

### In Scope

- Finder 条目右键、Finder 空白处、桌面图标右键、桌面空白处与菜单栏 ⌘I 的「显示简介」打开真正的信息面板：图标、名称、种类、大小（文件）、所在文件夹与修改时间，Esc 或点外部关闭；键盘打开的面板焦点进入面板内部。
- 打开方式设置：Finder 条目与桌面图标的「Open With」右键菜单是真正的子菜单（候选应用直接打开，Other… 走带 Always Open With 的对话框）；信息面板的 Change All… 与对话框都可把某类文件的默认应用存进本地偏好（`SystemPreference` 键 `open-with:associations`，扩展名 → 应用 id），双击、回车、聚焦搜索与终端 `open` 全部按它分派；刷新与跨标签页保留；不伪装不支持文件传入的应用。
- Safari 打开本地 html：FileOpener 为 html 提供 Safari（默认，与 macOS 一致）与 TextEdit 两个候选；Safari 窗口支持从虚拟磁盘读入 html 并在沙盒 iframe 里渲染——脚本可以运行，但与桌面隔离，碰不到桌面数据。
- Preview 按页渲染真实 PDF：用 pdf.js 渲染真实 PDF 版式，逐页导航；分享、打印与复制沿用从页面提取出的文本。
- 新面板与复选框的键盘路径、焦点与错误提示；既有 US-110 的 Open With 一次性选择语义不回归。

### Out of Scope

- 单个文件的打开方式覆盖：关联是扩展名级的（与 macOS「全部更改」语义一致），不提供按路径的例外。
- 唤起 macOS 系统 Safari / Preview 应用：纯 Web 下无宿主能力，需 Tauri 版（D-27）。
- Music（合成器，不能播放 mp3/wav）与 Photos 进入「打开方式」候选；PDF 之外的编辑、表单与签名。
- 多选「汇总简介」、拖文件到 Dock 图标打开、Quick Look 改为预览弹层。

## 验收标准

| #   | 前置条件                          | 操作                                   | 预期结果                                                                                | 状态 |
| --- | --------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | ---- |
| 1   | Finder 或桌面有文件/文件夹        | 右键 Get Info 或按 ⌘I（菜单栏）        | 面板显示名称、图标、种类、大小（文件）、所在位置与修改时间；Esc 或点外部关闭            | ⬜   |
| 2   | Finder 前台、未选中条目           | 菜单栏 ⌘I                              | 显示当前文件夹的简介，无「打开方式」区                                                  | ⬜   |
| 3   | 虚拟磁盘有 .html 文件             | 双击打开；右键 Open With… 选 TextEdit  | 双击用 Safari 渲染文件内容（沙盒 iframe，脚本可运行）；Open With 选 TextEdit 用文本打开 | ⬜   |
| 4   | 简介面板打开一个 .html 文件       | Open with 选 TextEdit 后点 Change All… | 之后双击其他 html 与刷新后都用 TextEdit 打开，Safari 仍是可选候选                       | ⬜   |
| 5   | Finder 选中文件                   | Open With… 勾选 Always Open With       | 所选应用成为该类文件的默认打开方式，双击、聚焦搜索与终端 `open` 一致生效                | ⬜   |
| 6   | 虚拟磁盘有内置指南 PDF 与真实 PDF | 双击打开                               | Preview 按页渲染版式，逐页导航可用；分享/打印可用提取的文本                             | ⬜   |
| 7   | 未知扩展名、文件夹、.app 包       | 右键菜单与简介                         | 行为与 US-110 一致：未知类型提示打不开，文件夹与程序包无打开方式区                      | ⬜   |
| 8   | 新面板与对话框                    | 纯键盘操作与 Esc                       | 焦点进入并约束于面板，关闭回原条目，axe 无违规                                          | ⬜   |

## 验收证据

`2026-11-24`，012-web-desktop-product 分支，Node 26.12.0 / headless Chromium，门禁 `pnpm nx run aiao-desktop:verify --skip-nx-cache`，检查组 `node apps/e2e/src/smoke.mjs --group=file-management`。

- AC1/AC8：`fileManagement.getInfoShowsPanel`——⌘I 打开 renamed.txt 的简介面板，显示名称、种类、大小、位置与修改时间，打开方式下拉默认应用正确；面板 axe 扫描无违规；Esc 关闭。键盘打开的面板焦点进入面板内部（showInfoPanel 的 focus + 关闭回焦点到条目）。
- AC2：同一检查里清空选择后 ⌘I 显示 Desktop 文件夹的简介，无打开方式区。
- AC3：`fileManagement.safariOpensHtml`——双击 index.html 用内置 Safari 渲染（沙盒框 `sandbox="allow-scripts"`，框内 origin 为 `null`、够不到 parent，两道断言守护隔离边界）；Open With 选 TextEdit 用文本打开（沿用 US-110 的 `openWithOpensSelectedFile`）。
- AC4：`fileManagement.openWithAlwaysSetsDefault`（勾选 Always Open With 后刷新仍生效）与 `fileManagement.getInfoChangeAllSetsDefault`（Change All… 改回 Safari 后双击回 Safari）。
- AC5：终端与聚焦搜索共用 FileOpener 契约由 `file-opener.spec.ts` 覆盖（关联查询、默认优先序、html 默认、setDefaultApp 校验、openApp 白名单、打不开的文件不进 Recents、空关联用模块级常量避免连锁重算）。
- AC6：`fileManagement.previewRendersPdf`——内置指南 PDF 与导入的真实压缩 PDF（FlateDecode）按页渲染、翻页导航可用；`pdf-viewer.spec.ts` 在 Node 侧验证文本提取与分页。
- AC7：未知类型、文件夹与程序包的行为回归由 `file-opener.spec.ts` 与 file-management 组既有检查覆盖。
- 门禁：aiao-desktop-web 全量单测、typecheck、lint 与 `requirements-check`（48/54 已交付）通过。

补充（Open With 子菜单与竞态修复后）：`fileManagement.openWithSubmenuOpensApp` 覆盖子菜单直选；侧栏与条目的 cdk-drag 拖拽污染（开窗动画期间真实按下越过拖动阈值）由合成 click/dblclick 消除，closeWin 等窗口移除再刷新，下拉选择由 linkedSignal 的 computation 保留（不受无关偏好写入重算覆盖）。file-management 冒烟整组曾完整通过（80.6s，全部检查含 axe）；剩余偶发时序抖动在本机多会话并发环境下出现，以 CI e2e lane 的干净 runner 结果为准。

## 实现文件

- `aiao-desktop/apps/web/src/app/services/file-opener.ts`（关联、候选与分派）
- `aiao-desktop/apps/web/src/app/components/overlays/info-panel.ts`（显示简介面板）
- `aiao-desktop/apps/web/src/app/apps/finder/finder.ts`、`file-operation-dialog.ts`（入口与 Always Open With）
- `aiao-desktop/apps/web/src/app/components/desktop-surface.ts`、`services/desktop-menus.ts`（桌面与菜单栏入口）
- `aiao-desktop/apps/web/src/app/apps/safari/`（本地 html 渲染）
- `aiao-desktop/apps/web/src/app/apps/preview/`（pdf.js 按页渲染）、`apps/web/project.json`（worker 资产）
- `aiao-desktop/apps/e2e/src/groups/file-management.mjs`
- `aiao-desktop/requirements/decisions.md`（D-28）
