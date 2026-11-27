---
description: 'Supabase-first 后台与 RxDB 同步架构的实施任务'
---

# Tasks: Supabase-first 后台与 RxDB 同步架构

**Input**: Design documents from `/specs/001-supabase-rxdb-backend/`

**Prerequisites**: [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)、[data-model.md](data-model.md)、[contracts/](contracts/)

**Execution rule**: 按阶段执行；测试任务先于对应实现任务。所有 `packages/*` 改动必须同步三框架检查和覆盖率门禁。PGMQ 任务只建立可回退 PoC，不删除 Durable Object。

## Phase 1: Setup and design validation

**Purpose**: 固化分支、配置、契约和可运行的测试入口。

- [x] T001 [P] 验证 `specs/001-supabase-rxdb-backend/` 下 spec、plan、research、data-model、contracts、quickstart 和 checklist 结构完整。
- [x] T002 [P] 在 `aiao-media/infra/supabase/functions/` 建立 Edge Function 本地开发入口、环境变量示例和部署说明，不提交任何真实 secret。
- [x] T003 [P] 在 `aiao-media/apps/api/src/` 建立 backend-rxdb 与 pgmq consumer 的测试占位和最小配置类型，保持 Node/Worker 构建可区分。
- [x] T004 [P] 在 `aiao-media/packages/domain/src/` 盘点现有领域实体、命名和导出边界，确定新增实体不会与现有 API contracts 重名。
- [x] T005 [P] 将 [quickstart.md](quickstart.md) 中的验证命令映射到 Nx project target，记录无法在本地执行的真实 Supabase/双区域步骤。

**Checkpoint**: 设计文件和测试入口可被仓库需求门禁识别；不包含 secret 或生产迁移。

## Phase 2: Foundational security and data contracts

**Purpose**: 建立所有用户故事依赖的权限、身份、RLS、幂等和领域契约。

- [x] T006 为普通 RPC、管理员 membership、审计和 `auth.uid()` 身份来源补充失败测试，覆盖匿名、普通用户、撤权管理员和伪造 actor。
- [x] T007 为 Edge Function 请求/响应、401/403、service role 不泄漏和 requestId 幂等补充 contract tests，使用 `aiao-media/infra/supabase/functions/admin-api/*.spec.ts`。
- [x] T008 为 `MediaConfigCommit`、`MediaConfigCommitChange`、状态转换、fingerprint、parentIds 和 operationId 写实体/契约失败测试，放在 `aiao-media/packages/domain/src/*.spec.ts`。
- [x] T009 为 PGMQ 最小消息 schema、禁止敏感字段和 taskRevision 失败测试，放在 `aiao-media/apps/api/src/pgmq-message.test.ts`。
- [x] T010 [P] 新增 `aiao-media/infra/supabase/migrations/0xx-admin-direct-boundary.sql`：补普通 RPC 的调用者身份检查、管理员读取 view/RPC、审计唯一约束和必要 grants。
- [x] T011 [P] 新增 `aiao-media/infra/supabase/migrations/0xx-config-commit-projection.sql`：创建 commit/commit change projection 表、RLS、唯一约束、索引和状态约束。
- [x] T012 [P] 新增 `aiao-media/infra/supabase/migrations/0xx-pgmq-generation.sql`：创建 PoC queue、事务入队函数和最小任务消息校验，不接入生产任务路由。
- [x] T013 复核新 migration 的顺序、命名、回滚边界和本地 Supabase init 清单；补 `aiao-media/scripts/supabase/` 的 schema contract 检查。

**Checkpoint**: 基础权限、数据契约和迁移可在本地 Supabase 应用；测试先红后绿。

## Phase 3: User Story 1 - Admin 统一登录并安全管理平台用户 (Priority: P1)

**Goal**: Admin 普通业务直接访问 Supabase，Auth Admin/封禁/service role 仅通过 Edge Function。

**Independent Test**: Admin 登录、普通业务查询、Auth 用户列表和封禁操作分别走正确入口，匿名/普通用户/撤权管理员无法调用特权操作。

