# 已否决候选与未深入候选

> 本文记录「为什么不做」，对抗兴趣跳跃（AGENTS.md ENFP 陷阱第一条）：结论没有变化的候选
> 不重新立项。状态与维护规则见 [本目录 README](README.md)。

## 已否决

### 小程序内聊天（微信小程序里做聊天功能）

**否决理由**：实时语义全在引擎外 + 小程序端三个实测硬伤。

- **实时是聊天的灵魂，引擎不提供**：有序送达、离线推送、已读回执是服务端权威语义；
  引擎同步是异步合并模型，连 SSE 都明文限定「只做失效通知，不得变成长连接流」
  （[US-212](../stories/adapter/US-212-http-adapter.md)）；工作树 / commit graph / 冲突解决
  在纯 append 的聊天流里零收益——引擎最强的机制用不上，聊天最硬的刚需引擎没有
- **存储配额 ~10 MiB**：小程序用户目录约 10 MiB 量级（抖音实测，覆盖写旧文件仍计配额、
  无崩溃恢复，见 [可行性矩阵](../stories/adapter/miniprogram-platform-feasibility.md)），
  聊天记录无限增长 vs 配额封顶，本地 SQLite 全量留存优势被砍没
- **adapter 实验性**：微信 / 抖音 / 支付宝整体标「实验性」，Android 真机未验证
  （[capability-matrix](../capability-matrix.md) 适配器能力对比）
- **FTS 未放行**：`wa-sqlite-miniprogram` 的 FTS5 已编译但 registry `unverified`，
  聊天记录搜索在小程序端抛 `SearchUnsupportedAdapterError`
- **E2EE 假设下加密与搜索互斥**：端到端加密的聊天内容按「加密字段不进索引」原则
  无法全文搜索（[vision](../vision.md) 阶段 6）；非 E2EE 的微信模式不触发此冲突，
  见 [wechat-client](wechat-client.md) 关键设计修正
- **生态现成**：微信生态内的客服场景有官方微信客服组件，自建通常不划算

**可以沾的部分**：聊天作为**模块**挂在其他领域产品里（项目评论流、客服历史记录、
通知中心）成立——rxdb 做本地消息缓存 + 会话列表响应式渲染，实时通道外接 WebSocket 或
微信订阅消息。

### 大规模 BI / 报表分析

**否决理由**：QueryCache 明确要求结果集有界——「适合用 `where` 收窄，而不是靠 `limit` 收窄」
（[US-020](../stories/core/US-020-querycache-repository.md) 原文）。引擎不是为全表聚合、
大结果集扫描设计的，BI 场景的正确位置是服务端数仓。

### Google Docs 级强实时协同编辑

**否决理由**：同步是异步合并 + 冲突处理模型，OT / CRDT 实时通道是 vision 阶段 3 的方向
（[vision](../vision.md) 明确「不是排期，也不是承诺」）。多光标、逐字实时合并这类体验
需要外部 CRDT 服务，引擎不做。

### 纯服务端重事务系统（银行账务、ERP 核心）

**否决理由**：Local-first 的价值在端上。服务端权威的重事务场景（强一致、跨行事务、
审计合规）只剩「同步到端」的成本，没有「本地优先」的收益。

### 海量多重图网络（电网拓扑、供应链网络）

**否决理由**：图插件同一对节点间只允许一条边（`sourceId_targetId` 组合唯一索引），
多重边缺口刚被 BOM 认领（[US-507](../stories/domain/US-507-bom-graph-skeleton.md)），
短期只支持单边；「写入期拒绝成环」只在 BOM 这类 DAG 领域成立，是领域约束不是插件能力
（[capability-matrix](../capability-matrix.md) 已知的需求覆盖缺口）。

### 纯游戏存档同步

**否决理由**：只吃「同步」一项能力，养不起「三框架对称 + 适配器矩阵」的税
（底线判据见 [本目录 README](README.md)）。存档同步用轻量方案即可，不需要模型驱动、
不需要三端对称。

## 未深入（排队，非否决）

一句话记录，需要时再单独立文件。清单见 [本目录 README](README.md) 同名章节。
