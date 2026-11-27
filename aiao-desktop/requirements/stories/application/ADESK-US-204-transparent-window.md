---
id: ADESK-US-204
title: 透明窗口与窗口接口
status: Done
priority: High
epic: ADESK-EPIC-003
created: 2026-11-13
updated: 2026-11-13
tags: [application, orbit, window, tauri, e2e]
dependsOn: [ADESK-US-202]
capabilities: []
---

# 用户故事：透明窗口与窗口接口

## 作为/我想要/以便

**作为** 在桌面里用 Aiao Code 这类自带标题栏的应用的人，以及开发集成应用的人
**我想要** 应用像 Tauri 里 `decorations: false` 的窗口一样自己画标题栏和红黄绿按钮，按钮调用桌面的关闭、最小化与缩放，标题栏空白处能拖动窗口
**以便** 应用外面不再多套一层桌面画的标题栏，在桌面里看起来就是一个原生的 Mac 应用；同一份应用直接在浏览器打开时照常是网页。

## 范围边界

### In Scope

- 窗口外观（[D-14](../../decisions.md#d-14透明窗口与窗口接口参考-tauri)）：**标准窗口**由桌面画标题栏（默认）；**透明窗口**只保留窗口的形状、阴影与缩放边，标题栏与红黄绿按钮由应用画。登记表的 `web.frame` 声明应用是否获准使用透明窗口；应用在运行时调用 `setDecorations(false)` 才真正隐藏桌面的标题栏，没调用（标准窗口、还不支持的旧版本）就保持标准窗口。
- 加载中与失败时桌面始终画自己的标题栏，窗口能拖、能关；应用就绪且已隐藏装饰后，才把标题栏交给应用。
- 窗口接口 `@aiao/orbit/window`，对齐 Tauri 的 `getCurrentWindow()`：`state`（平台、外观、桌面是否在画标题栏、是否在前台、是否缩放）、`onStateChange`、`minimize()`、`toggleMaximize()`、`close()`、`setTitle()`、`setDecorations()`；只作用于应用自己的窗口，参数不合法由桌面拒绝。宿主没有提供窗口时 `getCurrentWindow()` 返回空，相当于 Tauri 的 `isTauri()` 为假。
- 拖动区对齐 `data-tauri-drag-region`：应用给元素加 `data-orbit-drag-region`，其中的按钮、链接、输入框与 `data-orbit-no-drag` 元素挖空。SDK 跟踪布局，把区域形状上报给桌面；桌面在 iframe 上方盖同形状的拖动层，拖动与双击缩放沿用桌面标题栏的手感，后台窗口也能直接拖。
- 桌面把前台与缩放状态推给应用，应用据此把红黄绿置灰、切换缩放提示。
- 冒烟：替身应用分标准与透明两种，透明的替身自绘红黄绿与拖动区。Aiao Code 一侧由它的 [US-411](../../../../apps/aiao-vscode/requirements/stories/US-411-desktop-transparent-window.md) 承接。

### Out of Scope

- Windows、Linux 外观（平台目前只有 `macos`）；macOS 的全屏空间（绿色按钮是桌面的缩放）；透出桌面壁纸的透明背景与自定义窗口形状。
- 后台窗口第一次点击只激活窗口，点在应用自绘的红黄绿上也一样（拖动区除外）。
- 应用拿到键盘焦点后桌面快捷键不生效，与 [ADESK-US-202](ADESK-US-202-integrated-app-runtime.md) 一致。

## 验收标准

| #   | 前置条件                                             | 操作                                                                                | 预期结果                                                                                               | 状态 |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 外网全部拦截，透明替身顶替 vscode.aiao.io，正式构建  | 从 Dock 打开 Aiao Code                                                              | 加载中显示桌面标题栏；替身就绪并隐藏装饰后桌面标题栏消失，替身的标题栏贴住窗口顶部，替身知道装饰已隐藏 | ✅   |
| 2   | 透明替身已就绪                                       | 按住替身标题栏空白处拖动；再按住标题栏里的按钮拖动                                  | 第一次窗口跟着指针移动；第二次窗口不动，按钮归应用                                                     | ✅   |
| 3   | 透明替身已就绪                                       | 双击替身标题栏空白处，再点替身的绿色按钮                                            | 先缩放到铺满可用区域，再还原                                                                           | ✅   |
| 4   | 透明替身已就绪                                       | 打开 Calculator，再点回替身的标题栏                                                 | 替身先收到「不在前台」，再收到「在前台」                                                               | ✅   |
| 5   | 透明替身已就绪                                       | 点替身的黄色按钮，从 Dock 还原后点红色按钮                                          | 窗口最小化进 Dock，还原后关闭                                                                          | ✅   |
| 6   | 替身不隐藏装饰（标准窗口或旧版本）                   | 打开 Aiao Code                                                                      | 就绪后仍是桌面的标题栏                                                                                 | ✅   |
| 7   | 登记为标准窗口的应用                                 | 应用调用 `setDecorations(false)`，或传入不合法的标题、拖动区                        | 被拒绝，原因回给应用                                                                                   | ✅   |
| 8   | 真实 iframe 与端口                                   | 应用调用窗口接口、上报拖动区、改变布局、停止跟踪                                    | 宿主按顺序收到调用；拖动区挖掉按钮，布局变化后重报，停止时清空                                         | ✅   |
| 9   | 桌面正式构建，真实网络，Aiao Code 已发布透明窗口支持 | 从 Dock 打开 Aiao Code                                                              | 桌面标题栏收起，Aiao Code 的标题栏左侧是红黄绿                                                         | ✅   |
| 10  | 同上                                                 | 拖动 Aiao Code 标题栏的空白处；点绿色按钮两次；点黄色按钮再从 Dock 还原；点红色按钮 | 窗口跟着移动；缩放后还原；最小化后还原且工作台没有重新加载；窗口关闭                                   | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：#1～#6 是冒烟 [smoke.mjs](../../../apps/e2e/src/smoke.mjs)（`aiao-desktop-e2e:e2e`）：#1 `transparentWindow.chromeWhileLoading`、`chromeHiddenWhenReady` 与 `appKnowsDecorations`，#2 `dragMovesWindow` 与 `buttonsAreNotDragArea`，#3 `doubleClickZooms` 与 `maximizeButtonToggles`，#4 `focusStateReachesApp`，#5 `minimizeButtonMinimizes` 与 `closeButtonCloses`，#6 `integratedApp.standardKeepsChrome`。#7 是 `packages/orbit` 的单测 [window.spec.ts](../../../../packages/orbit/src/__tests__/window.spec.ts)，#8 是它的浏览器测试 [window.browser.spec.ts](../../../../packages/orbit/src/__tests__/window.browser.spec.ts)；拖动层形状另有 web 单测 [web-app-drag.spec.ts](../../../apps/web/src/app/apps/web-app/web-app-drag.spec.ts)。#9、#10 是线上验收 `aiao-desktop-e2e:verify-aiao-code` 的 `ownTitleBar`、`titleBarDragsWindow`、`maximizeButtonZooms`、`restoreKeepsWorkbench` 与 `reopenKeepsProject`（最小化与关闭都点 Aiao Code 自绘的按钮）。2026-11-13 先用 `--vscode-dist` 指向带透明窗口支持的本地产物，9 项全过；同日 Aiao Code 发布这一版（Pages 部署 `22477575`）后对线上重跑，9 项全过：就绪 2.9 s，终端 4.5 s 进入运行中，关闭后重开 1.9 s，桌面与应用都没有错误。结论见[验收台账](../../verification-report.md#应用体系与集成应用)。

## 技术笔记

- 拖动不能靠逐帧转发指针：在跨源 iframe 里按下鼠标后，浏览器把后续指针事件都交给 iframe，父页面收不到；所以应用只上报拖动区的形状，桌面盖拖动层，自己处理拖动。拖动层用 `clip-path: path(evenodd, …)` 挖空按钮，挖空处的命中直达 iframe。这与 Electron 的 `-webkit-app-region: drag` 一样：拖动区里的空白收不到应用自己的鼠标事件。
- `setDecorations(false)` 是运行时的选择，不是登记表一写就生效：登记表只批准「可以透明」，旧版本的应用不调用，就不会出现没有按钮可点的窗口。
- 窗口初始状态放在 Orbit 启动属性的 `orbit.window` 键里，变化经 `window.state` 事件推送；应用的请求都绑定在这个窗口自己的 Orbit 实例上，碰不到别的窗口。

## 实现文件

- `packages/orbit/src/window.ts` — 窗口接口（宿主 `serveWindow`、应用 `getCurrentWindow`、拖动区跟踪）。
- `aiao-desktop/apps/web/src/app/apps/web-app/` — 透明窗口的标题栏收放、拖动层与窗口接口的宿主实现。
- `aiao-desktop/apps/web/src/app/apps/app-manifests.ts`、`services/desktop-apps.ts` — 登记表的 `web.frame` 与校验。
- `aiao-desktop/apps/e2e/src/smoke.mjs`、`verify-aiao-code.mjs` — 冒烟与线上验收。

## References

- [ADESK-EPIC-003](../../epics/ADESK-EPIC-003.md)
- [D-14](../../decisions.md#d-14透明窗口与窗口接口参考-tauri)
- Tauri 的窗口接口：`getCurrentWindow()`、`decorations`、`data-tauri-drag-region`（<https://v2.tauri.app/learn/window-customization/>）
