---
description: 'Task list: 移植 rxdb-model 实体模型库与三框架 UI 组件集'
---

# Tasks: 移植 rxdb-model 实体模型库与三框架 UI 组件集

**Input**: Design documents from `/specs/002-rxdb-model-port/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D8 决策), data-model.md, contracts/, quickstart.md

**Tests**: 包含——spec FR-013 与宪法 II 强制 TDD；移植顺序为「先落 spec（红）→ 再落 src（绿）」。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- 核心包：`packages/rxdb-model/`（js-lib，参照 `packages/rxdb-plugin-search` 惯例）
- Angular 包：`packages/rxdb-model-angular/`（angular-lib，参照 `packages/rxdb-angular` 惯例）
- React/Vue 包：`packages/rxdb-model-react/` / `packages/rxdb-model-vue/`
- Demo：`apps/dev-rxdb-angular|react|vue/src/app/pages/entity/`
- 源文件：企业版 `/Users/jimmy/Documents/aiao/aiao-enterprise/packages/rxdb-model|rxdb-model-angular/src/`（搬运源）

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 依赖落地、双包脚手架、工作区接入

- [x] T001 [P] 根 `package.json` devDependencies 增加 `@visactor/vtable ~1.26.x` 与 `@visactor/vtable-editors ~1.26.x`（锁 1.26.6 实际版本），执行 `pnpm install`
- [x] T002 [P] 脚手架 `packages/rxdb-model/`：`project.json`（name/tags ["js-lib"]/typecheck/coverage target）、`package.json`（deps: `@aiao/rxdb` workspace:*、`uuid ^14.0.1`、`rxjs ^7.8.2`；peerDeps: vtable ×2）、`tsconfig.json`/`tsconfig.lib.json`/`tsconfig.spec.json`、`vite.config.mts`（参照 rxdb-plugin-search，含 dts 插件；**不需要** legacyDecoratorTransform）、`eslint.config.mjs`、空 `src/index.ts`
- [x] T003 [P] 脚手架 `packages/rxdb-model-angular/`：`project.json`（tags ["angular-lib"]，build 用 `@nx/angular:package` + `nx-release-publish`，test 用 vitest）、`package.json`（peerDeps: `@angular/core|common|forms|cdk` 22.x、`@aiao/rxdb`、`@aiao/rxdb-angular`、`@aiao/rxdb-model`、`@visactor/vtable`、`@lucide/angular`、`rxjs`）、`ng-package.json`（assets 含 `./tailwind.css`）、`tsconfig.json`/`tsconfig.lib.json`/`tsconfig.lib.prod.json`（partial 编译）/`tsconfig.spec.json`、`vite.config.mts`（@analogjs + happy-dom + forks pool）、`eslint.config.mjs`、`src/test-setup.ts`、空 `src/index.ts`、空 `tailwind.css`
- [x] T004 注册 `tsconfig.base.json` paths：`@aiao/rxdb-model` → `packages/rxdb-model/src/index.ts`、`@aiao/rxdb-model-angular` → `packages/rxdb-model-angular/src/index.ts`
- [x] T005 更新 `requirements/status-overview.md`：调整「US-401 / US-701 查询构建器系列不在本仓库范围内」表述（本特性引入该范围），登记本特性（关联 `specs/002-rxdb-model-port`）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 空包基线全绿，证明脚手架与门禁链路可用

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 [P] 空入口基线：`pnpm nx typecheck rxdb-model && pnpm nx lint rxdb-model && pnpm nx test rxdb-model && pnpm nx build rxdb-model` 全绿
- [x] T007 [P] 空入口基线：`pnpm nx typecheck rxdb-model-angular && pnpm nx lint rxdb-model-angular && pnpm nx test rxdb-model-angular && pnpm nx build rxdb-model-angular` 全绿
- [x] T008 生成初始 `requirements/api-baseline/rxdb-model.json` 与 `rxdb-model-angular.json`（`pnpm audit:api-surface:update`），确认 `pnpm audit:api-surface --check` 通过

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - 实体元数据驱动的核心能力库 (Priority: P1) 🎯 MVP

**Goal**: `packages/rxdb-model` 完整落地——从 EntityMetadata 派生表单/详情/表格列/查询树 + 值解析校验 + 结构比较 + VTable 基础设施与编辑器（spec US1 验收场景 1–8）

**Independent Test**: `pnpm nx test rxdb-model` 全绿；用 `@aiao/rxdb-test` 的 Todo 元数据做派生抽验（quickstart Phase 2 第 6 步）

### Tests for User Story 1（先红）⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] 搬运基础工具组 spec（红）：`packages/rxdb-model/src/structural-equal.spec.ts`、`entity-value.utils.spec.ts`、`entity-field.utils.spec.ts`（源：企业版同名文件，import 适配 `@aiao/rxdb`）
- [x] T010 [P] [US1] 搬运 entity-form + entity-detail spec（红）：`packages/rxdb-model/src/entity-form/form.spec.ts`、`src/entity-detail/detail-tabs.spec.ts`
- [x] T011 [P] [US1] 搬运 query-builder spec（红）：`src/query-builder/models/query-builder-state.spec.ts`、`services/{operator-registry,query-builder,query-converter,schema-parser,validation}.service.spec.ts`、`utils/{date,field-tree,metadata-field-extractor,popover-position,schema-factory,structural-equal,value-input}.spec.ts`（含 happy-dom pragma 的保留 pragma）
- [x] T012 [P] [US1] 搬运 entity-table spec（红）：`src/entity-table/columns/{column-utils,build-editable-columns}.spec.ts`、`src/entity-table/editors/{key-value-editor,lucide-svg,safe-list-editor}.spec.ts`、`src/entity-table/vtable/{table-clipboard,table-clipboard-delete,table-factory,table-keyboard,table-operations,table-theme,table-tooltip,vtable-compat}.spec.ts`（保留 `// @vitest-environment happy-dom` pragma 与 vi.mock 打桩）

