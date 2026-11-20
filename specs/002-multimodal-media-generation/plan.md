# Implementation Plan: Aiao Media 多模态媒体生成

**Branch**: `codex/aiao-media-incubation`（Spec Kit feature `002-multimodal-media-generation`）
**Date**: 2026-11-20
**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-multimodal-media-generation/spec.md`

## Summary

为 `aiao-media` 增加 TTS、ASR、音乐生成和视频生成。计划以现有 Durable Object `RelayTask`、产品 PostgreSQL 积分 RPC、Angular `/create` 创作入口和 RxDB/OPFS 本机存储为基础，扩展成按 `kind + operation` 分派的多模态任务协议。

实现保留图片专用 `/api/models`、图片任务、图片备份、图片同步、现有数据库名和 OPFS 标识。新增 `/api/media/capabilities` 能力目录、ASR 短期输入引用、Transcript 本机实体和通用提交 journal。TTS、音乐和视频使用现有 `LocalMediaAsset` 二进制生命周期，ASR 使用独立 `LocalTranscript` 文本生命周期。四类任务共用任务 ID、幂等指纹、预占/结算/释放、刷新续接和 `needs_review` 语义。

## Technical Context

**Language/Version**: TypeScript strict，Node 26+，Angular 22+，RxJS 7.8+

**Primary Dependencies**: Nx 23+，pnpm 10，`@aiao-media/api-contracts`，`@aiao-media/domain`，`@aiao/rxdb`，RxJS，Cloudflare Workers Durable Objects，Cloudflare R2，Supabase PostgreSQL RPC，Vitest，Playwright

**Storage**: Worker Durable Object SQLite 保存任务状态和摘要。私有 R2 保存短期 ASR 输入和任务结果。浏览器使用现有 RxDB wa-sqlite 与 OPFS 保存音频、视频和 Transcript。现有图片表、数据库名、OPFS 根目录和图片同步表保持兼容。

**Testing**: Vitest 单元测试，Node test 脚本测试，Vitest Browser + Playwright Chromium 本机存储测试，Playwright 产品 E2E，独立 fixture provider acceptance 和正式 provider acceptance。

**Target Platform**: Angular Web 浏览器、Cloudflare Worker、Durable Objects、R2 和本地 Supabase 验收环境。首阶段只保存当前设备本机媒体原文件和 ASR 文本。

**Project Type**: Local-first Angular Web 产品 + Cloudflare API + 共享 TypeScript API contracts。

**Performance Goals**:

- Web 首屏保持小于 1.5 s，验证方法为既有本地产品 E2E 的首屏计时。
- 本机任务 journal、Transcript 事务和任务索引操作目标小于 100 ms，验证方法为 Vitest timing assertion 和浏览器套件记录。
- 目录请求、任务状态和结算请求的 Worker 处理 p95 小于 200 ms，不包括供应商生成时间，验证方法为 API fixture timing。
- `packages/api-contracts` gzip 增量保持在 50 KB 以内，保留 tree-shaking 和无副作用入口，验证方法为构建产物扫描。
- 视频结果允许使用现有 64 MiB 业务上限，通过私有 R2 二进制结果对象避免把完整视频装入 JSON 或单个客户端 base64 请求，验证方法为大结果 fixture 和浏览器保存测试。

**Constraints**:

- 所有平台调用必须登录并通过服务端原子预占积分。
- 客户端不得接触供应商 URL、上游模型名、密钥引用、API Key、session、relay token 或本地文件路径。
- 现有 RelayTask 的 180 秒上游超时、210 秒 watchdog、24 小时保留期和单任务生命周期继续生效，媒体输入和结果对象必须在终态或过期时清理。
- 首阶段为联网异步任务，不支持声音克隆、实时语音、说话人分离、逐字时间轴、图生视频、视频编辑、混音、多轨和音视频原文件跨设备同步。
- ASR 文本不伪造音频 MIME 或 OPFS 文件。未知回执进入 `needs_review`，禁止自动重发。
- 旧图片路由、旧图片任务、旧备份导入和图片同步契约不得破坏。

**Scale/Scope**: 一个 Angular 产品、一个 Worker、一个共享 contracts 包、四类新 operation、一套共享任务生命周期、当前设备本机媒体历史和独立多模态 E2E。首期目录和任务数量沿用现有边界，目录最多 200 条能力项，任务和输入大小由目录逐项限制。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Initial check before Phase 0

| Constitution gate | Result | Evidence and plan constraint |
| --- | --- | --- |
| I. Code Quality | PASS | 复用现有 contracts、RelayTask、积分和 LocalMediaStore。新增 exported symbols 进入 `packages/*` 时补 TSDoc，保持 strict、禁止 `any`、最大三层嵌套。图片兼容适配器不删除旧路径。 |
| II. Testing Standards | PASS | 采用红-绿-重构。先为 ASR、音乐、目录、结果和 Transcript 写失败测试，再接线实现。单测、浏览器存储、API relay、fixture E2E 和正式验收按影响面分层。覆盖率以 `scripts/audit/coverage-check.mjs` 为准。 |
| III. User Experience Consistency | PASS | 功能在同一个 Angular 产品的 `/create` 入口提供加载、空、错误、待核查、保存失败和无障碍状态。共享 API contract 保持单一语义。该功能是 `aiao-media` 应用私有 UI，不要求 React/Vue 页面复制。 |
| IV. Performance Requirements | PASS | 计划已经记录首屏、数据库操作、Worker 非供应商处理、contracts gzip 增量和大视频结果的测量目标。关键路径新增 timing 和大结果证据。 |

Phase 0 没有未决的 `NEEDS CLARIFICATION`。供应商名称和模型由服务端能力目录配置，属于运行时配置决策，不进入公共契约。

## Phase 0 Research 结论

研究结论已写入 [research.md](./research.md)，核心决策如下。

- 统一使用 `RelayTask`，不扩展旧的 `PlatformCoordinator` 账本。
- 新增 `/api/media/capabilities`，保留图片 `/api/models`。
- 用 operation 联合类型表达 TTS、ASR、音乐和视频，ASR 单独拥有输入引用和 Transcript 结果。
- ASR 输入使用私有短期对象引用，不把音频 base64 放入任务快照。
- ASR JSON 继续使用现有密文结果 envelope，音视频二进制使用私有 R2 结果对象和 manifest，解决现有 24 MiB relay envelope 与视频 64 MiB 契约冲突。
- 积分继续使用 `BackendRelayCredits` 的 PostgreSQL RPC。
- TTS、音乐和视频复用 `LocalMediaAsset`。ASR 新增 `LocalTranscript`，不伪造文件生命周期。
- 图片 E2E 保持独立，新增多模态 fixture 和正式验收入口。

## Phase 1 Design 摘要

设计产物如下。

- [data-model.md](./data-model.md) 定义能力目录、任务、输入引用、结果 manifest、Transcript、积分状态、本机资产和提交 journal。
- [contracts/README.md](./contracts/README.md) 汇总客户端、Worker、任务、积分和本机交付契约。
- [contracts/capability-catalog.md](./contracts/capability-catalog.md) 定义多模态目录和私密配置边界。
- [contracts/media-generation-task.md](./contracts/media-generation-task.md) 定义统一任务、状态、结果和结算操作。
- [contracts/asr-input-transcript.md](./contracts/asr-input-transcript.md) 定义音频输入上传、引用、ASR 请求和 Transcript。
- [contracts/media-result-delivery.md](./contracts/media-result-delivery.md) 定义音视频 manifest、JSON 与二进制结果和本机写入顺序。
- [contracts/credits.md](./contracts/credits.md) 定义预占、结算、释放和幂等规则。
- [contracts/local-delivery.md](./contracts/local-delivery.md) 定义 RxDB/OPFS、Transcript、journal、作品库和同步边界。
- [quickstart.md](./quickstart.md) 定义 Nx 校验、fixture E2E、本地 Supabase 和正式 provider 验收。

### Implementation sequence

#### Phase A：统一契约、目录和任务底座

1. 在 `@aiao-media/api-contracts` 增加 capability、ASR input、Transcript、音乐 request/result、通用 task summary 和 media result manifest。
2. 将 `validateGenerationJobSummary` 改为按 `kind + operation` 分派，保留现有图片、TTS 和视频任务的兼容读取。
3. 新增 `GET /api/media/capabilities` 和 `MEDIA_PLATFORM_CAPABILITIES` 配置解析，目录响应过滤所有私密字段。
4. 将 `relay-task-api.ts` 的图片输入校验与新的媒体输入校验分离，统一生成受控内部 `Dispatch`。
5. 扩展 `RelayTask` 的结果 manifest、媒体二进制对象、清理和状态视图。图片任务继续使用旧密文结果路径。
6. 复用 `BackendRelayCredits`，将 operation、能力版本和输入摘要加入指纹。
7. 更新 `openapi.ts`、`worker-env.ts` 和 Wrangler 结果对象配置，并添加 API 契约、relay、catalog、敏感字段和结果清理测试。

#### Phase B：TTS 与 ASR

1. 在 `apps/api/src/media-provider.ts` 或同等服务端模块中实现 provider adapter。adapter 只接收已验证目录项和请求，负责请求体、供应商回执和 canonical result。
2. 新增 `/api/media/inputs` 的上传、校验、过期和删除流程，输入对象使用 `inputs/<id>` 命名空间。
3. 将 TTS 语言、声音、语速字段接入目录和请求，并复用音频真实性校验。
4. 在 Angular `/create` 中增加 TTS 和 ASR 模式，显示目录参数、积分、输入限制和任务状态。
5. 增加 `LocalTranscript`、通用 submission journal、文本复制和 `.txt` 下载。
6. 扩展刷新续接逻辑，ASR 输入上传、任务状态和 Transcript 结果都只绑定原 task id。

#### Phase C：音乐与视频

1. 增加音乐参数目录、提示词校验、音频结果 adapter 和 `LocalMediaAsset` operation 标识。
2. 复用视频请求和 MP4 校验基础，接入目录声明的画幅、时长和分辨率。
3. 让音频、视频结果使用 manifest 的实际 MIME、字节数、时长和画幅生成播放、下载和保存行为。
4. 增加超过当前 24 MiB JSON relay 限制的视频 R2 二进制 fixture，验证任务令牌保护、结果清理和本机写入恢复。

#### Phase D：作品库、删除和验收闭环

1. 扩展 `work-library-session.ts`、`library-query.ts` 和 Angular 模板，提供音频、视频和 Transcript 的筛选、详情、预览、复制、下载和删除。
2. 在 `browser-media.ts` 中统一恢复 `saving`、`deleting`、`broken`，新增 Transcript 事务恢复并保持图片路径原样。
3. 保留图片 backup/sync 入口，明确首期不上传音视频原文件。若需要媒体备份，必须新增版本和迁移测试，不在本阶段隐式扩展图片备份。
4. 新增独立的 `multimodal.config.ts`、fixture、E2E、provider acceptance-check 和真实验收脚本。
5. 按 [quickstart.md](./quickstart.md) 完成契约、API、Web、浏览器存储、fixture、Supabase 和正式 provider 证据。

## Project Structure

### Documentation

```text
specs/002-multimodal-media-generation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── README.md
│   ├── capability-catalog.md
│   ├── media-generation-task.md
│   ├── asr-input-transcript.md
│   ├── media-result-delivery.md
│   ├── credits.md
│   └── local-delivery.md
└── tasks.md                         # 由 /speckit-tasks 后续生成
```

### Source Code

```text
aiao-media/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── media-capabilities.ts       # 多模态目录和服务端配置
│   │   │   ├── media-input-api.ts           # ASR 输入对象上传与清理
│   │   │   ├── media-provider.ts            # provider adapter 与 canonical result
│   │   │   ├── relay-task.ts                # 通用任务状态、结果 manifest 和清理
│   │   │   ├── relay-task-api.ts            # 图片兼容适配和多模态请求分派
│   │   │   ├── relay-credits.ts             # 复用现有积分接口
│   │   │   ├── openapi.ts                   # 公开 API 文档
│   │   │   └── worker-env.ts                # 新增能力配置边界
│   │   ├── scripts/
│   │   │   ├── media-relay.test.mjs
│   │   │   └── media-input.test.mjs
│   │   └── wrangler.json                    # 私有输入/结果存储配置
│   ├── web/
│   │   └── src/
│   │       ├── app/
│   │       │   ├── local-image-mvp.ts       # 保留图片外壳，挂载媒体模式
│   │       │   ├── local-image-mvp.html
│   │       │   └── media-generation/
│   │       │       ├── media-generation.ts
│   │       │       ├── media-generation.html
│   │       │       ├── media-generation.css
│   │       │       ├── media-generation-client.ts
│   │       │       ├── media-generation-session.ts
│   │       │       └── media-generation-state.ts
│   │       └── local-data/
│   │           ├── browser-media.ts         # 音视频资产和 Transcript 注册
│   │           ├── media-result.ts           # 音视频 manifest 和 Blob 校验
│   │           ├── transcript-result.ts      # Transcript 校验
│   │           ├── media-submissions.ts      # 通用提交 journal
│   │           ├── local-collections.ts     # 通用任务投影
│   │           ├── library-query.ts
│   │           └── index.ts
│   ├── web-e2e/
│   │   ├── multimodal.config.ts
│   │   ├── src/
│   │   │   ├── multimodal-fixture.ts
│   │   │   └── multimodal-generation.spec.mts
│   │   └── scripts/
│   │       ├── multimodal-provider-acceptance-check.mjs
│   │       └── multimodal-provider-acceptance.mjs
│   └── desktop/                            # 只复用现有 API origin contract，不新增桌面 UI
└── packages/
    ├── api-contracts/
    │   └── src/contracts/
    │       ├── generation-jobs.ts            # operation union 和结果类型
    │       ├── generation-validation.ts     # 统一验证分派
    │       ├── media-capabilities.ts        # 目录类型和 validator
    │       ├── media-input.ts               # 输入引用
    │       ├── media-result.ts               # manifest 和 Transcript
    │       └── index.ts
    └── domain/                              # 不作为本故事主任务模型
```

**Structure Decision**：选择现有 `aiao-media` Angular + Worker + shared contracts 的 Web application 结构。图片应用入口和公共存储标识保持兼容，新增媒体 UI 放入独立目录，服务端将图片 adapter 与多模态 provider adapter 分开，ASR 文本在本机使用独立实体。共享 contract 包只承载协议，不把应用私有 Angular 组件或供应商 SDK 放入 `packages/*`。

## Testing Strategy

### Contract and shared package

- `aiao-media/packages/api-contracts/src/contracts/audio-validation.spec.ts`
- `aiao-media/packages/api-contracts/src/contracts/video-validation.spec.ts`
- 新增 `asr-validation.spec.ts`、`media-capabilities.spec.ts`、`media-result.spec.ts`
- `generation-validation.spec.ts` 增加旧任务回放、未知字段、operation 不匹配和敏感字段拒绝
- `contracts/index.spec.ts` 验证旧 `GenerationRequest` 兼容读取不影响新任务 validator

### API and task runtime

- `aiao-media/apps/api/src/platform-models.test.ts` 保留图片模型目录回归
- 新增 `media-capabilities.test.ts` 验证私密字段剥离和 policy 筛选
- `aiao-media/apps/api/scripts/relay-task.test.mjs` 和 `platform-relay.test.mjs` 增加四类 operation、重复提交、结果确认、释放、待核查、过期清理和 token 边界
- 新增 `media-input.test.mjs` 验证输入所有权、MIME、大小、时长、摘要和生命周期
- `openapi.test.ts` 验证新增路径与响应 schema
- API 覆盖率按现有 `relay-coverage` 和仓库 coverage script 执行

### Web and local-first

- 新增 `media-generation-session.spec.ts`、`media-generation-client.spec.ts`、`transcript-result.spec.ts` 和 `media-submissions.spec.ts`
- 扩展 `platform-generation-interactions.spec.ts`，覆盖登录、余额、目录、加载、错误、保存失败和待核查
- 扩展 `browser-media.spec.ts` 与 `browser-media.browser.test.ts`，覆盖真实 RxDB/OPFS 音视频和 Transcript 保存、刷新、损坏、删除恢复
- 扩展 `local-collections.spec.ts` 和 `library-query.spec.ts`，验证通用任务投影不破坏图片集合
- `local-backup.browser.test.ts` 继续证明现有图片 v1/v2 导入兼容，并明确本故事没有把原始音视频混入图片备份

### Product E2E and formal acceptance

- 保留现有 `platform-generation.spec.ts` 图片套件不变
- 新增 `multimodal-generation.spec.mts`，每种 operation 独立 fixture 和调用计数
- fixture 验证结果查看、播放或复制、下载、本机保存、刷新续接、保存失败重试和删除
- 正式 provider acceptance 为 TTS、ASR、音乐和视频分别保留任务 ID、真实结果 manifest、积分流水和本机保存证据

## Constitution Check after Phase 1 design

| Constitution gate | Result | Evidence and required verification |
| --- | --- | --- |
| I. Code Quality | PASS | 设计将 provider adapter、输入上传、任务状态、本机交付和 UI session 分开。新增公开符号的 TSDoc、strict、零 warning 和三层嵌套限制进入任务门禁。没有 any、客户端 Key 或隐藏 fallback。 |
| II. Testing Standards | PASS | 每个新 validator、状态转移、存储恢复和 UI 操作都有先失败再实现的测试位置。覆盖率按仓库脚本为准，fixture 与正式 provider 证据分开，provider acceptance 不进入默认全量测试。 |
| III. User Experience Consistency | PASS | 四类能力共享目录、登录、积分、任务状态、刷新续接、保存失败和错误语义。Angular 私有 UI 在 `/create` 统一呈现，作品库为音频、视频和 Transcript 定义播放、复制、下载、删除和无障碍状态。图片入口继续兼容。 |
| IV. Performance Requirements | PASS | 首屏、RxDB 事务、Worker 非供应商处理、contracts gzip 和大视频结果均有指标与验证入口。R2 结果对象避免视频经过 JSON/base64 传输。 |

设计后的 gate 通过。没有需要宪法例外批准的条目。

## Complexity Tracking

本节记录设计中有明确理由的额外复杂度，供实现和评审约束范围。

| 设计复杂度 | 为什么需要 | 被拒绝的更简单方案 |
| --- | --- | --- |
| 图片密文 JSON 与音视频 R2 二进制结果并存 | 兼容已有图片任务，同时支持 64 MiB 视频并避免把大文件装入 JSON 或客户端 base64 | 统一使用旧 24 MiB 密文 envelope 会与视频契约和 Worker 内存预算冲突 |
| `LocalTranscript` 独立实体 | ASR 输出是文本，缺少二进制文件、MIME 和 OPFS fileId | 把文本塞进 `LocalMediaAsset` 会伪造文件元数据并污染音视频恢复逻辑 |
| 通用 submission journal 加旧版本读取迁移 | ASR 输入和多任务并行需要统一幂等记录，同时必须保护已有 TTS/视频 v1 journal | 直接改写旧 journal 会覆盖用户未完成任务或让刷新续接失效 |
| 独立 `/api/media/capabilities` | 保持已有图片 `/api/models` 响应结构和用户行为 | 把新能力字段混入图片模型响应会破坏旧消费者和目录验证 |
| 独立多模态 E2E 和正式 acceptance | 图片 fixture、结果解析和计费证据均是图片专用 | 直接扩展图片套件会让音频、ASR 和视频的失败证据被图片假设掩盖 |

## Implementation Readiness

计划阶段产物已经具备进入 `/speckit-tasks` 的输入条件。实现前仍必须把 `MEDIA_PLATFORM_CAPABILITIES` 的实际部署配置和四类 provider adapter 回执格式写入任务和 fixture。此配置不会进入公共 contracts，也不需要在计划阶段选择具体供应商。
