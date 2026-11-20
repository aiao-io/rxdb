# Phase 0 Research: Aiao Media 多模态媒体生成

## 研究范围

本阶段围绕 `MEDIA-US-111` 的四条能力链路展开，重点确认现有任务、积分、目录、本机存储和验收入口能够复用到什么程度，并处理 ASR 输入和视频结果体积这两个新增边界。

研究基于以下源码和需求文件完成。

- `aiao-media/requirements/stories/generation/MEDIA-US-111-multimodal-generation.md`
- `aiao-media/apps/api/src/relay-task.ts`
- `aiao-media/apps/api/src/relay-task-api.ts`
- `aiao-media/apps/api/src/relay-credits.ts`
- `aiao-media/apps/api/src/platform-models.ts`
- `aiao-media/apps/web/src/app/relay-task-client.ts`
- `aiao-media/apps/web/src/app/local-image-mvp.ts`
- `aiao-media/apps/web/src/local-data/browser-media.ts`
- `aiao-media/apps/web/src/local-data/media-result.ts`
- `aiao-media/apps/web-e2e/src/platform-generation.spec.ts`
- `aiao-media/apps/web-e2e/src/product-generation.fixture.mts`

## 决策 1：统一使用 RelayTask 作为四类能力的服务端任务底座

**Decision**：TTS、ASR、音乐生成和视频生成均使用现有 `/api/relay/tasks/:taskId` 任务生命周期。图片路径继续使用现有请求适配器和 `/api/models` 兼容入口。

**Rationale**：`RelayTask` 已经提供任务令牌校验、任务 ID 幂等、请求指纹、Durable Object 串行化、长轮询、超时看门狗、R2 结果保存、结果确认、积分结算、失败释放、`needs_review` 保留和过期清理。四类能力分别复制这些逻辑会让双击、刷新、结算应答丢失和未知回执出现四套不一致行为。

**Implementation consequence**：把现有 `Dispatch` 和结果处理从图片语义提升为媒体能力无关的内部接口，并在 `relay-task-api.ts` 中保留旧图片输入适配器。公共任务契约按 `kind + operation` 分派，不能继续把所有新能力塞进 `platformImageInput`。

**Alternatives considered**：

- 继续扩展 `PlatformCoordinator`。它使用 Durable Object 本地 SQLite 账本，与当前产品 PostgreSQL 积分 RPC 重复，拒绝。
- 四类能力分别建立独立任务 API。字段看起来简单，但会重复实现幂等、续接、积分和 `needs_review`，拒绝。
- 浏览器直接调用供应商。会暴露平台凭据和供应商边界，违反需求与现有安全模型，拒绝。

## 决策 2：新增多模态能力目录，保留图片目录兼容入口

**Decision**：新增 `GET /api/media/capabilities`，返回服务端配置的 TTS、ASR、音乐和视频能力。现有 `GET /api/models` 继续只返回图片模型，避免已有图片客户端和备份数据受到破坏。

目录项必须包含能力类型、操作、公开模型标识、能力版本、参数枚举、输入输出限制和单次积分成本。目录不得包含供应商 URL、上游模型名、密钥名称、会话或其他私密配置。

**Rationale**：现有 `/api/models` 的结构和验证器是图片专用，直接改变返回结构会让旧客户端在升级过程中无法解析。独立目录可以在保留图片行为的同时让 ASR 的输入限制、TTS 的语言和语速、音乐参数以及视频输出限制拥有清晰契约。

**Alternatives considered**：

- 在 `/api/models` 中新增 `capabilities` 字段。会污染现有图片模型结构，且旧消费者未必忽略未知字段，拒绝。
- 客户端维护模型和参数白名单。无法保证服务端配置和前端版本一致，且会把供应商决策带入客户端，拒绝。

## 决策 3：能力使用 operation 联合类型，ASR 单独建请求和结果模型

**Decision**：保留 `kind: 'audio'` 表示音频输入或输出媒体，使用明确的 `operation` 区分：

- `text-to-speech`
- `speech-to-text`
- `text-to-music`
- `text-to-video`
- 现有 `text-to-image`

ASR 不复用 TTS 的请求类型。ASR 请求包含服务端生成的音频输入引用和语言选择，结果是 `TranscriptResult`。音乐请求拥有独立参数对象，但使用音频结果元数据和 `LocalMediaAsset` 的二进制保存路径。

**Rationale**：TTS 的输入是文本，ASR 的输入是音频引用，音乐的输入是提示词和音乐参数。把三者压成同一组字段会导致无效字段组合、校验分支和本机恢复逻辑失去边界。

**Alternatives considered**：

- 继续使用单一 `AudioJobRequest` 并依靠可选字段表达三种操作。字段组合不可读，服务端校验容易遗漏，拒绝。
- 把 ASR 提升为新的顶层 `kind: 'transcript'`。它描述的是结果而非输入媒体，不能自然表达上传音频和音频能力目录，拒绝。

