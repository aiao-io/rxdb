---
id: ADESK-US-202
title: 集成应用的运行宿主
status: Done
priority: High
epic: ADESK-EPIC-003
created: 2026-11-13
updated: 2026-11-13
tags: [application, orbit, micro-frontend, iframe, e2e]
dependsOn: [ADESK-US-201]
capabilities: []
---

# 用户故事：集成应用的运行宿主

## 作为/我想要/以便

**作为** 在桌面里使用集成应用的人
**我想要** 集成应用像内置应用一样开窗口、最小化、还原、关闭和切换，加载慢或打不开时有明确的状态和重试
**以便** 用独立部署的 B/S 应用时不必离开桌面，它加载失败或启动出错时只影响自己的窗口。

## 范围边界

### In Scope

- 运行内核用仓库里的 `@aiao/orbit`（[D-11](../../decisions.md#d-11集成应用经-orbit-隔离运行)）：桌面页一个运行内核，允许来源从登记表推导；每个窗口一个 Orbit 实例，应用在自己的 iframe 文档里运行，样式、脚本与路由互不干扰。
- 生命周期：打开窗口即装载应用，等应用报告就绪前显示加载状态；最小化收进 Dock 后通知应用「隐藏」，还原时先通知「显示」，iframe 不重新加载、应用状态保留；关闭窗口销毁实例并移除 iframe；退出应用关闭它的全部窗口。
- 失败与重试：入口加载失败、超过就绪时限、应用自报启动失败、应用整页导航时，窗口显示原因与「重试」「在新标签页打开」；重试新建实例。失败只影响这一个窗口。
- 窗口交互：后台的集成应用窗口盖一层激活层，点一下提到前台并把键盘焦点交给应用（首次点击只激活窗口，与 macOS 一致）；前台窗口的点击直达应用；菜单打开时点进应用先收起菜单；拖动与缩放窗口时 iframe 不截走指针事件。
- 隔离与权限：iframe 用 Orbit 的 sandbox（脚本、同源存储、表单、下载）；只授予登记表声明的浏览器权限；桌面的跨源隔离（[D-05](../../decisions.md#d-05终端依赖跨源隔离)）经 `cross-origin-isolated` 委派给应用。
- 接入契约（[D-12](../../decisions.md#d-12集成应用的接入契约)）：集成应用要满足的托管响应头、握手与就绪约定，写进[产品 README](../../../README.md#接入集成应用)。
- 冒烟用替身应用：外网全部拦截，用 Orbit 客户端的正式构建拼一个替身页面顶替 `https://vscode.aiao.io/` 的响应，验证以上行为。

### Out of Scope

- 宿主服务：桌面经 Orbit 向应用提供窗口、菜单、通知、剪贴板、文件等能力，由 [ADESK-US-206](ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 承接；OAuth 弹窗等扩展能力见 [future-requirements](../../future-requirements.md)。
- 应用拿到键盘焦点后，桌面的全局快捷键（⌘Space 等）由应用收到，桌面不响应。
- 弹出窗口（`window.open`）、`alert` / `confirm` 与顶层导航：sandbox 不放行；`showOpenFilePicker()`、`showDirectoryPicker()` 这类文件句柄 API 在跨源 iframe 里被浏览器拒绝（`SecurityError`）。应用自己的 `<input type="file">` 不在本故事验收范围，能否使用没有验收（[D-12](../../decisions.md#d-12集成应用的接入契约)）。
- 资源耗尽与运行卡死：失败隔离只覆盖加载失败、超时、应用自报失败和整页导航；应用把主线程占满或耗尽内存时，桌面没有进程级的隔离或限额（见 [ADESK-US-206](ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 的后台冻结范围外）。
- 窗口与运行实例跨刷新恢复：刷新后集成应用的窗口不恢复，与内置应用一致。
- 应用的数据：留在应用自己的来源里，桌面不读。桌面与应用不同站点时，浏览器按顶层站点分区存储，桌面里看到的与直接访问该应用的不是同一份数据。
- 非 Chromium 浏览器。

## 验收标准

| #   | 前置条件                                                       | 操作                                               | 预期结果                                                                               | 状态 |
| --- | -------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- | ---- |
| 1   | 外网全部拦截，替身应用顶替 `https://vscode.aiao.io/`，正式构建 | 从 Dock 打开 Aiao Code                             | 先显示加载状态；替身报告就绪后加载状态消失，窗口里是替身页面                           | ✅   |
| 2   | Aiao Code 已就绪                                               | 读应用里的运行环境与 iframe 属性                   | 应用里 `crossOriginIsolated` 为 true；iframe 带 Orbit 的 sandbox，`allow` 与登记表一致 | ✅   |
| 3   | Aiao Code 已就绪，在应用的输入框里输入了文字                   | 最小化进 Dock，再从 Dock 还原                      | 应用依次收到隐藏与显示通知；仍是同一个文档（iframe 没有重新加载），输入的文字还在      | ✅   |
| 4   | Aiao Code 与 Calculator 都打开，Calculator 在前台              | 点 Aiao Code 的窗口内容区，再键入文字              | Aiao Code 提到前台、菜单栏变成 Aiao Code；键入的文字出现在应用的输入框里               | ✅   |
| 5   | Aiao Code 在前台，Apple 菜单已打开                             | 点进应用的内容区                                   | 菜单收起                                                                               | ✅   |
| 6   | Aiao Code 在前台                                               | 按住右下角把手，经过应用内容区拖到更小的尺寸再松手 | 窗口尺寸跟着指针变化，松手后不再变化                                                   | ✅   |
| 7   | Aiao Code 已就绪                                               | 关闭窗口，再从 Dock 打开                           | 关闭后页面里没有 Orbit 的 iframe；再次打开是新文档，重新就绪                           | ✅   |
| 8   | 对 `https://vscode.aiao.io/` 的请求失败（模拟离线）            | 打开 Aiao Code；恢复替身后点「重试」               | 窗口显示无法打开与原因，桌面与其他窗口照常；重试后应用就绪                             | ✅   |
| 9   | 替身应用在启动时自报失败                                       | 打开 Aiao Code                                     | 窗口显示应用给出的原因与「重试」；超时、整页导航等其余失败原因的文案由单测覆盖         | ✅   |
| 10  | 外网全部拦截                                                   | 依次完成 #1～#9                                    | 没有页面错误；控制台错误只有被拦截的外网资源                                           | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：冒烟 [smoke.mjs](../../../apps/e2e/src/smoke.mjs)（`aiao-desktop-e2e:e2e`）的 `integratedApp` 检查组。替身页面用 `packages/orbit` 的正式构建，冒烟按需路由，不改桌面的正式构建。各 AC 对应的检查项：#1 `showsLoading`、`becomesReady` 与 `standinRendered`，#2 `crossOriginIsolated` 与 `iframePolicy`，#3 `minimizeHides`、`restoreShows` 与 `restoreKeepsDocument`，#4 `shieldWhenBehind`、`clickActivates` 与 `keyboardReachesApp`，#5 `appClickClosesMenu`，#6 `resizeTracksPointer`，#7 `closeRemovesFrame` 与 `reopensFresh`，#8 `offlineShowsReason`、`desktopUnaffected` 与 `retryRecovers`，#9 `appFailureShowsReason`，#10 脚本收集的页面错误与控制台错误。#6 做过反证：去掉拖动缩放时的 `pointer-events: none`，指针一进 iframe 就丢了跟踪（目标约 600×350，实得 787×492）。#9 其余失败原因的文案在 [web-app-failure.spec.ts](../../../apps/web/src/app/apps/web-app/web-app-failure.spec.ts)；Orbit 的 `focus()` 与加载后未握手的快速失败在 `packages/orbit` 的浏览器测试里。结论见[验收台账](../../verification-report.md#应用体系与集成应用)。

## 技术笔记

- Orbit 的 hide / show 不移动 iframe；窗口最小化动画结束（窗口已不可见）后才通知隐藏，还原动画开始前通知显示，动画期间看得到应用内容。
- 父页面收不到「焦点从一个跨源 iframe 移到另一个」的任何事件（2026-11-13 在 Chromium 实测：只有从父页面点进 iframe 会触发 `window` 的 `blur`），所以后台窗口盖激活层，激活后调用 Orbit 实例新增的 `focus()` 把键盘焦点交给应用。菜单打开时桌面本来就有一层遮罩盖住菜单栏以下的区域，点进应用前先收起菜单，不用另外处理。
- 入口打不开时浏览器只给 iframe 报 `load`、不报 `error`（实测连接被拒、请求中止、CORP 拦截都是如此），原来只能等满就绪时限。Orbit 改为文档 `load` 后 3 秒内未握手即以 `LOAD_ERROR` 失败，离线时几秒内就显示原因。
- 实测线上 vscode.aiao.io 在带 COEP 的宿主页里被拦（`ERR_BLOCKED_BY_RESPONSE`），补上 `Cross-Origin-Resource-Policy: cross-origin` 后能跑起工作台、`crossOriginIsolated` 为 true；这条要求写进接入契约。

## 实现文件

- `aiao-desktop/apps/web/src/app/services/orbit-host.ts` — 桌面页的 Orbit 运行内核与失败原因文案。
- `aiao-desktop/apps/web/src/app/apps/web-app/` — 集成应用的窗口内容：标题栏、Orbit 容器、加载 / 失败状态与激活层。
- `aiao-desktop/apps/web/src/app/services/desktop-window.ts`、`components/window-frame.ts` — 窗口隐藏与显示的时机。
- `packages/orbit/src/runtime.ts` — 实例的 `focus()`，以及文档加载后未握手的快速失败。
- `aiao-desktop/apps/e2e/src/smoke.mjs` — 冒烟与替身应用。

## References

- [ADESK-EPIC-003](../../epics/ADESK-EPIC-003.md)
- [D-11](../../decisions.md#d-11集成应用经-orbit-隔离运行)、[D-12](../../decisions.md#d-12集成应用的接入契约)
- [Orbit README](../../../../packages/orbit/README.md)、[来源与取舍](../../../../packages/orbit/UPSTREAM.md)
