---
id: US-708
title: P2P 会话层：一对设备一条会话、多协议复用
status: In Review
priority: High
epic: epic-011-p2p-file-share
created: 2026-11-03
updated: 2026-11-04
tags: [p2p, session, multiplexing, protocol, webrtc, tcp]
---

# 用户故事：P2P 会话层

## 作为/我想要/以便

**作为** 要从同一台同事机器拉取多个文件的成员，以及要在 P2P 通道上接入新协议的维护者
**我想要** 与一台设备只建一条已认证的会话，在这条会话上并行收发多个文件，并让多种协议按名称与版本协商共存
**以便** 不必为每个文件重走信令与连接握手；新增协议不会让旧版本的对端断连

## 解决的问题

会话层之前的协议层把一条连接绑死在一个文件上，旧实现可用 `git show 402bebaf:packages/rxdb-plugin-p2p-files/src/transport.ts` 取回。它有四处缺陷：

1. **一条连接只服务一个文件。** `createP2PTransportPeer` 用单个 `manifest` 构造会话，块处理器拒绝其它内容（`'contentHash is not served by this peer'`），会话又独占传输的接收循环。从同一台设备拉 N 个文件，需要 N 次信令和 N 次连接握手。
2. **握手按内容授权。** `validateHandshake` 把 token 绑到 `connectionId` 与 `contentHash`，并在握手时断言对端持有该内容。「对端是谁」与「这次能拿什么」混在连接这一级。
3. **帧格式没有版本，也没有协商。** 帧只有块请求与响应两类，未知类型即抛错、会话随即关闭；任何新增的消息类型都会让旧版本的对端断连。
4. **没有取消，也没有心跳。** 请求方超时或取消时只摘掉本端的等待者，供块端照样读盘、发送；对端失联要等下一次请求失败才发现。

## 范围边界

### In Scope

- **会话**：一对设备（按认证身份与实例区分）一条会话，承载多个命名协议；双方同时拨号时确定性去重，只保留一条
- **建连协商**：会话开始时交换 hello，内容为设备身份凭据与各自支持的协议名、版本；两端都声明且版本相同的协议才可用。请求对方不支持的协议，得到可识别的 `unsupported` 应答，会话不关闭
- **帧格式 v2**：沿用「4 字节元数据长度 + JSON 元数据 + 二进制负载」，元数据里带帧类型与协议名；支持请求/应答、取消、心跳与关闭；未知帧类型被忽略（向前兼容）
- **调度与流控**：控制帧先于带负载的批量帧出队；入站并发按协议分别计算，保持 [US-705](US-705-p2p-byte-transfer.md) 的「发送与接收各至多缓冲 8 个块」
- **两级鉴权**：会话级认证「对端是谁」（认证宿主验证过的 `P2PPrincipal`）；逐请求授权「这次能拿什么」。内容持有断言从握手移到请求
- **files 协议迁移**：块请求挂到会话上，供块端按 `contentHash` 在本端的内容表里查找本地文件；分块、校验、续传、多源与服务器回退的现有语义不变
- **会话生命周期**：心跳超时即判对端失联，以可诊断的原因结束会话；对外提供当前会话列表的可观察流

### Out of Scope

- 会话上的新能力：整库克隆、实时信号、远程 DevTools、局域网枢纽，归 [epic-012](../../epics/epic-012-p2p-lan-collaboration.md)
- 单向消息与数据流：随首个使用方加入（[US-710](US-710-p2p-live-signals.md) 的信号、[US-709](US-709-p2p-database-clone.md) 的归档直传）；「未知帧类型被忽略」保证加入时不让旧版本断连
- 认证宿主选型、信令中转路由与 mDNS 宿主接入（[US-704](US-704-p2p-manifest-discovery.md)）
- 桌面链路加密方案与离线凭据（[US-706](US-706-p2p-fallback-auth.md)）
- 同一浏览器多个标签页共用一条会话：在线状态按设备计时才需要标签页间的归属，随 [US-710](US-710-p2p-live-signals.md) 处理

