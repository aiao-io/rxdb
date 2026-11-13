---
id: ADESK-US-104
title: 窗口布局跨刷新保留
status: Backlog
priority: High
epic: ADESK-EPIC-002
created: 2026-11-13
updated: 2026-11-13
tags: [desktop, window, persistence]
dependsOn: [ADESK-US-102, ADESK-US-206]
capabilities: []
---

# 用户故事：窗口布局跨刷新保留

## 作为/我想要/以便

**作为** 在浏览器里使用 Aiao Desktop 的人
**我想要** 打开过的窗口在刷新后恢复位置、大小与状态
**以便** 刷新或误关标签页后不用重新摆窗口，像重启了一台真电脑。

## 范围边界

### In Scope

- 打开的窗口记录进系统偏好（照 [ADESK-US-102](ADESK-US-102-local-data-and-real-disk.md) 的偏好表）：appId、几何、缩放与最小化状态、开窗参数（Finder 路径等）。
- 刷新后按记录恢复：内置应用与集成应用一视同仁；几何经现有 keepOnScreen 修正；恢复失败的窗口跳过并给出可见反馈，不阻塞桌面启动。
- 布局变化写回防抖；用户主动关闭的窗口不恢复；多窗口应用各自的窗口分别恢复。
- 集成应用恢复等于重新开窗并走 Orbit 装载与就绪（[D-11](../../decisions.md#d-11集成应用经-orbit-隔离运行) 语义不变）；透明窗口按 [D-14](../../decisions.md#d-14透明窗口与窗口接口参考-tauri) 由应用在运行时收起桌面装饰。
- 重型应用的载荷延后：终端（会拉起虚拟机）与几猫3A大作（1.4 MB 的 3D 游戏）恢复时只重建窗口外框，内容在窗口第一次成为前台时才加载，与 [ADESK-US-206](../application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 的「启动不请求应用载荷」一致；其余应用立即加载还是同样延后，实现时定，不改变 AC#7。

### Out of Scope

- 应用内部状态（滚动位置、选中项、表单内容）。
- 桌面图标位置（US-102 已存）与 Dock 布局（见 [ADESK-US-205](../application/ADESK-US-205-application-management.md)）。
- 崩溃前的精确快照与恢复协议。

## 验收标准

| #   | 前置条件                                                                  | 操作     | 预期结果                                                                                             | 状态 |
| --- | ------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- | ---- |
| 1   | 打开 Finder（停在 Documents）、Notes、Terminal，摆开窗口并把 Notes 最小化 | 刷新页面 | 三个窗口恢复原位置与大小，Notes 仍最小化，Finder 停在原路径                                          | ⬜   |
| 2   | 打开两个 Finder 窗口                                                      | 刷新     | 两个窗口都恢复                                                                                       | ⬜   |
| 3   | 打开 Aiao Code（集成应用）窗口                                            | 刷新     | 窗口按原几何恢复并重新握手就绪；透明窗口恢复后由应用收起桌面标题栏                                   | ⬜   |
| 4   | 打开窗口后主动关闭其中一个                                                | 刷新     | 已关闭的不恢复，其余恢复                                                                             | ⬜   |
| 5   | 保存的布局里有已下线的应用（清单移除）                                    | 刷新     | 该窗口被跳过并有可见提示，桌面其余正常启动                                                           | ⬜   |
| 6   | 把窗口拖到屏幕边缘后视口变小                                              | 刷新     | 恢复的窗口拉回屏幕内（复用 keepOnScreen）                                                            | ⬜   |
| 7   | 保存的布局里有终端与几猫3A大作的窗口                                      | 刷新页面 | 窗口外框按原位置恢复，但启动阶段不拉起虚拟机、不请求 `saltline.html`；窗口第一次成为前台时才加载内容 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：第 1～7 条由 `aiao-desktop-e2e:e2e` 的窗口恢复检查组覆盖（正式构建、中途刷新、外网拦截）；布局写回的防抖与几何修正由窗口管理单测覆盖。集成应用的恢复在第 3 条里用替身应用验收，线上 Aiao Code 的组合在 `verify-aiao-code` 里补一轮。

## 技术笔记

- `WindowManager` 的窗口列表是运行时 signal；布局落 `SystemPreference`（key 形如 `windows:layout`），窗口几何事件在 window-frame 里已有来源。
- 恢复时机在 FileSystem ready 之后：Finder 等读磁盘的窗口不能在磁盘未挂载时打开，恢复入口放在桌面启动流程的后段，窗口经 [ADESK-US-206](../application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md) 的应用运行时创建（先 loading 再载荷），所以本故事排在 206 之后。
- 集成应用恢复会带来一次额外的 Orbit 装载，与「恢复中」状态合并展示，不算失败重试。

## 实现文件

- `aiao-desktop/apps/web/src/app/services/window-manager.ts` — 布局收集与恢复。
- `aiao-desktop/apps/web/src/app/services/desktop-window.ts`、`components/window-frame.ts` — 几何事件与恢复参数。
- `aiao-desktop/apps/web/src/app/data/preferences.ts` — 布局持久化。
- `aiao-desktop/apps/e2e/src/smoke.mjs` — 窗口恢复检查项。

## References

- [ADESK-US-102 本地数据与真实磁盘](ADESK-US-102-local-data-and-real-disk.md)
- [D-07 系统数据存在本地 SQLite](../../decisions.md#d-07系统数据存在本地-sqlite)