### Tests for User Story 1

- [x] T014 [P] [US1] 为 Admin Supabase Auth 登录、刷新、退出、过期和旧 session 迁移补 Vitest 测试，文件 `aiao-media/apps/admin/src/app/app.spec.ts`。
- [x] T015 [P] [US1] 为 `ProductClient` 普通 PostgREST/RPC 和 Edge Function 分流补测试，文件 `aiao-media/apps/admin/src/app/product-client.spec.ts`。
- [x] T016 [P] [US1] 为 Edge Function admin-api 的管理员校验、封禁/解禁、幂等和错误码补 Node/Edge contract tests。
- [x] T017 [P] [US1] 为生产 Admin bundle 不包含 secret/service role 和旧 `/api/admin/login` 新调用方补构建/静态检查脚本。

### Implementation for User Story 1

- [x] T018 [US1] 在 `aiao-media/apps/admin/src/app/app.ts` 接入 Supabase Auth client、会话恢复、刷新、退出和旧 session 迁移兼容。
- [x] T019 [US1] 在 `aiao-media/apps/admin/src/app/product-client.ts` 增加普通 Supabase 业务请求和 `supabase.functions.invoke('admin-api')` 请求，保留统一错误映射。
- [x] T020 [US1] 在 `aiao-media/infra/supabase/functions/admin-api/index.ts` 实现 JWT、账号状态和管理员 membership 校验；service role 只在函数内部初始化。
- [x] T021 [US1] 在 `aiao-media/infra/supabase/functions/admin-api/index.ts` 实现用户列表、封禁/解禁和特权动作路由，统一 requestId、审计和错误响应。
- [x] T022 [US1] 修改 `aiao-media/apps/api/src/admin-api.ts` 为迁移兼容层，禁止新增普通业务调用，保留明确的弃用响应/日志。
- [x] T023 [US1] 删除 Admin 对 `/api/admin/login` 的新调用路径，更新 `aiao-media/apps/admin/src/app/app.html` 的登录/错误状态显示。
- [x] T024 [US1] 更新 Supabase migration、Edge Function secrets 文档和 Admin 运行时配置，确保浏览器 bundle 只有 publishable/anon 兼容 key。

**Checkpoint**: US1 独立可验收；普通请求直连，特权请求 Edge Function，旧路径仍可按迁移窗口兼容。

## Phase 4: User Story 2 - 后台服务同步共享业务数据 (Priority: P1)

**Goal**: Node 后台服务使用普通 JWT 运行 RxDB，并与 Supabase 双向同步业务实体和分支元数据。

**Independent Test**: 两个 RxDB 节点完成 pull/push、断网重启、Realtime 和 revision 冲突，不丢变更、不重复应用、不绕过 RLS。

### Tests for User Story 2

- [x] T025 [P] [US2] 为后台 RxDB 实例创建、远端身份/RLS 自检和关闭生命周期补测试，文件 `aiao-media/apps/api/src/backend-rxdb/backend-rxdb.test.ts`。
- [x] T026 [P] [US2] 为普通 JWT、workspace 边界、同步游标恢复、重复推送和远端 backend mismatch 补 integration tests。
- [x] T027 [P] [US2] 为 Realtime 断线、重复通知、revision 冲突和删除 tombstone 补同步回归测试。

### Implementation for User Story 2

- [x] T028 [US2] 在 `aiao-media/apps/api/src/backend-rxdb/backend-rxdb.ts` 实现本地 adapter、Supabase adapter、history、sync 和 working-tree 的后台装配。
- [x] T029 [US2] 在 `aiao-media/apps/api/src/backend-rxdb/backend-rxdb-auth.ts` 实现普通 JWT/专用服务账号注入和过期处理，拒绝 service role 作为普通同步身份。
- [x] T030 [US2] 在 `aiao-media/apps/api/src/backend-rxdb/backend-rxdb-lifecycle.ts` 实现启动、pull/push、Realtime、重试、暂停、恢复和优雅关闭。
- [x] T031 [US2] 在 `aiao-media/packages/domain/src/` 定义第一批共享媒体配置实体和 RxDB schema，补 workspace、revision、createdBy、updatedBy、branchId 字段。
- [x] T032 [US2] 在 `aiao-media/apps/api/src/` 增加后台同步节点的 Node 运行入口和配置校验，禁止把凭据写入日志或本地业务实体。
- [x] T033 [US2] 用本地 Supabase contract 和 API 入口验证后台节点与前端共享实体、RLS 和冲突语义。