## 决策 4：ASR 使用短期私有输入引用，不把音频字节放进任务快照

**Decision**：新增 `POST /api/media/inputs`，客户端以原始音频请求体上传符合目录限制的文件。服务端在现有私有结果存储中使用 `inputs/<inputId>` 命名空间保存短期输入，返回不透明的 `MediaInputReference`。ASR 任务只携带输入引用、实际 MIME、字节数、时长和 SHA-256。输入在任务进入终态、超时或引用过期后清理。

服务端重新校验输入引用的所有权、哈希、大小、MIME 和能力限制。客户端可以先做格式和时长提示，但客户端元数据不能替代服务端校验。

**Rationale**：ASR 音频可能超过 JSON 请求和 Durable Object 单次内存处理的安全范围。短期输入对象让任务快照、队列、备份和同步数据只保留不透明 ID 与必要元数据，避免本地路径、供应商 URL 和原始字节进入持久任务状态。

**Alternatives considered**：

- 将音频 base64 放进 `PUT /api/relay/tasks/:taskId`。编码膨胀请求体，并把大输入绑定到任务接单请求，不利于续接和重试，拒绝。
- 让浏览器直接上传供应商对象存储。需要把供应商地址或临时凭据暴露给浏览器，拒绝。
- 把音频写入 Supabase 公共媒体表。会引入跨设备同步、RLS、删除审计和生命周期迁移，超出首阶段，拒绝。

## 决策 5：二进制媒体与 JSON Transcript 使用两种结果交付形态

**Decision**：保留图片和 ASR JSON 结果的现有密文 envelope。TTS、音乐和视频在服务端完成供应商响应规范化和媒体真实性校验后，以私有 R2 结果对象交付二进制，任务状态返回 `MediaResultManifest`。`GET /result` 根据 manifest 返回真实 MIME 的音频或视频字节，并通过任务令牌保护访问。

媒体结果对象使用 `results/<taskId>` 命名空间，输入对象使用 `inputs/<inputId>` 命名空间。任务删除和过期清理必须同时处理两类对象。现有图片结果对象和票据格式保持兼容。

**Rationale**：当前 `relayTaskLimits.resultBytes` 为 24 MiB，而视频契约上限为 64 MiB。继续把所有供应商 JSON 和 base64 内容一次性装入加密缓冲区会把视频结果限制、Worker 内存和网络响应耦合起来。二进制结果对象可以保留 64 MiB 视频契约，并让浏览器使用真实 MIME、字节数和 manifest 进行验证。

**Alternatives considered**：

- 将视频上限降低到现有 24 MiB。实现简单，但会让已声明的视频契约和用户可见目录失去一致性，拒绝。
- 所有结果都继续使用单个 AES-GCM 缓冲区。无法在 64 MiB 视频和 Worker 内存预算下稳定交付，拒绝。
- 所有结果都明文放进公共对象 URL。会绕过任务令牌和服务端生命周期，拒绝。

**Required complexity note**：这是相对当前图片路径新增的双形态结果存储。它是由现有视频上限和安全交付边界共同决定的必要复杂度，必须通过结果对象访问测试、过期清理测试和敏感字段扫描证明。

## 决策 6：积分继续使用产品 PostgreSQL RPC

**Decision**：所有需要平台调用的能力继续使用 `BackendRelayCredits` 的 `reserve`、`complete` 和 `release`。每条目录项提供 `credits`，任务指纹包含能力版本、完整请求和 ASR 输入摘要。明确拒绝、确定失败和本机在接单前的无效请求释放预占。结果待核查保留未决，不自动重发。

**Rationale**：现有 RPC 已经处理余额、预占、结算、释放和幂等流水。新能力不应重新引入 Durable Object 本地账本。

**Alternatives considered**：

- 每种能力增加独立账本函数。会分散幂等和流水规则，拒绝。
- 客户端先查询余额再提交。余额查询不是原子预占，双标签页会产生超扣风险，拒绝。

## 决策 7：本机保存继续复用 OPFS 音视频资产，ASR 新增文本实体

**Decision**：

- 保留 `LocalImageWork`、数据库名、OPFS 根目录和既有图片路径。
- TTS、音乐和视频继续使用 `LocalMediaAsset` 和 `saving`、`ready`、`deleting`、`broken` 阶段。
- `LocalMediaAsset.request.operation` 区分 TTS、音乐和视频。
- 新增 `LocalTranscript` RxDB 实体承载 ASR 文本、语言信息、输入摘要、文本摘要和删除阶段。
- 新增通用提交 journal，保留 `audio-submissions` 和 `video-submissions` 的版本 1 读取路径，避免旧待处理意图被覆盖。
- 音视频原文件和 ASR 文本首阶段只进入当前设备本机历史，不扩展现有图片远端同步和图片 Storage 表。

