# 状态概览

> **真相源**：`stories/*/POOL-US-*.md` 的 YAML `status`。本页按该字段派生，有冲突以 YAML 为准并修正本页。排期见[路线图](roadmap.md)，能力范围见[能力矩阵](capability-matrix.md)，证据分层见[验收记录](verification-report.md)。

当前产品范围：M1 的产品化增量（回退内容加密、速率限制与举报）已实现并合入，剩余验收见下方「未完成验收与关闭条件」。本目录只统计 POOL-US-* 故事；底座故事（rxdb:US-704～US-708、rxdb:US-713）的状态在根 `requirements/stories/`，见下方「技术底座」指针。

| 状态           |  数量 | 说明                           |
| -------------- | ----: | ------------------------------ |
| ✅ Done        |     0 | 无                             |
| 🚧 In Progress |     2 | M1 产品化增量：POOL-US-101/102 |
| 👀 In Review   |     0 | 无                             |
| ⬜ Backlog     |     0 | 无                             |
| 🚫 Blocked     |     0 | 无                             |
| **合计**       | **2** | 不含模板和底座故事             |

## 按 Epic 索引

### [Aiao Pool 产品化与 MVP](epics/POOL-EPIC-001-aiao-pool-productization.md)

- 🚧 [POOL-US-101 服务器回退内容加密](stories/ops/POOL-US-101-fallback-content-encryption.md)
- 🚧 [POOL-US-102 速率限制、举报与邀请制 beta](stories/ops/POOL-US-102-rate-limit-report-invite.md)

## 技术底座（指针，非本目录状态）

技术底座六条故事与 epic-012 立项池的状态以根 requirements 为准，这里只做指针，不复制状态。

- [rxdb:US-704 文件清单与 P2P 发现](../../../requirements/stories/future/US-704-p2p-manifest-discovery.md)、[rxdb:US-705 P2P 字节传输](../../../requirements/stories/future/US-705-p2p-byte-transfer.md)、[rxdb:US-706 服务器兜底与认证](../../../requirements/stories/future/US-706-p2p-fallback-auth.md)、[rxdb:US-707 跨运行时 demo 与多实例 e2e](../../../requirements/stories/future/US-707-p2p-cross-runtime-e2e.md)
- [rxdb:US-708 P2P 会话层](../../../requirements/stories/future/US-708-p2p-peer-session.md)、[rxdb:US-713 P2P demo 管理后台](../../../requirements/stories/future/US-713-p2p-admin-console.md)
- epic-012 立项池（US-709～US-712）见[根 epic-012](../../../requirements/epics/epic-012-p2p-lan-collaboration.md)；排期与准入见[根 roadmap 批次 7](../../../requirements/roadmap.md#批次-7局域网-p2p-大文件共享p2p-epic-已解锁)

## 未完成验收与关闭条件

- [POOL-US-101](stories/ops/POOL-US-101-fallback-content-encryption.md)：AC1～AC4、AC7～AC10 已关闭（AC1/3/4/7/8/9/10 本地真栈 e2e，AC2 代码级证据 + 三轮真栈日志复核）；AC5 只有单元证据，缺 R2 副本被篡改后浏览器回退下载的端到端验证；AC6 的分块 AAD 有单元证据，浏览器断点续传端到端交互待 rxdb:US-705 续传补齐；阶段 D（正式环境复验）未开始。
- [POOL-US-102](stories/ops/POOL-US-102-rate-limit-report-invite.md)：AC1～AC8 已在本地真栈 e2e 关闭（governance / governance-gated / governance-limits）；AC9 只有单元证据，缺对真栈限流存储与日志的逐项检查。
- 底座故事的剩余验收以根故事为准；US-707 阶段 B（Tauri 双进程、离线局域网、大文件）与桌面端归 M2。

## 范围说明

- POOL-US-101 只承诺服务器回退路径的内容加密；P2P 直传链路加密（DTLS/TLS）在 rxdb:US-706，本地落盘加密在 rxdb:US-803，文件名/大小/hash 等元数据保持明文（隐私叙事限于内容字节）。
- POOL-US-102 只承诺限流、举报与邀请制的运营闭环；内容自动审查、版权扫描、审计日志与计费归 M3 商业化范围。