### Implementation for User Story 1

- [x] T013 [P] [US1] 搬运基础工具组 src（绿）：`packages/rxdb-model/src/structural-equal.ts`、`entity-value.utils.ts`、`entity-field.utils.ts`
- [x] T014 [P] [US1] 搬运 entity-form + entity-detail src（绿）：`src/entity-form/{interfaces,form-fields,form-data,form-validation,index}.ts`、`src/entity-detail/{detail-tabs,interfaces,index}.ts`
- [x] T015 [P] [US1] 搬运 query-builder src（绿）：`src/query-builder/models/{operator.interface,config.interface,validation.interface,query-builder-state,index}.ts`、`services/{query-builder,operator-registry,query-converter,schema-parser,validation,index}.service.ts`、`utils/{field-tree,metadata-field-extractor,schema-factory,value-input,date,id,popover-position,structural-equal,index}.ts`（保留本地 `PropertyType` 遮蔽并加注释，research D8）
- [x] T016 [P] [US1] 搬运 entity-table src（绿）：`src/entity-table/interfaces.ts`、`columns/{column-utils,build-editable-columns}.ts`、`editors/` 15 个编辑器 + `lucide-svg.ts`、`vtable/{table-factory,table-clipboard,table-keyboard,table-operations,table-theme,table-tooltip,vtable-compat}.ts`（深路径类型导入与内部 API 包装原样保留，见 plan Complexity Tracking）
- [x] T017 [US1] 落 `packages/rxdb-model/src/index.ts`（30 个叶子模块导出，企业版结构原样）+ 包 `README.md`（定位说明 + 与 `packages/rxdb` 的 `entity-field.utils`/`entity-value.utils` 边界说明，research D2）
- [x] T018 [US1] TSDoc 补齐：`packages/rxdb-model/src` 全部公开导出符号含 TSDoc（宪法 I，spec FR-012）
- [x] T019 [US1] 门禁：`pnpm nx lint/typecheck/test/build rxdb-model` 零警告；`pnpm nx run rxdb-model:coverage` 四指标 ≥80%；`pnpm audit:api-surface:update` 后 `--check` 通过（quickstart Phase 2）

**Checkpoint**: 核心库独立可用——US1 完成即 MVP（框架无关工具链可被任何技术栈消费）

---