**Checkpoint**: US2 独立可验收；后台重启/断网可恢复，普通 JWT 权限有效。

## Phase 5: User Story 3 - 管理员用模型驱动界面编辑配置 (Priority: P2)

**Goal**: Admin 配置页由 RxDB entity/repository 和 `rxdb-model-angular` 驱动。

**Independent Test**: 管理员完成列表、详情、编辑、校验、离线保存和刷新恢复，状态来自本地实体并可显示冲突/同步结果。

### Tests for User Story 3

- [x] T034 [P] [US3] 为共享领域实体 schema、字段元数据、关系和 repository 补测试，文件 `aiao-media/packages/domain/src/*.spec.ts`。
- [x] T035 [P] [US3] 为 Admin Entity List/Detail/Form/Table 的配置编辑、校验、空态、加载态和错误态补组件测试。（2026-11-16：`admin-config-entity.spec.ts` 用真实 PGlite RxDB 渲染 `rxdb-entity-list`，覆盖工作区查询、空态、加载、必填与格式校验、重复标识、保存与行内编辑；读取失败由宿主状态组件承担，见[交付记录](../../aiao-media/requirements/plans/config-sync-delivery-20261116.md)）
- [x] T036 [P] [US3] 为 Admin 断网编辑、刷新恢复、冲突显示和未提交状态补 Playwright/组件集成测试。（2026-11-16：`product-local.spec.mts` 三条真实浏览器用例覆盖断网编辑、刷新恢复未提交状态、联网同步与冲突显示）

### Implementation for User Story 3

- [x] T037 [US3] 在 `aiao-media/packages/domain/src/` 导出 `MediaPromptTemplate`、`MediaProviderPolicy`、`MediaPlatformModel` 和字段描述，补 TSDoc 与 schema。
- [x] T038 [US3] 在 `aiao-media/apps/admin/src/app/` 建立 RxDB repository、查询和配置编辑 facade，统一本地读写与同步状态。
- [x] T039 [US3] 将 `aiao-media/apps/admin/src/app/admin-console.ts` 的模板/策略配置状态迁移到共享实体和 repository。
- [x] T040 [US3] 将 `aiao-media/apps/admin/src/app/app.html` 的配置入口接入 `rxdb-model-angular`，由 `AdminConfigModelComponent` 提供列表、详情、表单和筛选。
- [x] T041 [US3] 为配置界面补 loading、empty、error、conflict、offline 和无权限状态，符合 WCAG 2.1 AA。（2026-11-16：`AdminConfigStateComponent` 与配置页接入；无权限与权限未确认时不渲染特权控件；e2e 对状态区与提交详情跑 axe WCAG 2.1 AA 无违规）
- [x] T042 [US3] 运行 `tri-framework-check` 需要覆盖的公共实体和 `rxdb-model` API 对称检查，Aiao Media Angular 私有页面记录范围例外。

**Checkpoint**: US3 可独立完成配置查看、编辑、校验和离线恢复；不改变 Auth Admin 特权边界。

## Phase 6: User Story 4 - 配置分支和提交可被后台应用 (Priority: P2)

**Goal**: 配置提交经领域 projection 同步，后台校验后原子应用/发布/拒绝。

**Independent Test**: 多实体分支提交经过 projection、补偿扫描、重复推送、冲突和 apply RPC，结果可追踪和可回滚。

### Tests for User Story 4

