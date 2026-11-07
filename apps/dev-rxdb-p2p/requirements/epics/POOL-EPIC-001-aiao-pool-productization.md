---
id: POOL-EPIC-001-aiao-pool-productization
status: In Progress
startDate: 2026-11-05
targetDate: TBD
owner: jimmy
---

# Aiao Pool 产品化与 MVP

## 愿景

把 dev-rxdb-p2p 从「P2P 大文件共享的独立 demo」升级为可验证的产品 aiao-pool（文件池）：浏览器版补上治理与隐私增量后邀请真实团队 beta，桌面端（v2）补齐常驻体验，M3 验证免费/Team 商业化。产品本质：**云盘式资产视图 × P2P 零存储传输**。

技术底座（根 requirements 的 epic-011 六条故事 + epic-012 立项池）不推翻、不复制；本 Epic 只承载产品化视角的增量。决策与里程碑见 [decisions](../decisions.md) 与 [roadmap](../roadmap.md)，立项依据见 [立项方案](../plans/p2p-product-proposal.md)。

## 目标

- [ ] 回退路径内容加密：客户端加密后上传 R2，服务器全程不可读（[POOL-US-101](../stories/ops/POOL-US-101-fallback-content-encryption.md)）
- [ ] 速率限制、举报与邀请制 beta：控制滥用与成本，滥用演练闭环（[POOL-US-102](../stories/ops/POOL-US-102-rate-limit-report-invite.md)）
- [ ] M1 其余三项随技术底座交付：管理后台上线（rxdb:US-713）、断点续传（rxdb:US-705）、自定义域名 pool.aiao.io（工程项）
- [ ] M1 验收：≥1 个真实团队连续使用 2 周；滥用演练通过；e2e 全绿
- [ ] M2 桌面端与 M3 商业化分别以新 story 立项（D-05 / D-03，M3 前定案）

## 故事

> 只列范围；状态以 story YAML 为准，汇总见 [状态概览](../status-overview.md)。

- [POOL-US-101 服务器回退内容加密](../stories/ops/POOL-US-101-fallback-content-encryption.md) (High)
- [POOL-US-102 速率限制、举报与邀请制 beta](../stories/ops/POOL-US-102-rate-limit-report-invite.md) (High)

## 非目标

- **不推翻技术底座**：epic-011 六条故事与 epic-012 立项池的编号、状态与验收口径维持根 requirements 不变；本 Epic 不复制其状态。
- **不做公网 P2P**：STUN/TURN/DHT 维持 epic-011 非目标（D-07 预留）。
- **不做目录级双向同步、移动端、国内合规基础设施**（D-06）。
- **M1 不做桌面端与商业化**：桌面端是 v2（D-05），付费与支付是 M3（D-03）；它们以新 story 立项，不在本 Epic 首轮关闭。

## 价值待证

**解锁记录（2026-11-05，owner 决定）**：M0 拍板闭环（D-01/D-02/D-05/D-06 已定，D-03/D-04 推到 M3 前，D-08 推到 v2，D-07 预留）。驱动力是市场调研确认的空白——没有一家竞品同时具备「账号/历史/持久清单 + 可靠传输 + 内容加密 + 可持续商业模式」，行业窗口（WeTransfer 免费档收缩、奶牛快传停服）同时成立；零先例风险（纯浏览器 P2P 订阅变现无先例）用低成本渐进验证对冲：M1 以邀请制 beta 验证「团队愿意为回退 + 治理付费」，M3 复盘转化数据再定 D-03/D-04。市场调研原文见 [p2p-market-analysis](../plans/p2p-market-analysis.md)。