## 验收标准

按 epic-011 的口径验收：协议层的内存测试只证明实现，不充当 AC 证据。浏览器用例跑在真实的 WebRTC DataChannel 上（两个浏览器上下文，由测试夹具交换 SDP）；桌面用例跑在两个进程之间的真实 TLS socket 上。

| #   | 前置条件                                          | 操作                       | 预期结果                                                                           | 状态 |
| --- | ------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------- | ---- |
| 1   | 两个浏览器上下文已建立一条会话，对端持有 3 个文件 | 并发拉取这 3 个文件        | 3 个文件的字节均与各自清单一致；全程只发生 1 次 SDP 交换                           | ✅   |
| 2   | 同一条会话，双方各持有对方没有的文件              | 双方同时互相拉取           | 两个方向都完成，结果一致                                                           | ✅   |
| 3   | 一端支持某协议，另一端不支持                      | 支持端在会话上请求该协议   | 得到「不支持」应答；会话保持，并行中的文件传输照常完成                             | ✅   |
| 4   | 拉取进行中                                        | 请求方取消，或单块请求超时 | 供块端收到取消后不再读取该区间（读盘调用计数不再增长）                             | ✅   |
| 5   | 会话空闲                                          | 关闭对端上下文，或断开网络 | 本端在心跳超时内以「对端失联」结束会话，会话列表移除该设备；不靠下一次请求失败发现 | ✅   |
| 6   | 对端未通过会话认证（伪造或过期的凭据）            | 建立会话                   | 在 hello 阶段被拒，拒绝原因不含本端持有的任何内容信息                              | ✅   |
| 7   | 已认证的对端请求本端未持有、或未授权给它的内容    | 拉取                       | 该请求被拒并给出可诊断原因；会话不断，其它已授权内容照常传输                       | ✅   |
| 8   | 两端同时向对方发起连接                            | 建连                       | 最终只保留一条会话，两端认定的是同一条                                             | ✅   |
| 9   | 大文件传输进行中                                  | 在同一会话上发出一个小请求 | 帧序追踪显示小请求的帧排在已入队的批量块之前发出；不以墙钟时延判绿                 | ✅   |
| 10  | 桌面两个进程经 TLS socket 建立会话                | 执行 AC#1～#4              | 同一套会话协议在 TCP 上全部通过                                                    | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：e2e 项目 `apps/dev-rxdb-p2p-e2e`，`pnpm nx e2e dev-rxdb-p2p-e2e` 运行，两端都运行 P2P 包的构建产物；`nx e2e` 有用例失败时也可能返回 0，以 `test-output/playwright/output/.last-run.json` 为准。

- **AC#1～#9**：`src/browser-webrtc.spec.ts`。同一个 Chromium 里的两个浏览器上下文，各加载一份夹具页，用真实的 `RTCPeerConnection` 与 DataChannel；SDP 由用例在两个上下文之间搬运，不走 trickle ICE。
  - AC#5 覆盖两种情形：卡住对端页面的主线程（DataChannel 仍在、心跳无人应答），本端以 `peer_lost` 结束；关闭对端上下文，本端以 `peer_lost` 或 `transport_failed` 结束。两种情形下会话列表都移除该设备。
  - AC#6 用重放到另一条连接的凭据作为伪造凭据。
  - AC#9 在供块端发送口加闸，让 1 个批量帧停在闸口、7 个留在会话的发送队列里，再发小请求，按交给 DataChannel 的先后核对帧序。
- **AC#10**：`src/desktop-tls.spec.ts`。用例派生两个 Node 进程，经 TLS 1.2 PSK 套件（不需要证书文件）建立 socket，执行 AC#1～#4。
- **反证**：在构建产物里去掉取消检查，两端的 AC#4 都变红；把发送队列改成批量帧优先，AC#9 变红。
- **协议层单测**：`pnpm nx test rxdb-plugin-p2p-files`（`src/session/*.spec.ts`、`src/files-protocol.spec.ts`）只证明实现，不计入上述证据。