## Phase 4: User Story 2 - 实体管理 UI 组件集（Angular 先行）(Priority: P2)

**Goal**: `packages/rxdb-model-angular` 完整落地——9 个组件 + 2 个 token + 假测试重写 + demo 页（spec US2 验收场景 1–6）

**Independent Test**: `pnpm nx test rxdb-model-angular` 全绿（真实渲染）；`pnpm nx serve dev-rxdb-angular` 走查 entity 页（quickstart Phase 5）

### Tests for User Story 2（先红）⚠️

- [ ] T020 [P] [US2] 重写 6 个旧式假 spec 为真实源码测试（红）：`packages/rxdb-model-angular/src/entity-list/entity-list.component.spec.ts`、`entity-detail/entity-detail.spec.ts`、`entity-table/entity-table/entity-table.component.spec.ts`、`entity-table/query-table/query-table.component.spec.ts`、`query-builder/query-builder/query-builder.component.spec.ts`、`entity-form/rxdb-entity-form-angular.spec.ts`——按 `*.real.spec.ts` 模式（真实 TestBed 渲染 + 真实 core 服务，仅浏览器 API 缺失处打桩）
- [x] T021 [P] [US2] 搬运 5 个既有真实 spec（红）：`query-builder/{query-builder,query-group,value-input,tree-select}.real.spec.ts` + `operator-selector.component.spec.ts`（`lucide-angular` 类型导入改 `@lucide/angular`）

### Implementation for User Story 2

- [x] T022 [P] [US2] 搬运 token 与 barrel（绿）：`src/entity-table/config.ts`（ENTITY_TABLE_CONFIG）、`src/entity-table/index.ts`、`src/query-builder/theme/{query-builder-theme.token,default-query-builder-theme,index}.ts`
- [x] T023 [P] [US2] 搬运 entity-table 组件（绿）：`src/entity-table/entity-table/entity-table.component.{ts,html,scss}`、`src/entity-table/query-table/query-table.component.{ts,html,scss}`
- [x] T024 [P] [US2] 搬运 entity-form 组件（绿）：`src/entity-form/rxdb-entity-form-angular.ts`（inline template；**不搬**过期文件 `rxdb-entity-form-angular.html`，research D8）+ `src/entity-form/index.ts`
- [x] T025 [P] [US2] 搬运 query-builder 组件树（绿）：`src/query-builder/{query-builder,query-group,query-rule,field-selector,operator-selector,value-input,tree-select,popover-select,subquery-builder}/*.component.ts` + `src/query-builder/index.ts`（含 `export * from '@aiao/rxdb-model'` 透传）
- [x] T026 [P] [US2] 搬运 entity-dialog 组件（绿）：`src/entity-dialog/entity-dialog.component.{ts,html,scss}` + `src/entity-dialog/index.ts`
- [x] T027 [US2] 搬运 entity-detail 组件（绿）：`src/entity-detail/entity-detail.{ts,html,scss}`（CDK Dialog 草稿实体编排）+ `src/entity-detail/index.ts`
- [x] T028 [US2] 搬运 entity-list 组件（绿）：`src/entity-list/entity-list.component.{ts,html}`（核对 `@aiao/rxdb-angular` 的 `InfiniteScrollingList` API 对齐；`lucide-angular` → `@lucide/angular` 两处使用点）
- [x] T029 [US2] 落 `src/index.ts`（组件导出 + 两个透传 barrel 语义保留）+ `tailwind.css`（`@source` 注册 fesm 产物与 src）+ 包 `README.md`（样式接入约定：消费方需 Tailwind + daisyUI）
- [x] T030 [US2] TSDoc 补齐：`packages/rxdb-model-angular/src` 全部公开导出含 TSDoc
- [ ] T031 [US2] 门禁：lint/typecheck/test/build（partial 编译）零警告；覆盖率达标；`requirements/api-baseline/rxdb-model-angular.json` 落基线并 `--check` 通过
- [x] T032 [P] [US2] Demo 样式管线：`apps/dev-rxdb-angular` 的 Tailwind 入口补 `@plugin 'daisyui'`（research D6，当前 app CSS 无 daisyUI）
- [x] T033 [US2] Demo 页面：`apps/dev-rxdb-angular/src/app/pages/entity/` 新增 entity-list / entity-detail / query-builder 页（数据源 `@aiao/rxdb-test` 的 Todo）+ `app.routes.ts` 注册
- [ ] T034 [US2] e2e：`apps/dev-rxdb-angular-e2e` 增 entity 页用例——行内编辑 + undo/redo、详情 Tab、表单三模式、查询构建器过滤、键盘走查、深浅主题切换（spec US2 场景 5）

