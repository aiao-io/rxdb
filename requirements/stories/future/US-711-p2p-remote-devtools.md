---
id: US-711
title: 远程 DevTools：经 P2P 会话检查另一台设备上的库
status: Backlog
priority: Low
epic: epic-012-p2p-lan-collaboration
created: 2026-11-03
updated: 2026-11-03
tags: [p2p, devtools, debugging]
---

# 用户故事：远程 DevTools

## 作为/我想要/以便

**作为** 排查问题的开发者
**我想要** 在自己电脑的 DevTools 面板里，检查局域网里另一台设备上的库（手机浏览器、Tauri 应用、测试机）
**以便** 不必在那台设备上安装调试工具，也不用导出数据

## 解锁条件

价值待证（[epic-012](../../epics/epic-012-p2p-lan-collaboration.md#价值待证)）。提请解锁的信号：具名团队需要调试无法直接打开 DevTools 的设备上的库。

## 范围边界

### In Scope

- **传输**：DevTools 连接器的传输层改由 P2P 会话承载。连接器的传输层本来就可以注入（[`DevToolsOptions.transport`](../../../packages/rxdb-devtools/src/connector-types.ts)），且已有 Tauri 宿主的实现（`apps/dev-rxdb-tauri/src/devtools/tauri-connector-transport.ts`）。
- **授权**：只限同一认证主体。被检查端每次建立会话都要本地确认，并且可以随时断开。
- **只读缺省**：缺省只读，因为 DevTools 能读写、导出整个库。写操作需要被检查端额外确认。
- **导出文件**：沿用 DevTools 的传输会话语义；取消或断开后清理临时文件，同 [US-908](US-908-devtools-transfer-session-defects.md)。

### Out of Scope

- 跨用户远程检查
- 面板本身的新功能（[US-902](US-902-devtools-panel.md) 的范围）

## 验收标准

| #   | 前置条件                                     | 操作                 | 预期结果                                 | 状态 |
| --- | -------------------------------------------- | -------------------- | ---------------------------------------- | ---- |
| 1   | 同一用户的两台设备已建立会话，被检查端已确认 | 打开远程面板         | 能浏览实体与查询，结果与被检查端本地一致 | ⬜   |
| 2   | 被检查端拒绝或未确认                         | 打开远程面板         | 连接被拒，不暴露任何数据                 | ⬜   |
| 3   | 两台设备属于不同用户                         | 请求远程检查         | 被拒                                     | ⬜   |
| 4   | 只读模式                                     | 面板发起写操作       | 被拒，被检查端数据不变                   | ⬜   |
| 5   | 远程面板导出文件进行中                       | 取消导出，或断开会话 | 被检查端不残留临时文件                   | ⬜   |
| 6   | 被检查端断开                                 | 观察面板             | 面板显示已断开，不残留会话               | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：两台真实设备（或两个运行时实例）之间的远程检查用例，随实现补齐。

## 技术笔记

- **线格式不变**：DevTools v2 线格式的信封自带 `protocol: 2` 与 `sessionId`（[`v2/wire.ts`](../../../packages/rxdb-devtools/src/v2/wire.ts)），中继只做宽外层判定，见 [`wire/relay.ts`](../../../modules/rxdb-devtools-panel/wire/relay.ts) 的 `@fileoverview`。经 P2P 会话承载时，它作为会话上的一个命名协议，线格式本身不改。
- **依赖**：US-708 会话层；US-704 选定的认证宿主，用于判定同一认证主体。
