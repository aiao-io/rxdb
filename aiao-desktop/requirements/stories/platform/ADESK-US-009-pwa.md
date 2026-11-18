---
id: ADESK-US-009
title: PWA 安装与离线桌面
status: Done
priority: High
epic: ADESK-EPIC-001
created: 2026-11-16
updated: 2026-11-16
tags: [platform, pwa, offline]
dependsOn: [ADESK-US-102, ADESK-US-106]
capabilities: []
---

# 用户故事：PWA 安装与离线桌面

## 作为/我想要/以便

**作为** Aiao Desktop 的桌面 Chrome 用户
**我想要** 把桌面安装为独立窗口，并在离线时重新打开本地应用与数据
**以便** 断网后仍能继续使用自己的桌面。

## 范围边界

### In Scope

- 浏览器原生安装入口：应用清单、独立窗口、普通图标与 maskable 图标。
- 生产构建启用 Angular Service Worker；开发构建不注册。
- 桌面启动稳定后预缓存桌面 HTML、应用 JS/CSS、SQLite WASM 与图标。内置组件和数据种子仍按需执行；后台预缓存单独于运行时懒加载验收。
- 终端的 assets/vendor、媒体与同源游戏资源按需缓存，不随安装全量下载；这些资源更新后也在下次使用时下载。
- 离线重开、首次打开已预缓存的内置应用、读取 SQLite 用户数据；网络恢复后继续联网。
- 新版后台下载，当前页面继续使用原版；用户刷新或重开后切换到已缓存的新版，保留本地数据。
- 静态托管保留 COOP / COEP，更新清单与 Worker 使用 no-cache。

### Out of Scope

- 远程集成应用、外网字体、壁纸、地图、天气及 npm/pip 下载的离线保证。
- 离线首次下载未缓存的终端运行时与游戏；账号、同步、推送与后台业务写入。
- 操作系统安装对话框、Dock 启动与物理键盘快捷键的人工验收；本故事以 Chromium 的安装条件检查与正式构建浏览器冒烟为证据。
- Safari、Firefox、移动端真机及本次生产发布。

## 验收标准

| #   | 前置条件                          | 操作                               | 预期结果                                                               | 状态 |
| --- | --------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- | ---- |
| 1   | 正式构建、桌面 Chromium           | 加载桌面并检查安装条件             | 清单和图标可解析，浏览器无安装条件错误，独立窗口模式                   | ✅   |
| 2   | 首次联网、Service Worker 安装完成 | 检查缓存                           | 桌面代码与 SQLite WASM 已缓存；终端 assets/vendor 未预下载             | ✅   |
| 3   | 已写入文件夹、备忘录与外观设置    | 切断网络、刷新桌面并首次打开计算器 | HTML 来自 Service Worker，桌面可用，计算正确，数据保留，跨源隔离仍成立 | ✅   |
| 4   | 已离线启动                        | 恢复网络并绕过缓存请求清单         | 网络请求成功                                                           | ✅   |
| 5   | 当前页面已打开                    | 同源切换新版产物并触发检查         | 当前页不刷新；新版完整缓存后，手动刷新切到新版，用户数据保留           | ✅   |
| 6   | 改动完成                          | 运行产品 verify                    | lint、类型、覆盖率、构建、需求门禁与冒烟通过                           | ✅   |

## 验收证据

正式构建检查组：[pwa.mjs](../../../apps/e2e/src/groups/pwa.mjs)，由 [smoke.mjs](../../../apps/e2e/src/smoke.mjs) 运行。

- AC#1：`pwa.manifest`、`pwa.installable`、`pwa.workerControlsDesktop`。
- AC#2：`pwa.desktopPrecached`、`pwa.largeResourcesLazy`、`pwa.lazyResourceOffline`。
- AC#3：`pwa.offlineReload`、`pwa.offlineFirstAppLaunch`、`pwa.offlineDataIntact`、`pwa.offlineIsolation`。
- AC#4：`pwa.onlineRecovery`。
- AC#5：`pwa.updateWaitsForReload`、`pwa.updatedAfterReload`、`pwa.dataSurvivesUpdate`。更新夹具只改正式产物 HTML 与对应哈希，保留同一个 Origin；不模拟 Worker 或缓存 API。
- AC#6：`pnpm nx run aiao-desktop:verify --parallel=1`。

本轮记录：[2026-11-16 验收证据](../../evidence/2026-11-16/pwa.md)。源码基线 `1111da18b6` 加本次工作区改动，darwin arm64 / Node v26.12.0 / 无头 Chromium 158.0.8127.18。PWA 专项与 PWA / 终端联跑均通过。首次 verify 的终端组启动失败在隔离复跑及联跑通过；路线图漏记导致的需求门禁失败已修复并复验。首次失败保留在证据中，不将聚合命令首次退出码改写为成功。

## 实现文件

- `aiao-desktop/apps/web/project.json`、`ngsw-config.json`：生产构建与缓存策略。
- `aiao-desktop/apps/web/src/app/app.config.ts`：Worker 注册。
- `aiao-desktop/apps/web/src/index.html`、`public/manifest.webmanifest`、`public/icons/`：安装元数据与图标。
- `aiao-desktop/apps/web/public/_headers`、`tools/serve-static.mjs`：生产与本机预览响应。
- `aiao-desktop/apps/e2e/src/groups/pwa.mjs`：安装、离线与更新回归。

## References

- [D-21 PWA 安装与缓存边界](../../decisions.md#d-21pwa-安装与缓存边界)
- [使用与验证说明](../../../README.md#pwa-安装与离线使用)