**Checkpoint**: US1+US2 可独立工作——Angular 消费方获得完整实体管理 UI

---

## Phase 5: User Story 3 - React 绑定层 (Priority: P3)

**Goal**: `packages/rxdb-model-react` 全新开发（TDD），能力面与 Angular 端功能等价（spec US3）

**Independent Test**: `pnpm nx test rxdb-model-react` 全绿；dev-rxdb-react demo 页与 Angular 端行为一致

- [ ] T035 [US3] 脚手架 `packages/rxdb-model-react/`（project.json/package.json/tsconfig/vite/eslint/index.ts，参照 code-editor-react 惯例）+ tsconfig path + api-baseline 初始 JSON
- [ ] T036 [US3] TDD（红→绿）query-builder 组件树：`packages/rxdb-model-react/src/query-builder/`（根组件 + 分组/规则/字段/操作符/值输入/树选择/子查询，复用 core 服务）
- [ ] T037 [US3] TDD（红→绿）entity-table + query-table 组件：`src/entity-table/`（VTable 宿主、主题、插槽，复用 core 表格基础设施）
- [ ] T038 [US3] TDD（红→绿）entity-form 组件：`src/entity-form/`（字段类型 switch、三模式、校验委托 core）
- [ ] T039 [US3] TDD（红→绿）entity-detail + entity-dialog：`src/entity-detail/`、`src/entity-dialog/`
- [ ] T040 [US3] TDD（红→绿）entity-list：`src/entity-list/`（基于 `@aiao/rxdb-react` 的 `InfiniteScrollingList` + 行内编辑 + undo/redo）
- [ ] T041 [US3] Demo 页 + e2e：`apps/dev-rxdb-react/src/app/pages/entity/`（与 Angular 同构）+ 门禁（lint/test/build/coverage/api-baseline）

**Checkpoint**: React 消费方能力等价

---

## Phase 6: User Story 4 - Vue 绑定层 (Priority: P3)

**Goal**: `packages/rxdb-model-vue` 全新开发（TDD），能力面与 Angular/React 端功能等价（spec US4）

**Independent Test**: `pnpm nx test rxdb-model-vue` 全绿；dev-rxdb-vue demo 页与 Angular 端行为一致

- [ ] T042 [US4] 脚手架 `packages/rxdb-model-vue/`（参照 code-editor-vue 惯例）+ tsconfig path + api-baseline 初始 JSON
- [ ] T043 [US4] TDD（红→绿）query-builder 组件树：`packages/rxdb-model-vue/src/query-builder/`
- [ ] T044 [US4] TDD（红→绿）entity-table + query-table 组件：`src/entity-table/`
- [ ] T045 [US4] TDD（红→绿）entity-form 组件：`src/entity-form/`
- [ ] T046 [US4] TDD（红→绿）entity-detail + entity-dialog：`src/entity-detail/`、`src/entity-dialog/`
- [ ] T047 [US4] TDD（红→绿）entity-list：`src/entity-list/`（基于 `@aiao/rxdb-vue` 的 `InfiniteScrollingList`）
- [ ] T048 [US4] Demo 页 + e2e：`apps/dev-rxdb-vue/src/app/pages/entity/` + 门禁（lint/test/build/coverage/api-baseline）

**Checkpoint**: 三端能力齐备（parity 验证在 Polish 阶段）

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 三端对称验证与全量门禁（epic 关闭条件）