## 技术笔记

- **在 PR #172 内完成**：owner 决定（2026-11-03）。`@aiao/rxdb-plugin-p2p-files` 没有进入 main，也没有发布（npm 上不存在），调整公开 API 没有迁移负担。
- **包内隔离**：owner 决定（2026-11-03）会话层先放在包内的 `src/session/`，不认识文件与清单；files 协议只经它的公开接口使用会话。epic-012 第一个使用方解锁时再拆出 `@aiao/rxdb-plugin-p2p`。新导出不进核心包（核心包公开导出的命名门禁只放行 `Commit*` / `WorkingTree*` / `Worktree*` 前缀，见 `scripts/audit/api-surface.mjs`）。
- **与 US-704 的分工**：持有断言发生在请求时而不是握手时，[US-704](US-704-p2p-manifest-discovery.md) AC#5 按此验收。未认证方仍在 hello 阶段只得到通用拒绝，US-706 AC#2 不变。
- **帧格式 v2**：[`P2PFrame`](../../../packages/rxdb-plugin-p2p-files/src/session/frame.ts) 的帧类型为 `hello` / `request` / `response` / `error` / `cancel` / `ping` / `pong` / `bye`，只有请求与应答带负载。`decodeP2PFrame` 遇到未知帧类型返回 `null`，会话忽略它；已知类型字段不合法即判对端违反协议。
- **多路复用放在会话内**：一条 `P2PByteTransport` 对应一条会话，WebRTC 与 TCP 走同一套逻辑。**推断**：WebRTC 开多条 DataChannel 能消除 SCTP 有序流上的队头阻塞，但只有一种传输能用；先以帧级优先级出队解决，实测不够再评估。
- **鉴权接缝**：会话级是 [`P2PSessionOptions.authenticate`](../../../packages/rxdb-plugin-p2p-files/src/session/session.ts)，拿到对端凭据与本连接的 `connectionId`，返回认证宿主验证过的 `P2PPrincipal`；来源可以是信令绑定的身份，也可以是 US-704 AC#8 的可离线验证凭据。请求级由各协议在处理函数里做，处理函数拿到已认证的对端身份；files 协议是 [`P2PFilesProtocolOptions.authorize`](../../../packages/rxdb-plugin-p2p-files/src/files-protocol.ts)，先授权再查内容表。
- **去重规则**：[`P2PSessionRegistry`](../../../packages/rxdb-plugin-p2p-files/src/session/registry.ts) 按「用户 + 设备 + 实例」登记。同一方向的重复连接保留先登记的；双方同时拨号时，身份键较小的一方发起的那条胜出，落选的以 `duplicate` 关闭并告知对端。
- **下游复用**：epic-012 的克隆、信号、DevTools、枢纽都以本故事的会话与协议注册为前置。

## 实现文件

- `packages/rxdb-plugin-p2p-files/src/session/frame.ts` — 帧格式 v2 与编解码
- `packages/rxdb-plugin-p2p-files/src/session/session.ts` — 会话：hello 与认证、请求复用、取消、心跳、按优先级发送
- `packages/rxdb-plugin-p2p-files/src/session/registry.ts` — 按对端身份登记与去重、会话列表的可观察流
- `packages/rxdb-plugin-p2p-files/src/session/webrtc-transport.ts` / `tcp-transport.ts` — 两种字节传输
- `packages/rxdb-plugin-p2p-files/src/files-protocol.ts` — files 协议：逐请求授权、按内容表供块、会话到块来源的适配
- `apps/dev-rxdb-p2p-e2e/` — 验收夹具：`src/browser/`（夹具页与它的服务）、`src/desktop/`（对端进程与用例侧句柄）、`src/shared/`（两端共用的身份、凭据与确定性文件内容）
