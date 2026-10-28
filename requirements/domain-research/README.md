# 候选领域研究区

这里记录领域想法、适用边界和下一次最小验证。研究文件不是用户故事，不参与故事状态统计，
也不是交付承诺；已孵化范围以对应 Epic 和 story 为准。

## 底线判据

候选要同时用得上「离线、响应式、多端同步、模型驱动」中的至少三项，才值得承担三框架与适配器矩阵的成本。
具体能力以 [capability-matrix](../capability-matrix.md) 为准，长期方向以 [vision](../vision.md) 为准。
静态托管、无必需云服务只说明服务端成本，不代表产品开发成本为零。

单机 Web 可以先验证本地闭环，但浏览器清数据会丢库，备份与导出须进入产品验收。
多设备同步、秘密、支付及外部服务另定边界，不能从本地可用推导为产品已经完整。

## 候选状态

状态只在下面的候选清单维护，研究文件不重复维护。

| 状态   | 含义                                                                  |
| ------ | --------------------------------------------------------------------- |
| 研究中 | 尚未完成立项或否决决策                                                |
| 已孵化 | 已建 Epic / story；研究冻结为设计依据，当前交付合同在故事里维护       |
| 已否决 | 结论与依据留在 [rejected-domains.md](rejected-domains.md)，不重复立项 |

## 优先级结论

目标是尽快交付可用产品，同时验证 RxDB。**当前主线是已批准的单人 Web 本地数据工作台**，
先完成发布产物独立消费与接入收益验收。任务看板维持下一候选；文本 SRS 和健身记录按真实持续使用者择一。
其余按下面的具体触发条件推进，不并行扩成多条完整产品线。

BOM 与 Admin 的 owner 解锁继续生效，不能因缺少新客户再次阻止已批准范围。
候选名次不是开工授权；用户与范围变化时，先复核最小任务及现有能力，再调整优先级。

## 候选清单

| 领域                      | 文件                                                 | 状态   | 当前处理           | 下一次最小验证                                                     |
| ------------------------- | ---------------------------------------------------- | ------ | ------------------ | ------------------------------------------------------------------ |
| 制造业 BOM / MES          | [epic-009](../epics/epic-009-bom-domain-model.md)    | 已孵化 | 按批准切片推进     | 首轮结构、解析、数量与 US-525 A 贯穿应用；候选优化保留各自准入     |
| 模型驱动后台              | [admin-framework.md](admin-framework.md)             | 已孵化 | 当前主线           | US-528 仓外安装发布产物，试用者按文档独立接入                      |
| 任务看板 / 项目管理       | [task-board.md](task-board.md)                       | 研究中 | 下一候选           | 单人 Board / Column / Task、跨列移动与重开恢复；团队权限和通知另定 |
| 间隔重复学习              | [anki-srs.md](anki-srs.md)                           | 研究中 | 有使用者时择一     | 文本卡片、到期复习、评分、日志与续学；不承诺 Anki 全兼容           |
| 健身训练记录              | [fitness-log.md](fitness-log.md)                     | 研究中 | 有使用者时择一     | 手机录入、单位、计时、中断恢复与历史口径                           |
| 知识库 / 笔记             | [knowledge-base.md](knowledge-base.md)               | 研究中 | 第二梯队           | 单人文本页面、链接、搜索、备份导出；多人逐字协作与附件后置         |
| 稍后读与批注              | [read-later.md](read-later.md)                       | 研究中 | 第二梯队           | 内容导入、批注锚点、进度恢复与搜索；手工导入不等于 URL 收藏闭环    |
| 外勤 / 现场采集           | [field-data-collection.md](field-data-collection.md) | 研究中 | 客户触发           | 具名团队的固定表单、离线续填、提交回执与照片需求                   |
| 零售 POS / 进销存         | [retail-pos.md](retail-pos.md)                       | 研究中 | 客户触发且后置     | 单店单设备记账、库存流水、退货与日结；支付、硬件和多设备一致性另验 |
| 智能体记忆 / 本地 AI 助手 | [local-ai-agent.md](local-ai-agent.md)               | 研究中 | 技术储备           | 明确资料来源、检索质量与带引用回答；纯存储研究可与知识库共用       |
| AI 原生开发环境           | [ai-native-builder.md](ai-native-builder.md)         | 研究中 | 技术储备，主线后置 | 单一受控模板的编辑、保存、运行预览与可构建导出                     |
| 人生快进中                | [life-fast-forward.md](life-fast-forward.md)         | 研究中 | 独立玩法实验       | 一局选择后果与总结、退出续玩、Cocos 真机存档探针                   |
| 密码管理器                | [password-manager.md](password-manager.md)           | 研究中 | 暂缓               | 本地解锁、自动锁定与备份；E2EE 与跨设备密钥协议独立验证            |
| 微信客户端部分功能        | [wechat-client.md](wechat-client.md)                 | 研究中 | 暂缓               | 本地会话演示或接已有 IM 后端；消息身份、幂等、顺序与回执另验       |
| 离线音乐库                | [offline-music.md](offline-music.md)                 | 研究中 | 后置               | 自有音频导入、文件引用恢复、离线播放与中断处理                     |