- [ ] T049 跨框架对拍 e2e：相同 Todo 数据下断言三端列表/详情/表单/查询构建器输出一致（`apps/dev-rxdb-*-e2e` 对拍用例，宪法 III「visually identical output」）
- [ ] T050 运行 `tri-framework-check` 技能复核三端 API 对称性（命名、签名、行为）
- [ ] T051 文档：`website/docs/` 增 rxdb-model 系列文档页（核心 + 三框架用法 + 样式接入 + 迁移说明）；更新 `requirements/status-overview.md` 状态
- [ ] T052 全量门禁：`pnpm test-all` + `pnpm audit:coverage --check` + `pnpm audit:api-surface --check` + `pnpm audit:coverage:update`（落 baseline）
- [ ] T053 spec 状态收尾：spec.md Status → Approved，checklist 复检；走仓库常规 PR/CI 流程（api-baseline 门禁 + coverage 门禁 + lint 零警告）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖，立即开始（T002/T003 可与 T001 并行，T004 依赖脚手架）
- **Foundational (Phase 2)**: 依赖 Setup——**阻塞所有用户故事**
- **User Stories (Phase 3+)**: 依赖 Foundational；US2 依赖 US1（组件消费 core）；US3/US4 依赖 US1，可在 US2 完成前后并行（各自独立，parity 参考 US2 契约）
- **Polish (Phase 7)**: 依赖 US1–US4 全部完成

### User Story Dependencies

- **US1 (P1)**: Foundational 后即可开始，无故事间依赖
- **US2 (P2)**: 依赖 US1（core 引擎）；与 US3/US4 无实现依赖
- **US3 (P3)**: 依赖 US1；与 US2/US4 可并行（不同包不同文件）
- **US4 (P3)**: 依赖 US1；与 US2/US3 可并行

### Within Each User Story

- Tests MUST be written and FAIL before implementation（T009–T012 红 → T013–T016 绿；T020–T021 红 → T022–T028 绿）
- 基础组 → 表单/详情 → 查询构建器 → 表格（US1 内部顺序，跨组可并行）
- token/barrel → 叶子组件 → 复合组件（entity-list 最后，依赖其他组件）
- Story complete before moving to next priority

### Parallel Opportunities

- Setup：T001/T002/T003 并行；Foundational：T006/T007 并行
- US1：四个模块组的 spec 任务（T009–T012）并行；四个模块组的 src 任务（T013–T016）并行
- US2：T020/T021 并行；T022–T026 并行（不同目录）；T032 与组件搬运并行
- US3 与 US4 整体可并行（两套不同框架的新开发）

---

## Parallel Example: User Story 1

```bash
# 四个模块组的 spec 先行（全部红）：
Task: T009 "搬运基础工具组 spec"
Task: T010 "搬运 entity-form + entity-detail spec"
Task: T011 "搬运 query-builder spec"
Task: T012 "搬运 entity-table spec"

# 随后四个模块组的 src 落地（各自转绿）：
Task: T013 "搬运基础工具组 src"
Task: T014 "搬运 entity-form + entity-detail src"
Task: T015 "搬运 query-builder src"
Task: T016 "搬运 entity-table src"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup + Phase 2 Foundational
2. Phase 3 US1（核心库）
3. **STOP and VALIDATE**：`pnpm nx test rxdb-model --coverage` + `audit:api-surface --check`（quickstart Phase 2）
4. 此时核心库已可发布/可消费（框架无关工具链 MVP）

### Incremental Delivery

1. Setup + Foundational → 空包基线绿
2. US1 → 核心库（MVP）→ 独立验证
3. US2 → Angular 组件集 → demo 走查 + e2e
4. US3 + US4 → React/Vue 绑定（可并行）→ 各自 demo
5. Polish → 对拍 e2e + tri-framework-check + 全量门禁（epic 关闭）

### Parallel Team Strategy

- 团队 A：US1 核心库（Phase 3）
- US1 完成后：团队 B 接 US2（Angular）；团队 C/D 分别接 US3（React）与 US4（Vue）——三者仅共享 core 契约（contracts/），无文件冲突
- 全员回合：Phase 7 对拍与门禁

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- 移植源为企业版同名文件（research D1–D8 的适配决策先行阅读）
- Verify tests fail before implementing（spec 先红后绿是宪法 TDD 要求，不是可选项）
- Commit after each task or logical group（可选 `/speckit-git-commit` 钩子）
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
