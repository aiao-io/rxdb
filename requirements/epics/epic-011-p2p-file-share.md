---
id: epic-011-p2p-file-share
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 局域网 P2P 大文件共享

## 愿景

公司内网里，大文件在已持有副本的机器之间点对点直传——元数据（谁有什么）走现有同步、字节流不经服务器；断外网时局域网照传，没有 peer 在线时回退服务器直下。

## 为什么单列一个 Epic

- **字节面与同步协议正交**：传输走 WebRTC DataChannel / 桌面 TCP，不经过 `rxdb-plugin-sync` 的文档复制路径。epic-002 已 `Done`，不得持有未完成故事；epic-004 现有驱动场景（全文搜索、桌面本地文件、小程序宿主、HTTP 适配器）都不需要 P2P 传输，埋进去只会让它等别的场景。
- **自己的验证形态**：需要「两台机器之间字节流 + 流量隔离」的验收——断言文件字节不经过服务器。现有 e2e 是单应用内交互，仓库没有这种用例形态（复验：全仓检索 `webrtc|libp2p|peer-to-peer` 无实现痕迹）。
- **跨运行时交付面**：browser / Electron / Tauri 三条运行时（CLAUDE.md 铁律：单端缺失 = 未完成），需要独立的对称收口。

## 目标

- [ ] 文件清单实体与「局域网里谁有」的本地活查询、对等发现与信令（[US-704](../stories/future/US-704-p2p-manifest-discovery.md)）
- [ ] 浏览器 WebRTC / 桌面 TCP 的分块直传、内容校验、断点续传与多源（[US-705](../stories/future/US-705-p2p-byte-transfer.md)）
- [ ] 无 peer 回退服务器、认证复用与坏 peer 隔离（[US-706](../stories/future/US-706-p2p-fallback-auth.md)）
- [ ] 跨运行时 demo 与多实例 e2e（[US-707](../stories/future/US-707-p2p-cross-runtime-e2e.md)）；Tauri 双进程用例为 epic 关闭条件（随 US-505 成熟后补齐）

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-704 文件清单与 P2P 发现](../stories/future/US-704-p2p-manifest-discovery.md) (High)
- [US-705 P2P 字节传输](../stories/future/US-705-p2p-byte-transfer.md) (High)
- [US-706 服务器兜底与认证](../stories/future/US-706-p2p-fallback-auth.md) (Medium)
- [US-707 跨运行时 demo 与多实例 e2e](../stories/future/US-707-p2p-cross-runtime-e2e.md) (Medium)

## 非目标

- **不做公网 P2P**：不做 STUN/TURN 中继与 NAT 穿透，不做 DHT 对等发现；发现只靠公司内网（mDNS / 同步服务器信令）。
- **浏览器端断外网新建连接的边界**：已建立的直连不依赖服务器，可继续传输；浏览器**新建**连接需要信令通道可达（桌面端 mDNS 不受此限），边界与用例口径见 US-704 / US-707。
- **不做目录级双向同步**（Syncthing 式文件夹镜像）：只做单文件按需拉取，方向是「有 → 没有」，不解决两台机器都改了同一文件。
- **不替换同步协议**：结构化文档的复制仍走 `rxdb-plugin-sync`；P2P 只传大文件字节。
- **不做字节级持久加密**：链路加密（浏览器 WebRTC DTLS / 桌面 TLS）在 US-706 范围；落盘加密已有 [US-803](../stories/future/US-803-local-encryption.md)。
- **不把传输进度同步上行**：进度只进本地内存事件，不进同步实体（写放大与冲突噪音换不来读者价值）。

## 价值待证

当前驱动力是「假设某公司团队共用本系统共享大文件」的场景推演，尚无具名使用方踩到的具体症状（判据见 [CONVENTIONS](../CONVENTIONS.md#价值待证)）。本 Epic 与四条故事留在 Backlog。**解锁条件**（出现其一即提请 owner）：① 具名团队 / 应用出现「大文件经服务器同步慢、占带宽」的具体症状；② 仓库自举——某个 demo 或工具（如 DevTools 会话回放归档）成为真实使用方。
