---
id: ADESK-US-103
title: 内置游戏「几猫3A大作」
status: Done
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-13
updated: 2026-11-13
tags: [desktop, builtin-app, game, iframe]
dependsOn: [ADESK-US-101]
capabilities: []
---

# 用户故事：内置游戏「几猫3A大作」

## 作为/我想要/以便

**作为** 在桌面里歇一会儿的人
**我想要** 从启动台或聚焦搜索打开「几猫3A大作」（随桌面一起发布的单文件 3D 射击游戏），在桌面的窗口里玩
**以便** 不离开桌面就能玩，游戏随桌面一起发布、一起更新。

## 范围边界

### In Scope

- 登记为内置应用 `saltline`：显示名取游戏自己的标题「几猫3A大作」，图标是长着猫耳的准星（用游戏自己的墨黑、信号橙与骨白），窗口 1120×700、最小 640×400，单窗口；启动台排在 Books 之后，聚焦搜索按名称找得到，不钉在 Dock 上。
- 游戏文件 `apps/web/public/saltline.html`（three.js 与音效都打包在文件里）随桌面构建原样发布到产物根目录；窗口里的 iframe 按相对地址加载它，与桌面同源，不经 Orbit（[D-15](../../decisions.md#d-15随桌面发布的单文件游戏在同源-iframe-里运行)）。游戏自己的指针锁定、全屏、手柄、暂停与设置（localStorage 的 `saltline.settings.v1`）照常可用。
- 窗口这一侧只做四件事：游戏文档加载完时窗口在前台，就把键盘焦点交给游戏；后台时盖激活层，点一下只激活窗口，再把键盘焦点交给游戏；拖动、缩放窗口时 iframe 不截走指针；关闭窗口即销毁游戏文档。
- 单测守住入口：相对地址、文件随构建发布、登记名就是游戏标题、游戏不引用外部资源（桌面带 COEP，外部资源会被拦下）。

### Out of Scope

- 最小化时暂停游戏：桌面不通知游戏。游戏在退出指针锁定（Esc）与页面隐藏时自己暂停，用鼠标点到桌面之前必然先退出指针锁定；但隐藏的窗口里游戏循环照常运行（已暂停时只渲染暂停画面）。
- 钉在 Dock 上、桌面图标、窗口跨刷新恢复。
- 游戏本身的玩法、内容与平衡：由游戏文件负责，桌面原样发布，不改动它。
- 性能隔离：同源 iframe 与桌面共用渲染主线程。没有 GPU 加速的环境（CI 的无头 Chromium 只有软件 WebGL，约每秒 1 帧）里，游戏开着时整个桌面都会变慢。
- 游戏拿着键盘焦点时的桌面快捷键（与集成应用相同，按键只送到游戏）。
- Safari、Firefox 与触屏（游戏自带触屏操控，桌面这一侧没有验收）。

## 验收标准

| #   | 前置条件                         | 操作                               | 预期结果                                                                                        | 状态 |
| --- | -------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| 1   | 桌面正式构建                     | 在启动台搜索「几猫3A大作」并回车   | 打开游戏窗口：桌面画的标题栏有红黄绿与「几猫3A大作」，菜单栏显示应用名                          | ✅   |
| 2   | 同上                             | 在聚焦搜索里输入「3A」             | 结果里列出「几猫3A大作」                                                                        | ✅   |
| 3   | 游戏窗口已打开                   | 读窗口里的 iframe                  | 加载的是与桌面同源的 `/saltline.html`，没有 sandbox，授予 `fullscreen; gamepad`，游戏里全屏可用 | ✅   |
| 4   | 游戏窗口刚打开                   | 直接按键                           | 按键送到游戏文档，打开即可用键盘                                                                | ✅   |
| 5   | 游戏窗口在其他窗口后面           | 点一下游戏画面，再按键、再点       | 窗口提到前台、菜单栏换成游戏；第一下不送进游戏，之后的按键与点击都送到游戏                      | ✅   |
| 6   | 游戏窗口在前台                   | 按住右下角把手，经过游戏画面往里拖 | 窗口尺寸跟着指针走                                                                              | ✅   |
| 7   | 游戏窗口已打开                   | 关闭窗口，再从启动台打开           | 关闭后游戏文档被移除；再打开是新的游戏文档                                                      | ✅   |
| 8   | 真实游戏文件                     | 打开游戏，等它启动                 | 游戏在桌面的跨源隔离下启动到标题画面，没有启动错误，桌面页面也没有错误                          | ✅   |
| 9   | 真实游戏文件，Chrome 有 GPU 加速 | 点「开始行动」进入游戏，再按 Esc   | 指针锁定生效、约每秒 60 帧；Esc 退出锁定、游戏暂停；游戏开着时桌面照常响应                      | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：#1～#8 是冒烟 `aiao-desktop-e2e:e2e`（[smoke.mjs](../../../apps/e2e/src/smoke.mjs)）的 `game` 检查组，与 AC 对应：#1 `launchpadOpens`、`titleBar`，#2 `spotlightLists`，#3 `sameOriginFrame`、`fullscreenAllowed`，#4 `keyboardOnOpen`，#5 `shieldWhenBehind`、`clickActivates`、`inputReachesGame`，#6 `resizeTracksPointer`，#7 `closeRemovesFrame`、`reopensFresh`，#8 `realGameBoots`；#1～#7 用替身页顶替 `/saltline.html`（记录按键、点击与文档身份），#8 换回真游戏，等到 `__ready` 后检查 `__fatal`、`__errors`、`crossOriginIsolated` 与标题画面。游戏也在「每个应用都能从启动台打开」里。2026-11-13 在本分支的正式构建上，#4 先暴露了启动台抢焦点的竞态（见技术笔记），修复后连跑两轮全部通过，`unopened` 为空、没有页面错误，整份冒烟约 115 秒，其中真游戏在无头 Chromium 里约 40 秒启动到标题画面。#9 是同日在本机 Chrome 157（Apple M1 Max，ANGLE Metal）上对同一份正式构建的真实浏览器操作（脚本驱动）：从启动台打开到标题画面 15.7 秒，画质自动选 high；「开始行动」后指针锁定生效、约 60 帧每秒；Esc 后退出锁定并进入暂停；游戏开着时从 Dock 打开计算器 65 毫秒；最小化后游戏循环仍是每秒 60 帧（停在暂停画面），即 Out of Scope 里的限制。入口的单测见 [saltline.spec.ts](../../../apps/web/src/app/apps/saltline/saltline.spec.ts)。结论见[验收台账](../../verification-report.md#浏览器冒烟)。

## 技术笔记

- 无头 Chromium（冒烟与 CI 用的 headless shell）里同源 iframe 也拿不到指针锁定（`pointerlockerror`），所以指针锁定只在 #9 的真 Chrome 上验收；全屏许可在冒烟里读游戏文档的 `document.fullscreenEnabled`。
- 真游戏在无头 Chromium 里软件渲染约每秒 1 帧，整页（同一个主线程）跟着变慢，所以冒烟只在最后启动一次真游戏，之后马上关掉；替身页与真游戏用同一个路由开关切换。
- 激活层与集成应用相同：父页面收不到 iframe 里的指针事件，窗口不在前台时盖一层，第一下只激活窗口，再 `contentWindow.focus()` 把键盘焦点交给游戏。同源文档没有跨源 iframe 的 `focus-without-user-activation` 限制，所以加载完就能直接给焦点。
- 游戏文件 1.4 MB，`.prettierignore` 排除；ESLint 的 Angular 模板规则会解析它，当前通过。
- 冒烟的 #4 暴露了启动台的一个竞态：启动台打开后延时 120 毫秒聚焦搜索框，自动化回车打开应用再过 90 毫秒新窗口出现，替身页加载极快，焦点刚交给游戏就被这个定时器抢回搜索框，启动台随即移除、焦点落到 body（单独复现约三分之一的概率）。修复是启动台已在关闭时不再聚焦（`launchpad.ts`）；人手操作不会这么快，真游戏的文档也要几百毫秒才加载完，所以只有自动化撞得上。

## 实现文件

- `aiao-desktop/apps/web/public/saltline.html` — 游戏本体，原样发布。
- `aiao-desktop/apps/web/src/app/apps/saltline/saltline.ts`、`saltline.scss` — 窗口内容：同源 iframe、激活层、拖动与缩放时的指针穿透。
- `aiao-desktop/apps/web/src/app/apps/saltline/saltline-entry.ts` — 入口常量（相对地址）。
- `aiao-desktop/apps/web/src/app/apps/app-manifests.ts`、`registry.ts`、`services/desktop-apps.ts` — 登记项、组件绑定与启动台顺序。
- `aiao-desktop/apps/web/src/app/components/icon-sprite.html` — 图标 `app-saltline`。
- `aiao-desktop/apps/web/src/app/components/overlays/launchpad.ts` — 启动台关闭时不再抢焦点。
- `aiao-desktop/apps/e2e/src/smoke.mjs` — `game` 检查组。

## References

- [ADESK-EPIC-002](../../epics/ADESK-EPIC-002.md)
- [D-10](../../decisions.md#d-10应用分三类登记在同一张表里)、[D-15](../../decisions.md#d-15随桌面发布的单文件游戏在同源-iframe-里运行)
