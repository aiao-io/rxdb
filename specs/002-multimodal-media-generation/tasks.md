---

description: "MEDIA-US-111 implementation tasks"
---

# Tasks: Aiao Media 多模态媒体生成

**Input**: Design documents from `specs/002-multimodal-media-generation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Implementation rule**: 先写失败测试，再实现对应代码。所有任务必须通过 Nx 目标验证，不直接调用底层测试工具。

## Phase 1: Setup

- [X] T001 建立多模态 contracts 文件与现有 `generation-jobs.ts`、`generation-validation.ts`、`contracts/index.ts` 的导出关系
- [X] T002 建立多模态 API fixture 配置边界，扩展 `aiao-media/apps/api/src/worker-env.ts`、`wrangler.json` 与测试环境变量读取
- [X] T003 [P] 建立 `aiao-media/apps/web-e2e/multimodal.config.ts` 和 `aiao-media-e2e:multimodal-e2e` Nx target
- [X] T004 [P] 建立媒体能力和结果的测试 fixture 工厂，禁止使用真实账号、Key 或供应商 URL

## Phase 2: Foundational

- [X] T005 [P] 在 `aiao-media/packages/api-contracts/src/contracts/generation-jobs.ts` 增加 ASR、音乐、Transcript、输入引用和通用媒体结果类型
- [X] T006 [P] 在 `aiao-media/packages/api-contracts/src/contracts/generation-validation.ts` 增加 operation 分派、ASR 输入、音乐请求和 Transcript 校验
- [X] T007 [P] 在 `aiao-media/packages/api-contracts/src/contracts/media-capabilities.ts` 增加能力目录类型、公开字段校验和私密字段拒绝
- [X] T008 [P] 为 T005-T007 编写失败优先的 `asr-validation.spec.ts`、`music-validation.spec.ts`、`media-capabilities.spec.ts`、`media-result.spec.ts`
- [X] T009 扩展 `validateGenerationJobSummary` 与 `local-collections.ts`，保证旧图片任务和新增媒体任务都能读取 `tasks-v1`
- [X] T010 扩展 `aiao-media/apps/api/src/openapi.ts`，注册能力目录、输入上传和多模态结果响应 schema
- [X] T011 扩展 `aiao-media/apps/api/src/media-capabilities.ts`，实现服务端能力配置解析、目录裁剪和 operation 参数过滤
- [X] T012 在 `aiao-media/apps/api/src/local-first-worker.ts` 注册 `/api/media/capabilities`、`/api/media/inputs` 和通用 relay 路由
- [X] T013 扩展 `RelayTask` 内部 Dispatch、任务摘要和结果 manifest 字段，保持现有图片请求兼容
- [X] T014 扩展 `BackendRelayCredits` 调用边界，验证新 operation 复用预占、结算、释放和幂等指纹
- [X] T015 运行 `pnpm nx run api-contracts:test`、`pnpm nx run api-contracts:typecheck`、`pnpm nx run aiao-media-api:typecheck`，解决基础协议编译问题

## Phase 3: User Story 1 - 文本转语音（P1）

**Goal**: 登录用户从能力目录选择语言、声音和语速，生成、播放、下载并保存音频。

**Independent Test**: 使用 fixture TTS 能力从 `/create` 提交文本，验证任务只调用一次、音频 manifest 来自实际结果、OPFS 保存后刷新仍可播放和下载。

### Tests for User Story 1

- [X] T016 [P] [US1] 为 TTS 语言、声音、语速、长度和未知字段编写 contracts 失败测试
- [X] T017 [P] [US1] 为 TTS relay、积分结算、结果确认和保存失败重试编写 API 脚本测试
- [X] T018 [P] [US1] 为 TTS UI 登录、余额、加载、错误、保存和刷新续接编写 Angular 单测
- [X] T019 [US1] 在 `multimodal-generation.spec.mts` 增加 TTS fixture E2E，断言重复提交和本机重试不产生第二次调用

### Implementation for User Story 1

- [X] T020 [US1] 在 `aiao-media/apps/api/src/media-provider.ts` 实现 TTS provider adapter 和 canonical WAV result
- [X] T021 [US1] 在 `aiao-media/apps/api/src/relay-task-api.ts` 接入 TTS 请求，服务端重新验证目录、参数、账号和积分
- [X] T022 [US1] 扩展 `aiao-media/apps/web/src/app/relay-task-client.ts`，支持音频结果读取、manifest 校验、确认和待核查续接
- [X] T023 [US1] 扩展 `aiao-media/apps/web/src/local-data/media-result.ts`，支持 TTS 实际 MIME、摘要、时长和下载扩展名
- [X] T024 [US1] 在 `aiao-media/apps/web/src/app/media-generation/` 实现 TTS 表单、结果面板、试听、下载、保存失败重试和无障碍状态
- [X] T025 [US1] 将 TTS 模式挂载到 `local-image-mvp.ts`、`local-image-mvp.html` 的 `/create` 入口，保留图片模式行为
- [X] T026 [US1] 扩展 `browser-media.ts` 的音频任务保存和历史投影，确保保存后再确认积分

## Phase 4: User Story 2 - 语音转文本（P1）

**Goal**: 用户上传目录允许的音频，提交 ASR，查看、复制、下载和保存 Transcript。

**Independent Test**: 使用 fixture WAV 上传并识别，验证输入限制、语言信息、文本结果、刷新恢复、删除恢复和失败不伪造空文本。

### Tests for User Story 2

- [X] T027 [P] [US2] 为 `MediaInputReference`、MIME、大小、时长、SHA-256、过期和所有权编写失败测试
- [X] T028 [P] [US2] 为 ASR 空结果、语言识别、上游拒绝、超时和 `needs_review` 编写 API 测试
- [X] T029 [P] [US2] 为 `LocalTranscript` 保存、损坏、删除中断和刷新恢复编写浏览器存储测试
- [X] T030 [US2] 在多模态 E2E 中增加 ASR 上传、复制、文本下载、刷新和错误路径

### Implementation for User Story 2

- [X] T031 [US2] 在 `aiao-media/apps/api/src/media-input-api.ts` 实现短期私有音频输入上传、摘要校验、过期和删除
- [X] T032 [US2] 在 `aiao-media/apps/api/src/media-provider.ts` 实现 ASR adapter 和 Transcript canonical result
- [X] T033 [US2] 在 `relay-task-api.ts` 接入 ASR 输入引用验证，禁止原始音频字节进入任务摘要和日志
- [X] T034 [US2] 在 `browser-media.ts` 注册 `LocalTranscript`，实现保存、读取、删除和恢复状态机
- [X] T035 [US2] 新增 `transcript-result.ts` 和 `media-submissions.ts`，兼容读取旧音频/视频提交 journal
- [X] T036 [US2] 在 Angular 媒体面板实现 ASR 文件选择、语言选择、文本结果、复制、下载和保存状态
- [X] T037 [US2] 扩展 `local-collections.ts`、作品库查询和任务历史，显示 Transcript 但不接入图片远端同步

## Phase 5: User Story 3 - 音乐生成（P2）

**Goal**: 用户输入音乐提示词和目录参数，生成、播放、下载并保存音频。

**Independent Test**: 使用 fixture 音乐能力完成一次任务，验证参数限制、实际音频结果、刷新恢复和积分状态。

### Tests for User Story 3

- [X] T038 [P] [US3] 为音乐参数、提示词长度、输出格式和目录唯一性编写 contracts 失败测试
- [X] T039 [P] [US3] 为音乐 relay、上游拒绝、超时、结果为空和积分释放编写 API 测试
- [X] T040 [US3] 在多模态 E2E 中增加音乐播放、下载、保存和待核查路径

### Implementation for User Story 3

- [X] T041 [US3] 在 `generation-jobs.ts` 和 `generation-validation.ts` 接入 `MusicJobRequest`、`MusicGenerationJobSummary` 和目录参数
- [X] T042 [US3] 在 `media-provider.ts` 实现音乐 provider adapter，统一为受控音频结果
- [X] T043 [US3] 复用 `LocalMediaAsset` 保存音乐结果，记录 operation 和真实 manifest
- [X] T044 [US3] 在媒体面板增加音乐模式、参数选择、试听、下载和本机保存
- [X] T045 [US3] 为音乐任务增加刷新续接、重复提交保护和结果删除测试

## Phase 6: User Story 4 - 视频生成（P2）

**Goal**: 用户输入视频提示词和目录参数，生成、播放、下载并保存视频。

**Independent Test**: 使用 fixture MP4 完成任务，验证 64 MiB 内结果对象、真实尺寸/时长、刷新续接和 OPFS 恢复。

### Tests for User Story 4

- [X] T046 [P] [US4] 为视频 manifest、尺寸、时长、codec、结果对象大小和未知 URL 编写 contracts 失败测试
- [X] T047 [P] [US4] 为大结果 R2、任务令牌、过期清理、确认和释放编写 API 脚本测试
- [X] T048 [P] [US4] 为视频解码、保存失败、删除中断和刷新恢复编写浏览器测试
- [X] T049 [US4] 在多模态 E2E 中增加视频播放、真实 manifest、下载、保存和任务续接

### Implementation for User Story 4

- [X] T050 [US4] 扩展 RelayTask 结果对象路径，支持视频二进制 manifest，避免 JSON/base64 24 MiB 限制
- [X] T051 [US4] 在 `media-provider.ts` 实现视频 provider adapter 和服务端结果规范化
- [X] T052 [US4] 扩展 `media-result.ts` 和浏览器保存流程，校验真实 MP4 容器、尺寸、时长和 codec
- [X] T053 [US4] 在媒体面板增加视频模式、画幅/时长选择、播放、下载和保存失败重试
- [X] T054 [US4] 验证图片旧 relay、图片备份、图片同步和现有视频契约没有回归

## Phase 7: Polish and Cross-Cutting Validation

- [X] T055 [P] 扩展 `aiao-media/apps/api/src/openapi.test.ts` 和敏感字段扫描，确认客户端产物、日志、任务快照、备份和同步不含凭据
- [X] T056 [P] 扩展多模态 E2E fixture，覆盖双击、双标签、短断网、刷新、关闭页面和不自动重发
- [X] T057 [P] 更新 `aiao-media/apps/web-e2e` 的正式多模态 acceptance-check，四类能力分别记录任务 ID、manifest、积分和本机保存证据
- [X] T058 执行 `pnpm nx run aiao-media:requirements-check --output-style=static`
- [X] T059 执行 `pnpm nx run api-contracts:test && pnpm nx run api-contracts:typecheck && pnpm nx run api-contracts:lint`
- [X] T060 执行 `pnpm nx run aiao-media-api:test && pnpm nx run aiao-media-api:typecheck && pnpm nx run aiao-media-api:lint`
- [X] T061 执行 `pnpm nx run aiao-media:test && pnpm nx run aiao-media:test-browser && pnpm nx run aiao-media:typecheck && pnpm nx run aiao-media:lint`
- [X] T062 执行 `pnpm nx run aiao-media-e2e:multimodal-e2e`，确认 fixture 端到端闭环
- [X] T063 执行 quickstart.md 中的本地 Supabase 验证和部署 dry-run
- [X] T064 运行 `git diff --check`、文档链接检查和最终敏感字段扫描
- [ ] T065 使用评审账号和正式发布凭据执行 TTS、ASR、音乐、视频 acceptance，记录真实任务、manifest、积分和本机保存证据

## Phase 8: Implementation closeout

- [X] T066 [P] 为 provider URL 结果、同源校验、authorization 不持久化、禁止重定向和结果下载上限补齐 API 失败测试与实现
- [X] T067 [P] 将能力目录 `maxDurationMs` 接入音频和视频结果校验，统一视频默认契约上限并补齐超时长结果测试
- [X] T068 [P] 要求视频 manifest 使用真实容器或 provider 实际 metadata，移除请求参数 fallback，升级视频 fixture 并补齐缺失 metadata 测试
- [X] T069 [P] 为 ASR 输入上传增加同源写校验，并让输入删除失败时保留本机引用和可重试状态
- [X] T070 重新运行 API、contracts、Web 和浏览器目标，修复新增边界导致的类型、lint 或测试失败
- [X] T071 运行多模态 fixture E2E、需求链接检查、敏感字段扫描和 `git diff --check`，记录验证结果
- [X] T072 同步 MEDIA-US-111 story、capability matrix、status overview 和 MEDIA-EPIC-002，保留 T065 的正式 provider 验收为外部门禁

## Dependencies & Execution Order

- Phase 1 无代码依赖。
- Phase 2 阻塞所有用户故事。
- US1 与 US2 都是 P1。US1 依赖统一任务底座，US2 还依赖输入对象和 Transcript 模型。
- US3 依赖 US1 的音频结果交付，但可以在 TTS adapter 完成后并行实现。
- US4 依赖 RelayTask 二进制结果 manifest，必须在视频大结果测试通过后接 UI。
- Phase 7 依赖四个用户故事和所有对应测试完成。
- Phase 8 依赖 Phase 7 的本地与 fixture 验证，T065 仍依赖外部正式 provider 凭据。

## Parallel Opportunities

- T005、T006、T007、T008 可以在不同文件中并行。
- T016、T017、T018 可以并行编写失败测试。
- T027、T028、T029 可以并行编写失败测试。
- T038、T039 可以并行编写失败测试。
- T046、T047、T048 可以并行编写失败测试。
- T055、T056、T057 可以并行准备验收工具，但正式运行必须串行。
- T066、T067、T068、T069 可以在不同文件中并行实现，T070 和 T071 必须在这些修改完成后串行执行。

## Implementation Strategy

1. 完成 Phase 1 和 Phase 2，先让共享 contracts、catalog、relay 和旧图片测试继续通过。
2. 完成 US1 和 US2，先得到可验证的 P1 音频闭环。
3. 完成 US3 和 US4，补齐音乐和视频。
4. 完成 Phase 7 的本地和 fixture 门禁。
5. 正式 provider 调用需要外部账号、能力配置和部署环境，不能用 fixture 结果替代。
