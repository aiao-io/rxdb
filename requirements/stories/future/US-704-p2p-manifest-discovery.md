---
id: US-704
title: 文件清单与 P2P 发现
status: Backlog
priority: High
epic: epic-011-p2p-file-share
created: 2026-10-26
updated: 2026-10-26
tags: [p2p, sync, discovery, manifest]
---

# 用户故事：文件清单与 P2P 发现

## 作为/我想要/以便

**作为** 内网团队里需要共享大文件的成员
**我想要** 看到局域网里哪些机器已持有某个文件，并能与其中一台建立点对点连接
**以便** 决定从谁拉取，且「谁有」的答案在断外网时依然可用

## 范围边界

### In Scope

- `P2PFileManifest` 清单实体：`contentHash` / `fileName` / `size` / `chunkSize` / `chunkHashes` / `sourceUrl`（服务器兜底地址）/ `holderId` / `updatedAt`，经 `rxdb-plugin-sync` 上行并同步到其他机器；`holderId` 由认证身份派生，客户端不可自报。与 `rxdb-plugin-storage` 的 `StorageFileMeta` 走 `SyncType.None`（本地专属、不上行）的路线**相反**，见 [US-502](../plugin/US-502-storage-plugin.md)
- 清单可见范围与所在同步集合的读范围一致；跨租户隔离依赖部署级分离（多租户已移出 US-029），不在本故事内实现读边界
- 「谁持有 `contentHash=X`」的本地活查询：答案来自本地库，离线可答
- 浏览器对等方信令：SDP / ICE candidate 经服务器**专用信令中转路由**转发（新端点；不复用实体失效通知通道）
- 桌面对等方发现：mDNS 发现 + 直连握手
- 握手时的清单断言：宣称持有方本地无对应文件（与其清单不一致）→ 拒绝建立；与请求方是否已持有文件无关
- 持有声明的撤销与过期：心跳 TTL / 显式撤回（删除文件时），过期行退出活查询

### Out of Scope

- 字节传输本身（[US-705](US-705-p2p-byte-transfer.md)）
- 无 peer 回退服务器、认证与坏 peer 隔离（[US-706](US-706-p2p-fallback-auth.md)）
- 公网发现（STUN / TURN / DHT，见 epic 非目标）

## 验收标准

| #   | 前置条件                                            | 操作                 | 预期结果                               | 状态 |
| --- | --------------------------------------------------- | -------------------- | -------------------------------------- | ---- |
| 1   | 两台设备各持有同一 `contentHash` 的文件，清单已同步 | 任一端查询持有者列表 | 两端互见，条目含对方 `holderId`        | ⬜   |
| 2   | 服务器不可达（断外网）                              | 查询持有者列表       | 返回本地库已有清单，不报错             | ⬜   |
| 3   | 两个浏览器对等方在同一内网                          | 发起连接             | 经服务器信令完成 WebRTC 握手           | ⬜   |
| 4   | 两个桌面对等方在同一内网                            | 发起连接             | 经 mDNS 发现完成 TCP 握手              | ⬜   |
| 5   | 对端宣称持有 `contentHash=X` 但对端本地无此文件     | 建立连接             | 握手被拒，给出可诊断错误               | ⬜   |
| 6   | 清单行写入                                          | 观察同步             | 走 `rxdb-plugin-sync` 上行，不新开通道 | ⬜   |
| 7   | 持有者删除文件或离线超过心跳 TTL                    | 查询持有者列表       | 该条目不再出现，或标注不可用并触发换源 | ⬜   |

## 技术笔记

- 复用面：清单同步挂在 [SyncManager](../../../packages/rxdb-plugin-sync/src/SyncManager.ts) 管理的仓储上；信令走服务器专用中转路由（见 In Scope），不占用实体失效通知通道——`parseNotification()` 只接受带 `entity` 的消息（`packages/rxdb-adapter-http/src/change-feed.ts` 已核实）
- 可达性：全局 [reachability](../../../packages/rxdb/src/network/reachability.ts) 只回答「服务器是否可达」（`isNetworkError` 口径）；peer 级可用性靠清单心跳 TTL + 连接超时判定，回退服务器的触发条件是「无可用 peer」而非全局离线信号
- 清单是软状态：谁宣称有什么以 `contentHash` 校验兜底（US-705 AC#2），清单条目 LWW 冲突即可，不需要专用 resolver
- **推断**（未读源码核实）：桌面 mDNS 需要运行时能力——Electron 主进程可用 `bonjour` 类包，Tauri 需要 Rust 侧实现；浏览器没有 mDNS 能力，所以浏览器对等方必须经服务器信令。这一不对称在 US-707 的用例里收口

## 实现文件

- `packages/rxdb-plugin-p2p-files/`（拟新建）— 清单实体与发现模块所在包
