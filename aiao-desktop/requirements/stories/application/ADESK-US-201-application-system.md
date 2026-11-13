---
id: ADESK-US-201
title: 应用体系与统一登记表
status: Done
priority: High
epic: ADESK-EPIC-003
created: 2026-11-13
updated: 2026-11-13
tags: [application, registry, micro-frontend, e2e]
dependsOn: [ADESK-US-101]
capabilities: []
---

# 用户故事：应用体系与统一登记表

## 作为/我想要/以便

**作为** 在 Aiao Desktop 里工作的人，以及给桌面接入新应用的开发者
**我想要** 随桌面构建的内置应用和独立部署的 B/S 应用登记在同一张表里，以同样的方式出现在启动台、聚焦搜索、Dock 与菜单栏
**以便** 打开和管理应用时不必分辨它从哪里来；接入一个新的 B/S 应用只需在登记表里加一项。

## 范围边界

### In Scope

- 三类应用（[D-10](../../decisions.md#d-10应用分三类登记在同一张表里)）：**系统入口**（启动台、废纸篓，不开窗口）、**内置应用**（随桌面构建的 Angular 组件，直接用桌面的服务与本地库）、**集成应用**（独立部署的 Web 应用，经 Orbit 在窗口里运行，只通过 Orbit 协议与桌面往来，见 [ADESK-US-202](ADESK-US-202-integrated-app-runtime.md)）。
- 统一登记表 [registry.ts](../../../apps/web/src/app/apps/registry.ts)：共有字段是 id、名称、图标、窗口的默认与最小尺寸、单窗口或多窗口；内置应用另有组件，集成应用另有入口：不带凭据的 HTTPS 地址、版本标识、授予的浏览器权限与就绪时限。
- 登记表校验：id 唯一且与登记键一致；集成应用的入口地址、权限与时限不合规时逐项报出应用与字段，桌面启动即失败，不跳过、不降级。Orbit 的允许来源从登记表推导，不另写一份；Orbit 自己的入口检查（保留参数等）照常生效。
- 清单与组件分开：登记表的描述部分（[app-manifests.ts](../../../apps/web/src/app/apps/app-manifests.ts)）是不依赖 Angular 的纯数据，单测直接校验真实的登记表；内置应用的组件在 `registry.ts` 里按 id 绑定，漏绑编译不过。
- 入口一致：启动台与聚焦搜索按名称找到集成应用；Dock 固定 Aiao Code 并显示运行指示；集成应用在前台时，菜单栏显示它的名字与标准应用菜单。

### Out of Scope

- 运行时安装、卸载、更新、回退，或让用户填网址添加应用；预装与受管应用在 [ADESK-US-205](ADESK-US-205-application-management.md) 中补齐 Applications 投影与保护规则。
- 应用实现的懒加载、宿主能力与窗口运行时抽象；由 [ADESK-US-206](ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 承接。
- 搜索别名（例如用 `vscode` 搜到 Aiao Code）。

## 验收标准

| #   | 前置条件                                  | 操作                                                                                                                                  | 预期结果                                                                                                                       | 状态 |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 当前登记表                                | 运行 web 单测                                                                                                                         | 每个应用的 id 唯一且等于登记键；系统入口没有组件，内置应用有组件，集成应用有入口                                               | ✅   |
| 2   | 不合规的登记表                            | 校验：id 与登记键不一致、类别与字段不配套、入口不是 HTTPS 或带用户名密码、版本标识为空、权限不在允许清单、就绪时限不在 1～120000 毫秒 | 每种情况都报出应用 id 与字段，校验失败                                                                                         | ✅   |
| 3   | 当前登记表                                | 推导 Orbit 的允许来源                                                                                                                 | 只有集成应用入口的精确来源（`https://vscode.aiao.io`），没有通配符                                                             | ✅   |
| 4   | 正式构建，视口 1440×900                   | 打开 `/?boot=0`，看 Dock                                                                                                              | 15 个入口，Aiao Code 在 Terminal 之后                                                                                          | ✅   |
| 5   | 外网全部拦截，替身应用顶替 vscode.aiao.io | 在启动台搜索 `Aiao Code` 并回车；关掉后按 ⌘Space 输入 `aiao`                                                                          | 启动台打开 Aiao Code 窗口；聚焦搜索的应用一栏列出 Aiao Code                                                                    | ✅   |
| 6   | Aiao Code 在前台                          | 看菜单栏，再选应用菜单里的 Quit Aiao Code                                                                                             | 菜单栏的应用名是 Aiao Code，应用菜单有 About、Hide、Quit Aiao Code；退出后它的窗口全部关闭、Dock 上的运行指示消失              | ✅   |
| 7   | 外网全部拦截                              | 从启动台逐个搜索并打开 29 个内置应用                                                                                                  | 29 个窗口都出现，与 [ADESK-US-101](../desktop/ADESK-US-101-desktop-shell-baseline.md) #10 一致：改登记表结构没有让内置应用回归 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：#1～#3 是 web 单测 [desktop-apps.spec.ts](../../../apps/web/src/app/services/desktop-apps.spec.ts)（`aiao-desktop-web:test`）：真实登记表合规、14 种不合规登记逐项报错、允许来源推导。#4～#7 是冒烟 [smoke.mjs](../../../apps/e2e/src/smoke.mjs)（`aiao-desktop-e2e:e2e`），替身应用见 [ADESK-US-202](ADESK-US-202-integrated-app-runtime.md)：#4 `shell.dock` 与 `integratedApp.dockPinned`，#5 `integratedApp.launchpadOpens` 与 `spotlightLists`，#6 `integratedApp.menubarName`、`appMenuItems` 与 `quitCloses`，#7 `everyAppOpens`（`unopened` 为空）。结论见[验收台账](../../verification-report.md#应用体系与集成应用)。

## 技术笔记

- 登记项按 `kind` 区分：`system`（没有组件）、`builtin`（组件）、`web`（共用的集成应用窗口组件 + `web` 入口）。窗口框架照旧只认 `component`，集成应用的组件统一是承载 Orbit 的窗口内容，入口信息从窗口所属的登记项读取。
- 校验与来源推导是纯函数，放在 `services/desktop-apps.ts` 旁边；桌面页提供登记表时先校验，不合规直接抛错。
- 本故事验收的是统一登记表与既有固定 Dock 入口；Applications 投影、预装保护、运行中临时 Dock 项和拖放固定由 [ADESK-US-205](ADESK-US-205-application-management.md) 承接。

## 实现文件

- `aiao-desktop/apps/web/src/app/services/desktop-apps.ts` — 应用类别、登记项类型、校验与允许来源推导。
- `aiao-desktop/apps/web/src/app/apps/registry.ts` — 登记表。
- `aiao-desktop/apps/web/src/app/components/dock.ts`、`components/icon-sprite.html` — Dock 固定项与 Aiao Code 图标。
- `aiao-desktop/apps/e2e/src/smoke.mjs` — 冒烟。

## References

- [ADESK-EPIC-003](../../epics/ADESK-EPIC-003.md)
- [D-10](../../decisions.md#d-10应用分三类登记在同一张表里)
- 第一版 Web Desktop 的应用描述与目录：[DESKTOP-US-202](../../../../apps/web-desktop/requirements/stories/application/DESKTOP-US-202-application-manifest.md)（另一个产品，只作参考）
