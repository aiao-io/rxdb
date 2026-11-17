---
id: ADESK-US-207
title: 运营批准应用目录与版本管理
status: Done
priority: High
epic: ADESK-EPIC-003
created: 2026-11-17
updated: 2026-11-17
tags: [application, catalog, install, versions]
dependsOn: [ADESK-US-205, ADESK-US-206, ADESK-US-111]
capabilities: []
---

# 用户故事：运营批准应用目录与版本管理

## 作为/我想要/以便

作为桌面用户，我想从运营批准的目录选择可选应用、检查权限并管理版本，以便可控地安装、更新、回退或移除应用。

## 范围边界

### In Scope

- 同源静态目录，构建固定 SHA-256，严格 HTTPS 来源、版本化入口和权限校验；错误条目明确报告。
- 安装集存 SQLite；所有桌面入口同源于统一登记表；刷新与离线目录失败保留已批准安装。
- 更新、回退和卸载前确认与关闭协商，停止旧实例和旧授权；失败保留可解释状态和重试。
- 初始正式目录为空，显示真实空状态；完整流程由受控的批准目录验收。

### Out of Scope

- 用户输入任意 URL 安装、远程应用源码托管、签发运营批准或替发布方制造历史版本。
- 桌面删除远程应用自己 Origin 下的数据；不可变入口是否真的不可变由发布方契约约束。

## 验收标准

| #   | 前置条件                     | 操作               | 预期结果                                               | 状态 |
| --- | ---------------------------- | ------------------ | ------------------------------------------------------ | ---- |
| 1   | 目录匹配或不匹配构建摘要     | 加载目录           | 仅批准内容可用，错误可见可重试，空目录明确显示         | ✅   |
| 2   | 部分条目非法或重复           | 加载               | 逐项拒绝且不覆盖其他授权                               | ✅   |
| 3   | 应用未安装                   | 确认安装           | Applications、启动台、聚焦与 Dock 可访问，刷新保持     | ✅   |
| 4   | 应用已安装并有新版本         | 确认更新、再回退   | 入口、版本、权限按确认版本变化，旧实例停止             | ✅   |
| 5   | 已安装应用、已有用户文件     | 卸载或取消         | 确认撤回入口与权限，用户文件和远程数据保留；取消不改变 | ✅   |
| 6   | 目录离线、写入失败或操作中断 | 重开或重试         | 已批准安装可继续启动；状态可恢复，不伪报成功           | ✅   |
| 7   | 多页打开同一可选应用或有草稿 | 更新/卸载          | 旧页授权撤回、草稿协商，取消保留会话                   | ✅   |
| 8   | 键盘用户                     | 操作商店与确认面板 | 焦点、名称、取消、错误和 axe 通过自动检查              | ✅   |

## 验收证据

已完成源码和本地正式产物验收，未发布。见[证据索引](../../evidence/2026-11-17/README.md#a04-批准应用目录与版本管理adesk-us-207)、[最终生命周期报告](../../evidence/2026-11-17/catalog-lifecycle.json)与[实现计划](../../plans/2026-11-17-approved-app-catalog.md)。

| AC | 自动证据 |
| --- | --- |
| 1 | `productionEmpty`、`unapprovedCatalogRejected`、`offlineAndReloadKeepInstallation` |
| 2 | `invalidEntriesRejected`、目录模型与来源单测 |
| 3 | `confirmationAndEntrypoints`、`dockPinLifecycle`、`packageConflictKeepsFiles` |
| 4 | `updateAndRollback`、`otherTabRevokesOldInstance` |
| 5 | `uninstallKeepsUserAndRemoteData`、取消确认、投影日志单测的包内用户文件保留 |
| 6 | `offlineAndReloadKeepInstallation`、`failedWriteRetries`、`interruptedProjectionRecovers`、`corruptStateResetsExplicitly` |
| 7 | `draftCancellationKeepsSession`：两页真实输入框填草稿，另一页 Keep Editing 后两份输入与旧版本保留；全部确认后才提交并撤销旧实例 |
| 8 | `keyboardAndAxe`：商店、安装确认与远程窗口关闭确认；焦点进入、反向 Tab、Escape 与还焦点 |

远程协议不报告草稿，当前采取逐窗口明确确认，不宣称自动保存远程文档。正式目录为空是运营输入边界，不影响机制验收；实际发布条目不在本次交付中。

## 实现文件

- `aiao-desktop/apps/web/src/app/data/`
- `aiao-desktop/apps/web/src/app/services/`
- `aiao-desktop/apps/web/src/app/apps/`
- `aiao-desktop/apps/e2e/src/groups/`