- [x] T043 [P] [US4] 为 `MediaConfigCommit`/`MediaConfigCommitChange` projection 生成、唯一键、fingerprint 和补偿扫描补测试。
- [x] T044 [P] [US4] 为 branch/working-tree/commit 捕获、提交状态和分支合并补 working-tree integration tests。（2026-11-16：`admin-config-working-tree.rxdb.spec.ts` 在真实 RxDB 工作树上覆盖捕获、提交事件、补偿、配置分支与合并预览冲突）
- [x] T045 [P] [US4] 为 `apply_media_config_commit` 的完整性、parent、revision、幂等、部分失败回滚和审计补 Supabase integration tests。
- [x] T046 [P] [US4] 为后台 UI 显示 branch、commit、sync、apply、release 和 rejection 状态补组件测试。（2026-11-16：`admin-config-status.spec.ts` 用真实模板覆盖分支、提交、同步、应用、发布、拒绝与回滚确认）

### Implementation for User Story 4

- [x] T047 [US4] 在 `aiao-media/packages/domain/src/` 增加 `MediaConfigCommit`、`MediaConfigCommitChange` schema、repository 和状态转换。
- [x] T048 [US4] 在 `aiao-media/apps/admin/src/app/` 监听 working-tree commit，生成领域 projection，支持启动补偿扫描和唯一 operationId。
- [x] T049 [US4] 在 `aiao-media/apps/api/src/backend-rxdb/` 拉取、校验和缓存完整 commit envelope，拒绝不完整或 fingerprint 不匹配的提交。
- [x] T050 [US4] 实现 `apply_media_config_commit` migration/RPC，在同一事务中应用配置、写审计、更新 commit 状态和返回 revision。
- [x] T051 [US4] 将 branch metadata、配置实体和 projection 接入现有 sync/syncBranches，禁止同步 RxDB 内部系统实体。（2026-11-16：迁移 `023-config-rxdb-sync.sql`、领域同步计划与后台节点 `openBackendConfigRxdb`；配置实体 Filter 双向同步、投影 QueryCache 读取，系统实体被领域层拒绝；远端分支仍只开放 main）
- [x] T052 [US4] 在 Admin 配置详情显示提交状态、操作者、父提交、冲突、应用和发布结果，并支持安全回滚入口。（2026-11-16：`AdminConfigCommitComponent` 显示状态、操作者、全部父提交、冲突、应用与发布时间，安全回滚带页内确认）

**Checkpoint**: US4 可独立验证配置变更的可追踪、幂等、冲突和原子应用。

## Phase 7: User Story 5 - 评估 PGMQ 作为任务调度层 (Priority: P3)

**Goal**: 建立隔离的 PGMQ consumer PoC，输出是否迁移的证据，不改变当前 Durable Object 生产路径。

**Independent Test**: 完成事务入队、重复消费、provider 成功后崩溃、visibility timeout、重启、结果清理、积压和双区域演练。

### Tests for User Story 5

- [x] T053 [P] [US5] 为事务入队和失败回滚补 Supabase integration test。
- [x] T054 [P] [US5] 为 PGMQ message schema、visibility timeout、重复消息和 taskRevision CAS 补 Node tests。
- [x] T055 [P] [US5] 为 provider 成功后 ack 前崩溃、结果唯一性、积分不重复结算补 fault-injection test。
- [x] T056 [P] [US5] 为 consumer 重启、滚动发布、积压、死信和指标补 integration/operational test。

### Implementation for User Story 5

- [x] T057 [US5] 在 `aiao-media/apps/api/src/pgmq-consumer.ts` 实现隔离 consumer：读取最小消息、读取任务正文、调用 provider、写结果、CAS 更新、ack/archive。
- [x] T058 [US5] 在 `aiao-media/apps/api/src/pgmq-idempotency.ts` 实现 task lease、result unique key、积分结算 guard 和 provider idempotency key 适配。
- [x] T059 [US5] 在 `aiao-media/infra/supabase/migrations/` 实现事务入队、queue policy、重试/归档和监控查询，不接管现有生产任务。
- [x] T060 [US5] 在 `aiao-media/apps/api/scripts/` 增加 provider 成功后崩溃、visibility timeout、consumer restart 和结果过期清理演练脚本。
- [x] T061 [US5] 在 `aiao-media/requirements/plans/` 记录 PGMQ 与 Durable Object 对比结果、性能/故障数据和切换建议。
- [x] T062 [US5] 明确并验证 PGMQ PoC 失败时的 Durable Object 回退路径和生产配置不变。

