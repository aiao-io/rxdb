---
id: US-908
title: DevTools 传输取消与桌面文件会话的两条已知缺陷
status: Done
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-09-11
updated: 2026-09-11
tags: [devtools, desktop, transfer, filesystem, cleanup, electron]
---

<!--
INVEST 检查清单:
- [x] Independent: 两条都在已交付代码上，不等任何前置故事
- [x] Negotiable: `cancel()` 补 await 还是把等待下沉到 sink，两案可在 plan 阶段定
- [x] Valuable: 一条让取消后盘上留垃圾，一条让 Electron 每刷新一次泄一条 host 文件会话
- [x] Estimable: 两处改动各在个位数行，判据都是已有 harness 能表达的
- [x] Small: 不改协议、不改面板、不动 provider 契约
- [x] Testable: 「CHUNK 紧跟 CANCEL」的时序与「刷新后会话计数不增」都可断言
-->

# 用户故事：DevTools 传输取消与桌面文件会话的两条已知缺陷

> 两条都是 [US-905](./US-905-tauri-native-devtools.md) 阶段 2 读代码读出来的，不是跑出来的——
> 现有用例**刻意绕开**了它们（理由见 AC#1 的技术笔记）。US-905 不修，单独在这里认领并关闭。

## 作为/我想要/以便

**作为** 在桌面宿主里用 DevTools 面板管理本地文件的开发者
**我想要** 取消上传之后盘上不留临时产物、刷新主窗口之后 host 侧不积压文件会话
**以便** 面板的「失败/取消无半写文件」与「session 全释放」两条承诺在**所有**时序下都成立，
而不只是在测试驱动挑选的那条时序下成立

## 范围边界

### In Scope

- `TRANSFER_CANCEL` 与在途 `write` 的竞态：取消路径补齐 `complete()` 已有的排空语义
- Electron 装配处接上 `DevToolsDesktopFilesystem.dispose()` 的生命周期
- 两条各自的回归判据（时序用例 / 会话计数断言）

### Out of Scope

- 改 v2 wire、错误码、transfer 状态机的对外语义（`start` / `chunk` / `complete` 的契约不动）
- 给 `discard()` 加「等句柄打开再删」的重试或轮询——那是把时序问题挪进清理路径
- Tauri 装配处：`createDesktopDevToolsProviders` 已接 `pagehide → dispose()`，本故事不重复
- 面板 UI、provider descriptor、mutation policy

## 验收标准

| #   | 前置条件                                                              | 操作                                                | 预期结果                                                                            | 状态 |
| --- | --------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- | ---- |
| 1   | 一条已 `start` 的上传，CHUNK 尚未落盘（句柄还没打开）                 | 紧跟着发 `TRANSFER_CANCEL`，随后让在途 `write` 兑现 | 取消返回 `settled/cancelled`；在途写入排空后临时产物为 0，host 根下不留 `.rxdb-tmp` | ✅   |
| 2   | Electron demo 已装配 DevTools providers，面板已建立一条 `file.*` 会话 | 刷新主窗口 N 次，读 host 侧的文件会话计数           | 计数不随刷新增长；每次刷新释放上一次的会话与它挂起的写入和锁                        | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

### AC#1 — `cancel()` 排空在途写入

[`DevToolsTransferTable`](../../../packages/rxdb-devtools/src/v2/transfer.ts) 的 `cancel()` 与
`complete()` 一样，首行先 `await entry.writes` 再结算，并照 `complete()` 那样**重新取一次 entry**
——排队期间这条传输可能已经因为写失败或超时终结。

两者排空的理由不同：`complete()` 怕 commit 出短文件，`cancel()` 怕清理扫空。清理路径的另一半是
[`deferredSink`](../../../packages/rxdb-devtools/src/native/native-files-provider.ts)，它的
`discard()` 是 `await opened?.discard()`，而 `opened` 要等 `open()` 兑现才被赋值。少了这次排空，
「CHUNK 紧跟 CANCEL」这条时序里 `discard()` 会在句柄尚未打开时命中那条空操作分支，随后兑现的
`open()` 又把 host 的 `.rxdb-tmp` 建出来——没有人再去清它。

判据必须能控制 `write` 的兑现时机。AC#10 的取消驱动先等临时产物出现再发 CANCEL，那时 `opened`
必已赋值，这条时序它按定义碰不到；绕开是故意的，那条用例要验的是「取消之后盘上干不干净」，
把两件事写进同一条断言，红了也分不出是哪一件。因此本条另立两个用例：状态机层验「在途写入未兑现
时不得结算」，provider 层把 `openWrite` 按在闸上验「盘上不留 `.rxdb-tmp`」。

### AC#2 — Electron 装配处接 `pagehide → dispose()`

[`createDevToolsDesktopFilesystem`](../../../packages/rxdb-plugin-storage/src/devtools-desktop-filesystem.ts)
返回的 `dispose()` 用来关 host 的 `file.*` 会话，两端装配处各接一行，与 Tauri 逐字相同：

```ts
globalThis.addEventListener('pagehide', () => filesystem.dispose(), { once: true });
```

它守的是**刷新**：刷新不触发 Electron `webContents` 的 `'destroyed'`（同一个 `WebContents`），
`main.ts` 挂在那上面的 `releaseTarget` 一次都不会跑；少了这一行，每刷一次泄一条文件会话，
连同它的挂起写入与它持有的路径锁，而一把没放掉的独占锁会让后来者的 `lockAcquire` 永远等下去。

判据取**会话计数不随刷新增长**而不是「dispose 被调用过」：后者在「调了但 host 没释放」的实现下
同样成立。用例因此把渲染进程的装配接到**真** `createDesktopFileBridge` 上读它的 `openSessionCount`
——该模块刻意不 import `electron`，整条会话生命周期能在 vitest 里用真实文件系统驱动，不必付
Playwright + 打包产物的代价。为此把 provider 装配从 `default` 里提成
`createDesktopDevToolsProviders`，与 Tauri 侧同名同形。

## 实现文件

- `packages/rxdb-devtools/src/v2/transfer.ts` — `cancel()` 排空在途写入（AC#1）
- `packages/rxdb-devtools/src/__tests__/v2/transfer.spec.ts` — 在途写入未兑现时不得结算（AC#1，状态机层）
- `packages/rxdb-devtools/src/__tests__/native/native-files-provider.spec.ts` — 句柄仍在打开时取消不留临时产物（AC#1，provider 层）
- `apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts` — `createDesktopDevToolsProviders` 接 `pagehide → dispose()`（AC#2）
- `apps/dev-rxdb-electron/src/app/setup_rxdb_devtools.spec.ts` — 对真 host 桥读 `openSessionCount`，刷新后不增（AC#2）

## References

- [US-904 DevTools 原生本地存储调试](./US-904-devtools-native-storage-contract.md) — v2 transfer 状态机的真相源
- [US-905 Tauri DevTools 调试窗口](./US-905-tauri-native-devtools.md) — 两条缺陷的发现处
- [US-906 Electron 桌面端 DevTools 面板的开发者可用路径](./US-906-electron-devtools-developer-path.md) —
  AC#2 落在这条路径的装配处

---

> 写作规范（证据锚点 / 结论复验 / 大故事分阶段 / 价值待证）、命名与状态约定见
> [CONVENTIONS.md](../../CONVENTIONS.md)。