**Rationale**：现有二进制保存代码已经验证了 RxDB、OPFS、摘要、回读、损坏恢复和删除顺序。ASR 文本没有 fileId 和 OPFS 文件，不应强行塞进二进制实体。保留旧图片表和标识可以满足 Never break userspace。

**Alternatives considered**：

- 为四类能力分别新建文件和任务实体。会复制保存、删除和恢复流程，拒绝。
- 直接把图片表重构为统一媒体表。需要迁移旧数据、备份、同步和查询，风险超过本故事，拒绝。
- 把 Transcript 当作音频文件保存。会制造虚假的 MIME、字节和文件状态，拒绝。

## 决策 8：Angular 产品保留四条现有路由，新增同一创作入口的能力模式

**Decision**：在现有 `LocalImageMvp` 外壳和 `/create`、`/images`、`/providers`、`/` 路由上增加媒体能力模式与作品类型筛选。共享任务续接和结果交付提取到 `apps/web/src/app/media-generation/`，图片旧 UI 通过兼容适配继续工作。

新增入口必须定义加载、空结果、失败、`needs_review`、保存失败和无障碍状态。下载按钮使用 manifest 的实际 MIME 和扩展名。作品库为音频提供试听，为视频提供可控播放，为 Transcript 提供复制和文本下载。

**Rationale**：现有产品是单个 Angular 应用，用户已经通过 `/create` 进入创作。新增独立路由会改变入口和恢复逻辑。共享 API 契约不涉及 Angular、React、Vue 绑定，因此本故事不扩展到其他框架。

**Alternatives considered**：

- 另建四个顶层页面。会重复账号、积分和任务状态 UI，拒绝。
- 直接继续膨胀 `local-image-mvp.ts`。会把图片状态、媒体任务和本机交付耦合在一个组件，拒绝。

## 决策 9：分层测试并新增独立多模态 E2E 入口

**Decision**：图片 acceptance 保持原样，新增多模态 fixture、E2E 配置和真实验收入口。验证分四层。

1. `api-contracts` 验证联合类型、目录、输入、结果和敏感字段。
2. `aiao-media-api` 验证目录、输入引用、RelayTask、积分、状态机和结果清理。
3. `aiao-media` 验证 Angular 交互、任务续接、本机资产和 Transcript 删除恢复。
4. `aiao-media-e2e` 验证登录、积分、TTS、ASR、音乐、视频的 fixture 闭环，并提供四类能力独立的正式 provider acceptance。

**Rationale**：现有 `platform-generation.spec.ts` 和 provider acceptance 强绑定图片字段。直接把四类能力混入同一个图片 fixture，会掩盖能力之间的输出和计费差异。

**Alternatives considered**：

- 扩展现有图片 fixture 为所有能力。文件更少，但图片专用假设会污染 ASR、音频和视频证据，拒绝。

## 决策 10：供应商选择留在服务端配置，不引入客户端 SDK

**Decision**：首阶段采用服务端 provider adapter 和平台配置驱动。能力目录只暴露平台内部生成的 `providerInstanceId`、`providerRevision`、`modelId` 和公开标签。具体供应商、上游模型、密钥和协议由 `MEDIA_PLATFORM_CAPABILITIES` 与服务端环境决定。客户端不安装供应商 SDK，也不接收上游地址。

**Rationale**：需求明确要求用户不配置供应商 Key。当前仓库已经有 `providerAllowlist`、服务端密钥注入和图片 provider protocol 适配边界。供应商协议尚未形成稳定的四类公共契约，先把供应商差异限制在 API 内部可以避免在计划阶段绑定错误 SDK。

**Alternatives considered**：

- 选定某一家供应商并把请求字段写死。会把未验证的供应商限制提前固化，拒绝。
- 在客户端安装多个 SDK。增加 bundle、凭据和协议风险，拒绝。

## 研究结论与剩余风险

Phase 0 的技术上下文已全部决策，没有未解决的 `NEEDS CLARIFICATION`。实现前仍需要由部署配置提供实际能力目录和供应商回执，但这属于运行时配置，不属于公共 API 设计不确定项。

剩余风险如下。

- 视频真实时长和画幅需要在服务端 manifest、浏览器解码和 provider receipt 之间建立一致的校验。
- 音乐供应商可能返回 URL、base64 或异步任务回执，adapter 必须统一为私有二进制结果，不允许把供应商 URL交给浏览器。
- `packages/domain` 中的旧简化媒体类型不作为本故事主契约，若后续公共配置同步需要表达能力目录，必须单独评审 domain 迁移。
- 备份 v1/v2 和图片同步保持兼容。本故事首期不把音视频原文件接入远端图片同步，也不修改既有备份导入格式。