[Git + OPFS](browser-git-opfs.md) 与[浏览器 Git 基准](browser-git-benchmark.md)是 AI 开发环境的技术附件，
不作为额外产品候选。现有基准只覆盖固定浏览器与 fixture，不能替代工作区、依赖解析和隔离预览的产品验收。

知识库、稍后读与本地 AI 可共用内容导入、文本、搜索和备份研究；产品范围仍各自立项，
不把 RAG 或 agent 事件模型自动加入知识库首版。

## 能力边界与复验

- 权限现状是实体操作入口约束，角色、owner 与读取隔离分别看 [US-027](../stories/core/US-027-entity-permission-model.md) / [US-029](../stories/core/US-029-rbac-owner-role-permission.md)。
- 实体生成器不等于可运行应用生成器；当前实现见 [RxDBClientGenerator](../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts)。
- working-tree 提供本地实体版本历史；身份、可信审计与远程提交协议另做，边界见[包文档](../../packages/rxdb-plugin-working-tree/README.md)。
- 三框架 API 对称不代替宿主验证。DOM、VTable、小程序逻辑层和小游戏分别验收；搜索按[后端放行表](../../packages/rxdb-plugin-search/src/backend/backend-registry.ts)核对。
- 本地字段加密不等于 E2EE；加密字段不能直接进搜索索引，边界见 [US-803](../stories/future/US-803-local-encryption.md)。
- replay 是 rrweb DOM 录制，模型请求、工具调用与任务恢复需要独立事件模型，见 [US-909](../stories/future/US-909-session-replay-debugging.md)。
- HTTP QueryCache outbox 可排队重放 REST 写入，不是 Full / Filter changelog 同步，见 [US-212](../stories/adapter/US-212-http-adapter.md)。

立项时复核源码、能力矩阵、已验证宿主与当前故事状态。候选只记录本领域增加的产品工作，
不复制一份全仓能力库存，也不用市场空白、零成本或未经试玩的精确工期替代证据。

## 已孵化：制造业 BOM

owner 已批准完整功能演示应用；授权与边界见 [epic-009](../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。
先按其首轮切片收敛到可演示、可验收状态，再由 US-525 B～F 引导后续范围。
联产品、可达性物化和扩展索引仍按各自准入条件处理；BOM 不进入 Admin 首版。

## 已孵化：模型驱动后台管理框架

授权与当前故事见 [epic-010](../epics/epic-010-model-driven-admin-framework.md#价值待证整个-epic)，
设计依据见 [admin-framework.md](admin-framework.md)。首版是单人 Web 本地工作台，
当前独立消费与接入收益验收由 US-528 负责；列表配置扩展由 US-529 负责，不在研究区平行维护状态。

## 草稿区

半句话想法先留一行；能写出具体任务、入场条件与前置后再立研究文件。

| 想法           | 深入触发信号                                                 |
| -------------- | ------------------------------------------------------------ |
| 客服工单       | 具名团队的断网接单或跨设备查询症状，以及真实工单样本         |
| 开发者配置同步 | 具名团队的多设备配置问题，以及具体工具与合并边界             |
| 个人健康仪表盘 | 明确数据源、导入授权、目标用户与展示任务                     |
| 家庭相册元数据 | 文件恢复、权限和跨设备访问闭环，不能用元数据同步代替照片字节 |

## 未深入候选（排队，非否决）

- 医疗诊所 EHR：具名诊所、协作方与行业验证资源出现后再深入。
- 个人财务记账：出现多设备具体任务，且能说明相对普通本地存储的收益时深入。
- 纯游戏存档同步不作旗舰展示；五类否决方向的依据统一留在 [rejected-domains.md](rejected-domains.md)。

## 维护规则

1. 每个候选必须写入场条件与立项前置，分别回答「什么具体任务值得做」与「哪些能力必须先验证」。
2. 否决理由保留在 rejected-domains，当前结论直接覆盖；演进过程由 Git 历史记录。
3. 孵化后研究冻结为设计依据；更新交付范围、AC 和状态只改对应故事与派生视图。
4. 每次 roadmap 批次评审或 release 核对候选；已孵化只保留指针，避免第二份待办与状态表。
5. 领域代码遵守 [AGENTS.md](../../AGENTS.md) 与 [CONTRIBUTING](../../CONTRIBUTING.md)：领域功能与 `packages/*` 公共包改动在同一 PR 中统一评审、验证，通过后一起合入 main。

## 毕业路径

研究收敛 → 按 [CONVENTIONS](../CONVENTIONS.md) 建 story，明确具体任务、AC、范围与准入 →
登记 [roadmap](../roadmap.md) → owner 决策解锁。现有授权不因文档整理失效。
研究不代替 story，YAML `status` 是故事状态的唯一真相源。
