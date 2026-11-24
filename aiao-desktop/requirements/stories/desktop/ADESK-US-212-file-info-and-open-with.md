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
- 打开方式设置：信息面板与「Open With…」对话框都可把某类文件的默认应用存进本地偏好（`SystemPreference` 键 `open-with:associations`，扩展名 → 应用 id），双击、回车、聚焦搜索与终端 `open` 全部按它分派；刷新与跨标签页保留；不伪装不支持文件传入的应用。
- Safari 打开本地 html：FileOpener 为 html 提供 Safari（默认，与 macOS 一致）与 TextEdit 两个候选；Safari 窗口支持从虚拟磁盘读入 html 并在沙盒 iframe 里渲染——脚本可以运行，但与桌面隔离，碰不到桌面数据。
- Preview 按页渲染真实 PDF：用 pdf.js 渲染真实 PDF 版式，逐页导航；分享、打印与复制沿用从页面提取出的文本。
- 新面板与复选框的键盘路径、焦点与错误提示；既有 US-110 的 Open With 一次性选择语义不回归。

### Out of Scope

- 单个文件的打开方式覆盖：关联是扩展名级的（与 macOS「全部更改」语义一致），不提供按路径的例外。
- 唤起 macOS 系统 Safari / Preview 应用：纯 Web 下无宿主能力，需 Tauri 版（D-27）。
- Music（合成器，不能播放 mp3/wav）与 Photos 进入「打开方式」候选；PDF 之外的编辑、表单与签名。
- 多选「汇总简介」、拖文件到 Dock 图标打开、Quick Look 改为预览弹层。

## 验收标准

| #   | 前置条件                         | 操作                                   | 预期结果                                                               | 状态 |
| --- | -------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- | ---- |
| 1   | Finder 或桌面有文件/文件夹       | 右键 Get Info 或按 ⌘I（菜单栏）        | 面板显示名称、图标、种类、大小（文件）、所在位置与修改时间；Esc 或点外部关闭 | ⬜   |
| 2   | Finder 前台、未选中条目          | 菜单栏 ⌘I                              | 显示当前文件夹的简介，无「打开方式」区                                   | ⬜   |
| 3   | 虚拟磁盘有 .html 文件            | 双击打开；右键 Open With… 选 TextEdit  | 双击用 Safari 渲染文件内容（沙盒 iframe，脚本可运行）；Open With 选 TextEdit 用文本打开 | ⬜   |
| 4   | 简介面板打开一个 .html 文件      | Open with 选 TextEdit 后点 Change All… | 之后双击其他 html 与刷新后都用 TextEdit 打开，Safari 仍是可选候选          | ⬜   |
| 5   | Finder 选中文件                  | Open With… 勾选 Always Open With       | 所选应用成为该类文件的默认打开方式，双击、聚焦搜索与终端 `open` 一致生效   | ⬜   |
| 6   | 虚拟磁盘有内置指南 PDF 与真实 PDF | 双击打开                               | Preview 按页渲染版式，逐页导航可用；分享/打印可用提取的文本               | ⬜   |
| 7   | 未知扩展名、文件夹、.app 包      | 右键菜单与简介                         | 行为与 US-110 一致：未知类型提示打不开，文件夹与程序包无打开方式区         | ⬜   |
| 8   | 新面板与对话框                   | 纯键盘操作与 Esc                       | 焦点进入并约束于面板，关闭回原条目，axe 无违规                           | ⬜   |

## 验收证据

（实现完成后填写。）

## 实现文件

- `aiao-desktop/apps/web/src/app/services/file-opener.ts`
- `aiao-desktop/apps/web/src/app/components/overlays/info-panel.ts`
- `aiao-desktop/apps/web/src/app/apps/finder/finder.ts`
- `aiao-desktop/apps/web/src/app/apps/finder/file-operation-dialog.ts`
- `aiao-desktop/apps/web/src/app/components/desktop-surface.ts`
- `aiao-desktop/apps/web/src/app/services/desktop-menus.ts`
- `aiao-desktop/apps/web/src/app/apps/safari/`
- `aiao-desktop/apps/web/src/app/apps/preview/`
- `aiao-desktop/apps/e2e/src/groups/`