**Checkpoint**: US5 只在隔离环境完成；生产任务链路仍由 Durable Object 承担。

## Phase 8: Polish and validation

- [x] T063 [P] 更新 `aiao-media/requirements/` 用户故事、架构评审、roadmap、status-overview 和 capability-matrix 的实现状态与证据链接。
- [x] T064 [P] 运行相关 packages 的 `tri-framework-check`，修复公共 API 不对称、TSDoc 和导出问题。
- [x] T065 [P] 为 `packages/domain`、修改过的 RxDB plugin/adapter 和 Admin/API 运行 coverage-gate，达到仓库阈值。
- [x] T066 运行 `pnpm nx run aiao-media:requirements-check`、受影响 lint/typecheck/test/build 和本地 Supabase integration。
- [x] T067 运行 Admin bundle secret scan、RLS negative tests、Edge Function contract tests 和 PGMQ fault-injection suite。
- [x] T068 更新 `specs/001-supabase-rxdb-backend/quickstart.md`、迁移说明和回滚说明，记录真实环境尚未验收的边界。

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 可立即开始；Phase 2 依赖设计文件完成。
- Phase 2 完成后才能开始 US1/US2。
- US3 依赖 US1 的权限边界和 US2 的后台/共享实体基础。
- US4 依赖 US2、US3 和 commit projection migration。
- US5 可与 US3/US4 并行，但不能修改当前 Durable Object 生产入口。
- Phase 8 依赖目标用户故事和对应验证完成。

### User Story Dependencies

- **US1 (P1)**: 依赖 Phase 2；可独立交付 Admin Auth/权限边界。
- **US2 (P1)**: 依赖 Phase 2；可与 US1 的 Edge Function 开发并行，但必须共享普通 JWT/RLS 契约。
- **US3 (P2)**: 依赖 US1、US2；Admin Angular 私有 UI，公共实体仍需三框架 API 对称。
- **US4 (P2)**: 依赖 US2、US3；不可直接同步 RxDB 内部系统表。
- **US5 (P3)**: 依赖现有 US108/US109 任务和积分契约；与 US3/US4 文件范围不冲突。

### Parallel Opportunities

- T002–T005 可并行。
- T010–T012 可并行；T013 顺序执行。
- T014–T017 可并行；T018–T024 依文件依赖顺序执行。
- T025–T027 可并行；T028–T033 顺序执行。
- T034–T036 可并行；T037–T042 依实体和 repository 顺序执行。
- T043–T046 可并行；T047–T052 依 projection/apply contract 顺序执行。
- T053–T056 可并行；T057–T062 顺序执行。
- T063–T065 可并行；T066–T068 顺序执行。

## Implementation Strategy

### MVP First

1. 完成 Phase 1/2。
2. 完成 US1：Admin Auth、普通 Supabase 访问和特权 Edge Function。
3. 完成 US2：后台 RxDB 同步节点。
4. 在 US1/US2 checkpoint 验证后，再进入 `rxdb-model` 和 commit projection。

### Incremental Delivery

- 交付一：Admin 普通业务直连 + Edge Function 特权边界。
- 交付二：后台服务 RxDB 双向同步。
- 交付三：Admin `rxdb-model` 配置编辑。
- 交付四：branch/commit projection 和原子 apply。
- 交付五：PGMQ PoC 评估，决定是否进入后续迁移。

## Notes

- `[P]` 只用于不同文件且没有未完成依赖的任务。
- 每个测试任务必须先产生预期失败，再执行对应实现任务。
- 公共包变更必须同步 Angular/React/Vue API 对称和 coverage 检查。
- 不把 PGMQ PoC 的通过写成生产迁移；必须有故障数据和回退结论。
- 任务完成后必须把对应 checkbox 标为 `[X]`，不能只在代码中完成而遗漏任务状态。
