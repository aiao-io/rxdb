---
id: US-704
title: 文件清单与 P2P 发现
status: In Progress
priority: High
epic: epic-011-p2p-file-share
created: 2026-10-26
updated: 2026-11-04
tags: [p2p, sync, discovery, manifest]
---

# 用户故事：文件清单与 P2P 发现

## 作为/我想要/以便

**作为** 内网团队里需要共享大文件的成员
**我想要** 看到局域网里哪些机器已持有某个文件，并能与其中一台建立点对点连接
**以便** 决定从谁拉取，且「谁有」的答案在断外网时依然可用

## 开工前置

epic-011 已由 owner 解锁（见[解锁记录](../../epics/epic-011-p2p-file-share.md#价值待证)）。
现有 HTTP 示例只检查可选 Bearer header 的格式，不提供身份校验；不能把客户端 auth hook 当成服务端认证。

**认证宿主选型（owner 决定，2026-11-04）**：Supabase Auth 负责身份，Cloudflare Worker 负责信令与连接凭据。
参考宿主是独立 demo 项目 `apps/dev-rxdb-p2p`（见 [US-707](US-707-p2p-cross-runtime-e2e.md#交付形态)）。
合同如下，随 PR #172 评审：

| 项                   | 合同                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| token 签发者         | Supabase Auth（GoTrue）签发的 access token；认证主体 `principal` 取 `auth.uid()`                                                                                                                       |
| 服务端校验位置       | 信令 Durable Object 收到 WebSocket 第一条消息时，带该 token 调 Supabase `/auth/v1/user` 取用户；不采信客户端自报的用户                                                                                 |
| 用户与设备           | 设备登记在 Supabase 表 `p2p.devices`，RLS 只许本人登记、读取、删除，`deviceId` 即其主键；信令 DO 以该用户身份经 PostgREST 查设备归属，查不到即拒绝（冒用他人设备）                                     |
| 清单读写授权         | `p2p.p2p_file_manifest` 开 RLS：已认证用户可读（读范围同部署，见 In Scope）；写、删只许 `holderId` 等于由 `auth.uid()` 与本人登记的某台设备派生的值，派生算法与 `deriveHolderId` 相同，由 SQL 函数实现 |
| 信令授权             | 信令 DO 只在已认证的连接之间转发 offer / answer / ice；建连时为双方各签一张绑定 `connectionId` 的连接票据（Ed25519，私钥只在 Worker），会话的 `authenticate` 用公钥验签                                |
| 凭据有效期与离线校验 | 连接票据只用于 hello，短期有效；公钥可缓存，验签不依赖服务器在线。桌面离线凭据（AC#8）沿用同一公钥体系，有效期随 US-707 阶段 B 确定。无效凭据一律拒绝，服务器失联不跳过认证                            |

## 范围边界

### In Scope

- 内容清单按 `contentHash` 唯一登记 `fileName` / `size` / `chunkSize` / `chunkHashes` / `sourceUrl`（服务器地址）；持有声明单独以 `(contentHash, holderId)` 记录获得/撤回，经 `rxdb-plugin-sync` 同步。`holderId` 必须关联认证宿主验证过的用户与设备，不能只用同一用户在多设备共用的 userId，也不能由客户端任意自报。与 `rxdb-plugin-storage` 的 `StorageFileMeta` 走 `SyncType.None`（本地专属、不上行）的路线**相反**，见 [US-502](../plugin/US-502-storage-plugin.md)
- 清单可见范围与所在同步集合的读范围一致；跨租户隔离依赖部署级分离（多租户已移出 US-029），不在本故事内实现读边界
- 「谁曾声明持有 `contentHash=X`」的本地活查询来自持久清单，离线可答；是否当前可连接另由 presence/探测回答，不把缓存声明等同在线保证
- 浏览器对等方信令：SDP / ICE candidate 经服务器**专用信令中转路由**转发（新端点；不复用实体失效通知通道）
- 桌面对等方发现：mDNS 发现 + 直连握手
- 请求时的持有断言：宣称持有方本地无对应文件（与其清单不一致）→ 拒绝该内容的请求，会话保留给对端确实持有的其它内容（会话层见 [US-708](US-708-p2p-peer-session.md)）；与请求方是否已持有文件无关
- 持有声明只在获得文件或显式删除文件时更新；设备在线状态来自信令 presence、桌面 mDNS 或连接探测，心跳不写同步实体。presence TTL 到期只使在线信息未知，不能删除持久持有声明；本地探测成功可恢复可用状态

### Out of Scope

- 字节传输本身（[US-705](US-705-p2p-byte-transfer.md)）
- 无 peer 回退服务器、认证与坏 peer 隔离（[US-706](US-706-p2p-fallback-auth.md)）
- 公网发现（STUN / TURN / DHT，见 epic 非目标）

## 验收标准

认证宿主选定前，下表依赖身份的条目只是待验收范围；协议层单元测试不能替代其中任何一条。

| #   | 前置条件                                                                    | 操作                          | 预期结果                                                                                     | 状态 |
| --- | --------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------- | ---- |
| 1   | 两台设备各持有同一 `contentHash` 的文件，清单已同步                         | 任一端查询持有者列表          | 两端互见，条目含对方 `holderId`                                                              | ⬜   |
| 2   | 服务器不可达（断外网）                                                      | 查询持有者列表                | 返回本地库持有声明，不误标为已确认在线；不报错                                               | ⬜   |
| 3   | 两个浏览器对等方在同一内网                                                  | 发起连接                      | 经服务器信令完成 WebRTC 握手                                                                 | ⬜   |
| 4   | 两个桌面对等方在同一内网                                                    | 发起连接                      | 经 mDNS 发现完成 TCP 握手                                                                    | ⬜   |
| 5   | 对端宣称持有 `contentHash=X` 但对端本地无此文件                             | 在已建立的会话上请求 X        | 该请求被拒，给出可诊断错误；会话保留，可继续请求对端确实持有的内容                           | ⬜   |
| 6   | 清单行写入                                                                  | 观察同步                      | 走 `rxdb-plugin-sync` 上行，不新开通道                                                       | ⬜   |
| 7   | 持有者显式删除文件；另有 presence TTL 到期                                  | 查询持有者列表                | 显式删除撤回声明；TTL 到期仅使在线信息未知，持有声明保留，可经局域网探测重新确认             | ⬜   |
| 8   | 同步服务器不可达已超过 presence TTL，两个桌面 peer 持有效离线凭据且文件仍在 | 查询并通过局域网发现/探测连接 | 持有声明保留、局域网可用 peer 仍能连接；不依赖服务端心跳续期，不触发同步心跳写入             | ⬜   |
| 9   | 选定的认证宿主、合法用户的两台设备与伪造 token/设备标识                     | 写持有声明、请求信令与握手    | 两设备可分别撤回自己的持有声明；未认证及冒用设备均被服务端拒绝；记录认证入口与服务端交付归属 | ⬜   |

## 技术笔记

- 复用面：清单同步挂在 [SyncManager](../../../packages/rxdb-plugin-sync/src/SyncManager.ts) 管理的仓储上；信令走服务器专用中转路由（见 In Scope），不占用实体失效通知通道——`parseNotification()` 只接受带 `entity` 的消息（`packages/rxdb-adapter-http/src/change-feed.ts` 已核实）
- 可达性：全局 [reachability](../../../packages/rxdb/src/network/reachability.ts) 只回答「服务器是否可达」（`isNetworkError` 口径）；peer 级可用性由独立 presence、局域网发现与连接超时判定，回退服务器的触发条件是「无可用 peer」而非全局离线信号
- 内容清单确定块划分，持有声明按设备独立更新；字节正确性仍以 `contentHash` 校验（US-705 AC#2）。离线期间可保留失效声明，实际连接时探测；不把服务端失联推断为局域网 peer 离线
- **推断**（未读源码核实）：桌面 mDNS 需要运行时能力——Electron 主进程可用 `bonjour` 类包，Tauri 需要 Rust 侧实现；浏览器没有 mDNS 能力，所以浏览器对等方必须经服务器信令。这一不对称在 US-707 的用例里收口

## 实现文件

- `packages/rxdb-plugin-p2p/src/manifest.ts` — 持有声明、由认证主体与设备派生 `holderId`、撤回与单调墓碑
- `packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts` / `src/plugin.ts` — 经同步复制的清单实体与插件登记
- `packages/rxdb-plugin-p2p/src/discovery.ts` — 本地清单发现与信令接口（宿主接入待做）
- `packages/rxdb-plugin-p2p/src/files-protocol.ts` — 请求时的持有断言（`not_holder`），会话层见 [US-708](US-708-p2p-peer-session.md)
