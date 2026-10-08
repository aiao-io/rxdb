---
description: 'US-031 阶段 A 任务清单：可排序树实体与创建类写入'
---

# Tasks: US-031 阶段 A — 可排序树实体与创建类写入

**Input**: `specs/008-us031-sortable-tree-entities/` 下的 plan.md、spec.md、research.md、data-model.md、contracts/、quickstart.md

**Tests**: 必须写。constitution II 要求 TDD（先红后绿），spec FR-010 / FR-011 要求三端单测与 e2e、每条缺陷一条不修即红的回归。
每个「Tests」小节的任务先写、先确认失败原因正确，再做同一故事的实现任务。

**Organization**: 按 spec 的用户故事分阶段。US2～US4 都改三端 demo，依赖 US1 的新实体与 US2 的换实体；三端在每个故事内同交，不允许单端先合。

**通用约定**（每条任务都适用，不再逐条重复）：

- 命令前切 Node 26：`export PATH="$HOME/.nvm/versions/node/v26.7.0/bin:$PATH"`；nx 命令加 `--skipRemoteCache`。
- `packages/` 下 TS 注释写中文；新增导出带 TSDoc；无 `any`、嵌套 ≤ 3、零 ESLint 警告。
- 三端 demo 经 `tsconfig.base.json` 别名读 `packages/rxdb-test/dist`，改了 `rxdb-test` 先 `pnpm nx build rxdb-test --skipRemoteCache`。
- 页内错误文案统一为「<操作>失败：<错误消息>」，操作名只用这六个：新建、重命名、批量添加、删除、级联删除、删除并提升子节点（[contracts/demo-write-paths.md](contracts/demo-write-paths.md)）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成任务）
- **[Story]**: 所属用户故事（US1～US4）

---

## Phase 1: Setup（基线）

**Purpose**: 改动前锁住「现在是什么样」，后面每一步都对照它。

- [x] T001 新建 `benchmarks/sortable-batch-append.bench.ts`：照 `benchmarks/push-receipts.bench.ts` 的写法（`node --experimental-strip-types`、`Entity(options)(Class)` 函数式声明、`bench-stats.ts` 的 `summarise`），PGlite 内存库，定义一个按 `parentId` 分组的可排序自引用实体（`manualOrder: { groupBy: ['parentId'] }`、`sortOrder` 非空）；用固定种子复刻 demo `generateBatchMenus` 的造树方式（父节点随机取自根与本批已建节点、深度上限 7），对 1,000 与 10,000 两档各测「同一批行带显式键」与「全部缺键」的 `entityManager.saveMany` 耗时（各 5 个样本取中位数），打印组数、两者耗时与比值；10,000 档比值 > 1.2 时 `process.exit(1)`
- [x] T002 在 `benchmarks/project.json` 增加 `bench-sortable-batch` 目标（`dependsOn: ["typecheck", "^build"]`，命令 `node --experimental-strip-types sortable-batch-append.bench.ts`，`cwd: benchmarks`），跑 `pnpm nx run benchmarks:bench-sortable-batch --skipRemoteCache`，确认现状比值 > 1.2（红），把两档数字追加进 `specs/008-us031-sortable-tree-entities/research.md` R3；若 PGlite 上现状比值已 ≤ 1.2（3.6× 只在 sqlite-wasm 上量过），本任务不作红，门槛改由 T044 的查询次数断言承担（确定性），本基准只记录数字并守住不回退
- [x] T003 在当前分支跑受影响项目的现有测试，记录绿基线：`pnpm nx run-many -t test --skipRemoteCache -p rxdb,rxdb-test,rxdb-adapter-pglite,rxdb-adapter-sqlite-wasm,dev-rxdb-angular,dev-rxdb-react,dev-rxdb-vue`；失败先单独复跑，确认是既有问题（AGENTS.md「全量测试坑」）后记在本文件末尾「基线备注」，不在本故事里修

---

## Phase 2: Foundational（三端共用的承接位与契约夹具）

**Purpose**: US2～US4 都要用的页内错误提示与 core 层契约夹具。

**⚠️ CRITICAL**: 本阶段完成前不开始 US2～US4。

- [x] T004 [P] 新建 Angular 独立组件 `apps/dev-rxdb-angular/src/app/components/tree-write-error.ts`（`TreeWriteError`，输入 `message: string | null`，输出 `closed`）：`message` 为空不渲染；渲染 `div.alert.alert-error`、`role="alert"`、`data-testid="tree-write-error"`，关闭按钮 `aria-label="关闭错误提示"`、可键盘操作；配同目录 `tree-write-error.spec.ts` 断言结构与关闭事件
- [x] T005 [P] 给 React `apps/dev-rxdb-react/src/app/components/OperationErrorAlert.tsx` 的根元素加 `data-testid="tree-write-error"`（结构与 T004 一致），新增 `apps/dev-rxdb-react/src/app/components/OperationErrorAlert.spec.tsx` 断言 `role="alert"`、关闭按钮与 `data-testid`
- [x] T006 [P] 新建 Vue 组件 `apps/dev-rxdb-vue/src/app/components/TreeWriteError.vue`（props `message: string | null`，emit `close`，结构同 T004），配 `TreeWriteError.spec.ts`；这类写入不走 `useToast`
- [x] T007 [P] 三端各加一个文案函数（同名同签名 `formatTreeWriteError(operation, error): string`，`operation` 为六个操作名的联合类型，非 `Error` 用 `String(error)`）：Angular `apps/dev-rxdb-angular/src/app/shared/tree-write-error.ts`、React `apps/dev-rxdb-react/src/app/utils/tree-write-error.ts`（复用 `utils/error.ts` 的 `getErrorMessage`）、Vue `apps/dev-rxdb-vue/src/app/utils/tree-write-error.ts`，各配同目录 spec
- [x] T008 在 `packages/rxdb-test/src/sortable/fixtures.ts` 增加不导出的契约夹具 `SortableNode`（`namespace: 'manual-order-fixtures'`、`tableName: 'manual_order_node'`、`title` string、`sortOrder` string 非空、自引用多对一关系 `parent`（`columnName: 'parentId'`、`nullable: true`、`onDelete: CASCADE`）与一对多 `children`、`manualOrder: { groupBy: ['parentId'] }`），用普通 `@Entity` 声明、不依赖树插件
- [x] T009 新建 `packages/rxdb-test/src/sortable/manual-order-tree.suite.ts`，导出 `describeManualOrderTree(database: () => ManualOrderSuiteDatabase)`（形状同 `manual-order-group.suite.ts` 的 `describeManualOrderGroups`）；在 `manual-order.suite.ts` 的 `runManualOrderSuite` 里调用它，并把 `SortableNode` 加进 `createDatabase` 的 `entities`。先放一条用例：插入一条 `parentId` 指向不存在行的 `SortableNode` 被外键约束拒绝（R2 判据的前提）。两个 runner（`packages/rxdb-adapter-pglite/src/__tests__/manual-order-contract.spec.ts`、`packages/rxdb-adapter-sqlite-wasm/src/__tests__/manual-order-contract.spec.ts`）不改即跑到它，确认两端都绿

**Checkpoint**: 三端承接位就绪，契约套件能跑自引用树用例。

---

## Phase 3: User Story 1 — 可排序树实体，旧实体不动 (Priority: P1) 🎯 MVP

**Goal**: `@aiao/rxdb-test/entities` 新增四个可排序树实体（[data-model.md](data-model.md)、[contracts/rxdb-test-sortable-tree-entities.md](contracts/rxdb-test-sortable-tree-entities.md)），旧四个一字节不变。

**Independent Test**: `pnpm nx test rxdb-test` 的同形契约通过；新库建表 `sort_order` 为 `NOT NULL`；旧实体的适配器测试不改即通过（quickstart §2、§3）。

### Tests for User Story 1

- [x] T010 [US1] 新建 `packages/rxdb-test/src/__tests__/sortable-tree-entities.spec.ts`（先红）：对四组（`SortableMenuSimple`↔`MenuSimple`、`SortableMenuLarge`↔`MenuLarge`、`SortableFileNode`↔`FileNode`、`SortableFileLarge`↔`FileLarge`）断言 `getEntityMetadata` 的 `properties`（`sortOrder` 除 `nullable` 外）、`computedProperties`、`relations`（关系名、kind、外键列、`onDelete`）、`indexes`、`features.tree` 逐项相等；`manualOrder` 等于 `{ groupBy: ['parentId'] }`；新实体的 `sortOrder` 是 `PropertyType.string` 且 `nullable` 为假、`validateEntityMetadata` 无违规；旧实体 `manualOrder` 未定义且 `sortOrder.nullable === true`；实体名与表名不与 `SortableItem` / `SortableList` / `SortableListItem` / `SortableTodo` / `SortableNode` 及 `ENTITIES` 里任何实体重名；`SortableFileNode` / `SortableFileLarge` 的 `fullName` / `isFolder` / `sizeFormatted` 对同一组字段与旧实体结果相同（含 `size: null`、`type: 'folder'`、无扩展名三种）

### Implementation for User Story 1

- [x] T011 [P] [US1] 新建 `packages/rxdb-test/entities/SortableMenuSimple.ts`：复刻 `MenuSimple.ts`，`name: 'SortableMenuSimple'`、`tableName: 'sortable_menu_simple'`、`manualOrder: { groupBy: ['parentId'] }`，`sortOrder` 为「string **非空**，列名 `sort_order`」（不写 `nullable`），类字段 `sortOrder!: string`；保留 `parent_title` 唯一 normalized 索引与 `hasChildren: false`；TSDoc 写明用途（菜单 simple 页）、复刻自 `MenuSimple` 且不可互换、排序域按 `parentId`（根节点一组）
- [x] T012 [P] [US1] 新建 `packages/rxdb-test/entities/SortableMenuLarge.ts`：复刻 `MenuLarge.ts`（`hasChildren: true`、`parent_sort` 与 `parent_title` 索引），`name: 'SortableMenuLarge'`、`tableName: 'sortable_menu_large'`，其余同 T011；TSDoc 写明用于菜单 virtual 与 lazy 页
- [x] T013 [P] [US1] 新建 `packages/rxdb-test/entities/SortableFileNode.ts`：复刻 `FileNode.ts`（`name` 非空、`type` enum `['file', 'folder']` 非空、`extension` / `size` 可空、`parent_sort` 与 `parent_fullname` 唯一 normalized 索引、`hasChildren: false`、三个 getter 逐字复制），`name: 'SortableFileNode'`、`tableName: 'sortable_file_node'`，`sortOrder` 同 T011；TSDoc 写明用于文件 simple 与 virtual 页
- [x] T014 [P] [US1] 新建 `packages/rxdb-test/entities/SortableFileLarge.ts`：复刻 `FileLarge.ts`（`hasChildren: true`），`name: 'SortableFileLarge'`、`tableName: 'sortable_file_large'`，其余同 T013；TSDoc 写明用于文件 lazy 页
- [x] T015 [US1] 在 `packages/rxdb-test/entities/index.ts` 导入、导出四个新实体，并按实体名字母序插入 `ENTITIES`（`MenuSimple` 之后、`Task` 之前）；跑 T010 转绿
- [x] T016 [US1] 更新 `packages/rxdb-test/src/__tests__/published-model-invariants.spec.ts`：`DEMO_ENTITIES` 长度 14 → 18（若该文件有 `PUBLISHED` 清单，同步加入四个新实体）
- [x] T017 [US1] 更新 `packages/rxdb-test/src/__tests__/entity-model-contract.spec.ts`：把四个新实体加进 `(parentId, sortOrder)` 索引与同级唯一索引的断言表（与对应旧实体同一行规则）
- [x] T018 [US1] 更新公开契约 `packages/rxdb-test/public-contract/baseline.json`（`./entities` 下新增四个 `"function"`）与 `packages/rxdb-test/public-contract/consumer.ts`（导入四个新实体，断言 `new SortableMenuSimple().sortOrder` 的类型是 `string` 而非 `string | null`）；跑 `pnpm nx build rxdb-test --skipRemoteCache` 与该包的公开契约检查
- [x] T019 [US1] 回归：不改任何代码，跑 `pnpm nx run-many -t test --skipRemoteCache -p rxdb-adapter-sqlite-wasm,rxdb-adapter-wa-sqlite,rxdb-adapter-sqlite,rxdb-adapter-sqliteai,rxdb-adapter-pglite,rxdb-adapter-electron`（`menuIntegrationSuite` 六个 runner 中可在本机跑的与 PGlite 树测试）；有 `supabase-db` 容器时加跑 `rxdb-adapter-supabase` 的树测试，没有则在本文件「基线备注」写明未跑；`git diff --stat main -- packages/rxdb-test/entities/MenuSimple.ts packages/rxdb-test/entities/MenuLarge.ts packages/rxdb-test/entities/FileNode.ts packages/rxdb-test/entities/FileLarge.ts docker/sql apps/dev-rxdb-electron apps/dev-rxdb-tauri` 无输出

**Checkpoint**: 四个新实体可用、构建进 dist；旧实体与其消费方零改动。

---

## Phase 4: User Story 2 — 新建节点永远追加到同父末尾 (Priority: P1)

**Goal**: 三端六页改用新实体；新建根 / 子节点、文件、文件夹不再自己算键；新建与重命名失败走页内提示（AC#2）。

**Independent Test**: 文件管理器根级依次新建文件夹 A、文件 X、文件夹 B，刷新后为 A、X、B；懒加载页在折叠、子节点未加载的节点下新建，展开后在末尾（quickstart §4 第 1、2 步）。

**Depends on**: US1（T011～T018）、Foundational。

### Tests for User Story 2

- [x] T020 [P] [US2] 契约用例（先红再绿均可，core 已具备语义）：在 `packages/rxdb-test/src/sortable/manual-order-tree.suite.ts` 加「缺键新建」三条——根组、空组、已有子节点的组，各自从组尾之后追加、组内严格递增；两个 runner 都绿
- [x] T021 [P] [US2] Angular 回归（先红）：`apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file.store.spec.ts` 加「根级已有文件夹 A（`a0`）与文件 X（`a1`）时 `createRootFolder('B')` 保存的实例不带 `sortOrder`」（缺陷一，现状得 `a1`），以及 `createSubFolder` / `createFile` 不带 `sortOrder`；`apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.store.spec.ts` 加 `addRootMenu` / `addChildMenu` 保存的实例不带 `sortOrder`；`saveEdit`（重命名）失败时设置 `writeError`
- [x] T022 [P] [US2] React 单测（先红）：`apps/dev-rxdb-react/src/app/hooks/useTreeMenuStore.spec.ts`、`useTreeMenuVirtualStore.spec.ts`、`useTreeMenuLazyStore.spec.ts`、`useFileManagerStore.spec.ts`、`useFileManagerLazyStore.spec.ts` 断言 `addRoot` / `addChild` 保存的实例不带 `sortOrder`、不发同级查询；把懒加载两个 spec 里的「addChild 只查同级，排在同级末尾之后」改写为「addChild 不查同级、不写 `sortOrder`」；`addRoot` / `addChild` 失败时设置写入错误状态；重命名失败时同样设置写入错误状态
- [x] T023 [P] [US2] Vue 单测（先红）：新建 `apps/dev-rxdb-vue/src/app/composables/tree-menu-writes.spec.ts` 与 `file-manager-writes.spec.ts`，对 `useTreeMenuStore` / `useTreeMenuVirtualStore` / `useTreeMenuLazyStore` / `useFileManagerStore` / `useFileManagerLazyStore` 断言 `addRoot` / `addChild` 保存的实例不带 `sortOrder`、不发同级查询，失败时设置写入错误状态；重命名失败时同样设置写入错误状态
- [x] T024 [US2] 三端新建 e2e（同名 `tree-write-order.spec.ts`）：`apps/dev-rxdb-angular-e2e/src/tree-write-order.spec.ts`、`apps/dev-rxdb-react-e2e/src/tree-write-order.spec.ts`、`apps/dev-rxdb-vue-e2e/src/tree-write-order.spec.ts`，用例「文件管理器 simple 页根级依次新建文件夹 A、文件 X、文件夹 B，刷新后顺序为 A、X、B」「菜单 lazy 页折叠一个已有子节点的节点，在它下面新建子节点，展开后在最后」；复用各 e2e 应用 `e2e-utils.ts` 的 `addRootMenu` / `addRootFolder` / `resetE2eState`，行定位用 `data-menu-id` / `data-parent-id`

### Implementation for User Story 2

- [x] T025 [US2] Angular 页面换实体：`apps/dev-rxdb-angular/src/app/pages/menu/tree-menu-simple/tree-menu-simple.page.ts`（`SortableMenuSimple`）、`menu/tree-menu-virtual/tree-menu-virtual.page.ts`（`SortableMenuLarge`）、`menu/tree-menu-lazy/tree-menu-lazy.page.ts`（`ENTITY_CLASS` 的 `useValue: SortableMenuLarge`）、`file-manager/file-manager-simple/file-manager-simple.page.ts` 与 `file-manager-virtual/file-manager-virtual.page.ts`（`SortableFileNode`）、`file-manager/file-manager-lazy/file-manager-lazy.page.ts`（`FILE_ENTITY_CLASS` 的 `useValue: SortableFileLarge`）；同步改引用旧实体的 spec：`tree-pages-construction.spec.ts`、`menu/utils/tree-menu.store.spec.ts`、`menu/tree-menu-lazy/tree-menu-lazy.store.spec.ts`、`menu/services/menu-search.service.spec.ts`、`file-manager/file-manager-construction.spec.ts`、`file-manager/file-manager-lazy/file-manager-lazy.store.spec.ts`、`file-manager/utils/tree-file.store.spec.ts`、`file-manager/services/file-search.service.spec.ts`、`file-manager/services/file-drag-drop.service.spec.ts`（全部在 `apps/dev-rxdb-angular/src/app/pages/` 下）。`menu/models/menu-operation.types.ts` 无人引用，不动
- [x] T026 [US2] Angular 新建不算键：`apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.store.ts` 的 `addRootMenu` / `addChildMenu` 删去兄弟排序与 `generateKeyBetween`，只赋 `title` / `parentId` 后 `save()`；`apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file.store.ts` 的 `createRootFolder` / `createSubFolder` / `createFile` 删去锚点与 `try { generateKeyBetween(...) } catch { generateKeyBetween(null, null) }` 兜底；T021 转绿
- [x] T027 [US2] Angular 页内提示接新建与重命名：`apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.base.ts` 与 `apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file.base.ts` 加 `writeError = signal<string | null>(null)`，新建、重命名的 `catch` 改为 `writeError.set(formatTreeWriteError(...))`（删去这几处 `console.error` + `alert`），六个页面模板（`apps/dev-rxdb-angular/src/app/pages/menu/*/*.page.html`、`apps/dev-rxdb-angular/src/app/pages/file-manager/*/*.page.html`）放 `<tree-write-error>` 并在关闭时清空
- [x] T028 [US2] React 换实体与新建不算键：`apps/dev-rxdb-react/src/app/hooks/useTreeMenuStore.ts`（`SortableMenuSimple`）、`useTreeMenuVirtualStore.ts` 与 `useTreeMenuLazyStore.ts`（`SortableMenuLarge`）、`useFileManagerStore.ts`（`SortableFileNode`）、`useFileManagerLazyStore.ts`（`SortableFileLarge`）、`apps/dev-rxdb-react/src/app/utils/file-sorters.ts` 的类型导入、六个页面 `apps/dev-rxdb-react/src/app/pages/menu/tree-menu-{simple,virtual,lazy}.tsx` 与 `pages/file-manager/file-manager-{simple,virtual,lazy}.tsx`、上述 hook 的 spec；各 hook 的 `addRoot` / `addChild` 删去锚点与 `generateKeyBetween`；两个懒加载 hook 的 `fetchLastSibling` 不再被用到即删除；T022 转绿
- [x] T029 [US2] React 页内提示接新建与重命名：五个 hook 把 `deleteError` 改名为 `writeError`（含 setter 与 `clear…` 方法），`addRoot` / `addChild` / 重命名的失败写入它；六个页面的表单 `onSubmit` 不再产生未处理拒绝，统一渲染 `<OperationErrorAlert message={writeError} onClose={clearWriteError} />`（文件三页此前没有，新增）；同步改 `useTreeMenuStore.spec.ts`、`useTreeMenuVirtualStore.spec.ts` 里的 `deleteError` 引用，并把 `OperationErrorAlert.tsx` 的 TSDoc 从「三个 tree store 的删除失败」改为「树页面除拖放外的写入失败」
- [x] T030 [US2] Vue 换实体与新建不算键：`apps/dev-rxdb-vue/src/app/composables/useTreeMenuStore.ts`（`SortableMenuSimple`）、`useTreeMenuVirtualStore.ts` 与 `useTreeMenuLazyStore.ts`（`SortableMenuLarge`）、`useFileManagerStore.ts`（`SortableFileNode`）、`useFileManagerLazyStore.ts`（`SortableFileLarge`）、六个页面 `apps/dev-rxdb-vue/src/pages/menu/TreeMenu{Simple,Virtual,Lazy}Page.vue` 与 `pages/file-manager/FileManager{Simple,Virtual,Lazy}Page.vue`、`composables/tree-menu-contract.spec.ts` / `file-manager-contract.spec.ts` / `search-expanded-path.spec.ts` 的实体引用；各 composable 的 `addRoot` / `addChild` 删去锚点（含懒加载的同级查询）与 `generateKeyBetween`；T023 转绿
- [x] T031 [US2] Vue 页内提示接新建与重命名：五个 composable 暴露 `writeError` 与 `clearWriteError`，新建、重命名失败写入它；六个页面放 `<TreeWriteError>`；这几类写入不再调用 `useToast`
- [x] T032 [US2] 跑三端单测与 T024 的 e2e：`pnpm nx run-many -t test -p dev-rxdb-angular,dev-rxdb-react,dev-rxdb-vue --skipRemoteCache`、`pnpm nx run-many -t e2e -p dev-rxdb-angular-e2e,dev-rxdb-react-e2e,dev-rxdb-vue-e2e --skipRemoteCache`，三端全绿；同时覆盖 FR-009（现有拖放 e2e 在新实体上继续通过）——覆盖有限：Angular 仅菜单 lazy 页与文件 lazy 页有拖放 e2e，Vue 文件管理器没有，不为此新增拖放用例（拖放属阶段 B）

**Checkpoint**: 新建在三端都追加到同父末尾；缺陷一关闭。

---

## Phase 5: User Story 3 — 删除并提升子节点：顺序确定、一次提交 (Priority: P1)

**Goal**: 删除提升三端统一为一次 `mutations`，子节点从库里取、只改 `parentId`；删除对话框按库里的子节点判断；删除类失败走页内提示（AC#4、FR-012）。

**Independent Test**: G 下有 P、Q，P 下有 c1、c2；删除 P 并提升，刷新后 G 下为 Q、c1、c2；懒加载页先折叠 P 再删，仍弹出对话框（quickstart §4 第 3 步）。

**Depends on**: US2（换实体）。

### Tests for User Story 3

- [x] T033 [P] [US3] 契约用例：`packages/rxdb-test/src/sortable/manual-order-tree.suite.ts` 加「删除提升」——一次 `mutations` 里子节点只改 `parentId`、父节点删除，提交后子节点仍在（未被级联删除）、按批内顺序排在新组原有行之后、新组严格递增；被删节点是根节点时子节点进入根组末尾；两个 runner 都绿
- [x] T034 [P] [US3] Angular 回归（先红）：`apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.store.spec.ts` 加「`executePromoteChildrenDelete` 一次 `mutations`，子节点取自按 `parentId` 的库查询而非 `menuResource`、实例上不带 `sortOrder` 改动」（缺陷二）；`apps/dev-rxdb-angular/src/app/pages/menu/tree-menu-lazy/tree-menu-lazy.store.spec.ts` 加「节点折叠、子节点未加载时 `deleteMenu` 打开删除对话框而不是直接 `remove()`」（现状直接删除，级联删掉整棵子树）
- [x] T035 [P] [US3] React 单测（先红）：`apps/dev-rxdb-react/src/app/hooks/useTreeMenuStore.spec.ts`、`useTreeMenuVirtualStore.spec.ts`、`useTreeMenuLazyStore.spec.ts` 断言删除提升是一次 `entityManager.mutations`（不再逐条 `save()` + `remove()`）、子节点取自库查询、不写 `sortOrder`；删除对话框判据取自库；失败写入 `writeError`；`executeCascadeDelete` 失败同样写入 `writeError`
- [x] T036 [P] [US3] Vue 单测（先红）：`apps/dev-rxdb-vue/src/app/composables/tree-menu-writes.spec.ts` 对三个菜单 composable 断言同 T035（Vue 现状为 `Promise.all` 并发保存或逐条保存、懒加载读全表）；级联删除失败同样写入 `writeError`
- [x] T037 [P] [US3] 文件管理器删除 / 级联删除失败的三端单测（先红）：Angular `apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file.store.spec.ts`、React `apps/dev-rxdb-react/src/app/hooks/useFileManagerStore.spec.ts` 与 `useFileManagerLazyStore.spec.ts`、Vue `apps/dev-rxdb-vue/src/app/composables/file-manager-writes.spec.ts`：删除、级联删除抛错时设置写入错误状态、不调用 `window.alert`、无未处理拒绝（T042 的前置红测）
- [x] T038 [US3] 三端 e2e：在三个 `tree-write-order.spec.ts` 加「删除 P 并提升子节点，刷新后 G 下为 Q、c1、c2」与「菜单 lazy 页折叠 P 后删除，出现提升 / 级联选择对话框」

### Implementation for User Story 3

- [x] T039 [US3] Angular：`apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.store.ts` 的 `deleteMenu` 与 `executePromoteChildrenDelete` 改为按 `parentId` 查库取直接子节点（经 `entityClass` 的静态查询 + `firstValueFrom`），删除提升保持一次 `entityManager.mutations(getEntityMutations({ needSaveEntities: 子节点, needRemoveEntities: [被删节点] }))`、子节点只改 `parentId`；`executeCascadeDelete` 的子孙集合同样取自库（`findDescendants`）；`tree-menu.base.ts` 里删除、级联删除、删除提升的 `catch` 改写 `writeError`；T034 转绿
- [x] T040 [US3] React：三个菜单 hook（`apps/dev-rxdb-react/src/app/hooks/useTreeMenuStore.ts`、`useTreeMenuVirtualStore.ts`、`useTreeMenuLazyStore.ts`）的删除提升改为一次 `rxdb.entityManager.mutations(getEntityMutations(...))`，子节点取自按 `parentId` 的库查询（懒加载沿用 `fetchMenuChildren`），删除对话框判据取自库；失败写 `writeError`；T035 转绿
- [x] T041 [US3] Vue：三个菜单 composable（`apps/dev-rxdb-vue/src/app/composables/useTreeMenuStore.ts`、`useTreeMenuVirtualStore.ts`、`useTreeMenuLazyStore.ts`）同 T040；懒加载的 `fetchAllMenus()` 全表读取改为按 `parentId` 查询；页面上 `@click="store.executePromoteChildrenDelete"` 等删除入口的失败经 `writeError` 展示、不再成为未处理拒绝，叶子删除不再走 `useToast`；T036 转绿
- [x] T042 [US3] 文件管理器的删除与级联删除接页内提示（三端：Angular `tree-file.base.ts`、React `useFileManagerStore.ts` / `useFileManagerLazyStore.ts` 与文件三页、Vue `useFileManagerStore.ts` / `useFileManagerLazyStore.ts` 与文件三页），失败写 `writeError`，删去 `alert('删除失败')`；文件管理器没有删除提升，不新增
- [x] T043 [US3] 跑三端单测与 e2e（同 T032），全绿

**Checkpoint**: 删除提升三端一致、一次提交；缺陷二与 Angular 懒加载折叠删除关闭。

---

## Phase 6: User Story 4 — 批量添加从同父真实末尾之后追加 (Priority: P2)

**Goal**: core 批内追加满足性能预算（[contracts/core-batch-append.md](contracts/core-batch-append.md)）；三端批量生成器不再写键、整批一次 `saveMany`；批量失败走页内提示（AC#3、SC-004）。

**Independent Test**: 文件管理器根级依次建文件 X、文件夹 F，批量添加 100 条，刷新后前两项仍是 X、F；`bench-sortable-batch` 比值 ≤ 1.2。

**Depends on**: US2（换实体）。core 部分（T044～T048）只依赖 Foundational，可与 US2 / US3 并行。

### Tests for User Story 4

- [x] T044 [P] [US4] core 单测（先红）：新建 `packages/rxdb/src/__tests__/sortable/manual-order-batch-append.spec.ts`——组键规范化（`null` / `'1'` / `1` / `true` / `1n` / `Date` 互不相撞、`null` 自成一组、组按首次出现的批内顺序处理）；同批新建父行的组不发尾键查询（对执行器仓库的 `find` 计数：10 个新父行各带子行时只为根组查一次）；该组有同批预留显式键时从最大预留键之后追加；分组外键指向本批**未**新建的行时照常查尾键；反例：外键指向别的实体类型、指向本批未新建的行，都必须照常查尾键；判据参数缺省时（`Repository.ts` 的 `create` / `update` 两个门面调用点）行为与改前逐字相同
- [x] T045 [P] [US4] 契约用例：`packages/rxdb-test/src/sortable/manual-order-tree.suite.ts` 加「批量」——一次 `saveMany` 里新建 3 个父行与它们的子行，另有子行追加到 2 个既有父行、2 行追加到根组：新父行下从首键起、既有组从库里尾键之后、各组严格递增；两个 runner 都绿
- [x] T046 [P] [US4] 三端批量单测（先红）：Angular `apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-utils.spec.ts`（`generateBatchMenus` 生成的节点不带 `sortOrder`、不收 `existingRoots`）、`apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file.store.spec.ts`（把「批量添加按单次事务保存，并为每个节点生成排序键」改写为「单次 `saveMany`、节点不带 `sortOrder`」）、`apps/dev-rxdb-angular/src/app/pages/file-manager/file-manager-lazy/file-manager-lazy.store.spec.ts`；React `apps/dev-rxdb-react/src/app/utils/menu-utils.spec.ts`、`useTreeMenuLazyStore.spec.ts`（把「addManyMenus(count) 不接受数组，只按序取最后一个根节点」改写为「一次 `saveMany`、不读根节点」）、`useFileManagerLazyStore.spec.ts`；Vue `apps/dev-rxdb-vue/src/app/utils/menu-utils.spec.ts`、`composables/file-manager-contract.spec.ts`（`generateBatchFiles` 不写 `sortOrder`）；各端批量失败写入 `writeError`
- [x] T047 [US4] 三端 e2e：在三个 `tree-write-order.spec.ts` 加「文件管理器 lazy 页根级依次建文件 X、文件夹 F，批量添加 100 条，刷新后前两项为 X、F」与「菜单 simple 页已有两个根节点时批量添加 100 条，刷新后两个原有根节点仍在最前」

### Implementation for User Story 4

- [x] T048 [US4] core：`packages/rxdb/src/sortable/sortable.utils.ts` 的 `splitByGroup` 改为按规范化组键建 `Map`（O(行数)，保持首次出现顺序），预留显式键同样先按组键归组；`appendToGroupTails` 增加**可选**参数 `isKnownEmpty?: (values: GroupValues) => boolean`，命中时不调用 `readTailRow`、锚点只取同组预留键；`packages/rxdb/src/sortable/sortable-mutations.ts` 的 `appendBatchSortOrders` 从 `options.create` 推出判据——分组字段取自 `metadata.foreignKeyRelationMap`，所指实体用关系的 `mappedNamespace` + `mappedEntity`（自引用关系在 `transitionMetadata` 里已改写成本实体的 `name`）与 create 桶各 key 的元数据 `namespace` + `name` 比对，桶中存在主键等于该组分组取值的行即为空组，匹配不到一律不触发；`Repository.create` / `update` 两个门面调用点不传该参数。TSDoc 写明判据成立的前提（外键约束，见 R2）；T044、T045 转绿，US-028 既有契约用例零修改通过
- [x] T049 [US4] 跑 `pnpm nx run benchmarks:bench-sortable-batch --skipRemoteCache`，10,000 档比值 ≤ 1.2（绿）；在 `packages/rxdb-adapter-sqlite-wasm/src/__tests__/` 下临时复刻 research R3 的浏览器用例复测 sqlite-wasm（跑完删除），两组数字补进 `specs/008-us031-sortable-tree-entities/research.md` R3
- [x] T050 [US4] 基准接入 CI：在 `.github/workflows/ci-template.yml` 的 `benchmark` job 把 `bench-sortable-batch` 并入 `pnpm exec nx run-many -t search-ci bench-working-tree -p benchmarks` 的目标列表（触发条件 `need_benchmark` 已覆盖改了 `packages/` 或 `benchmarks/` 的 PR；纯 Node + PGlite，与 `bench-working-tree` 同类），并在该 job 上方注释补一句：本基准同一次运行里自比、不依赖冻结 reference（constitution IV 要求基准在 `packages/*` 的 PR 上运行）；依赖 T048、T049 已绿
- [x] T051 [US4] Angular 批量不写键：`apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-utils.ts` 的 `generateBatchMenus` 删去 `sortOrder = ''` 占位、末尾的按父节点算键与 `existingRoots` 参数，`tree-menu.store.ts` 的 `add_many_menu` 不再读根节点；`apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file.store.ts` 的 `addBatch` 删去占位、锚点与兜底；`apps/dev-rxdb-angular/src/app/pages/file-manager/utils/file-utils.ts` 的 `generateBatchFiles` 删去占位与根键计算、`file-manager-lazy.store.ts` 的 `addBatch` 不再传 `rootNodes()`；`tree-menu.base.ts` / `tree-file.base.ts` 的批量入口捕获 `useAction` 的拒绝并写 `writeError`；T046 Angular 部分转绿
- [x] T052 [US4] React 批量不写键：`apps/dev-rxdb-react/src/app/utils/menu-utils.ts` 的 `generateBatchMenus` 与 `utils/file-utils.ts` 的 `generateBatchFiles` 删去 `sortOrder` 占位、算键与 `existingRoots` 参数；页面批量入口（`pages/menu/tree-menu-{simple,virtual}.tsx`、`pages/file-manager/file-manager-{simple,virtual}.tsx`）与 `useTreeMenuLazyStore.ts` 的 `addManyMenus`（逐条 `save()` 改回一次 `saveMany`）、`useFileManagerLazyStore.ts` 的 `addManyFiles` 不再取根节点作锚点；批量的 `try/finally` 补 `catch` 写 `writeError`；T046 React 部分转绿
- [x] T053 [US4] Vue 批量不写键：`apps/dev-rxdb-vue/src/app/utils/menu-utils.ts` 与 `utils/file-utils.ts` 同 T052；页面批量入口（`pages/menu/TreeMenu{Simple,Virtual}Page.vue`、`pages/file-manager/FileManager{Simple,Virtual}Page.vue`）与 `useTreeMenuLazyStore.ts` 的 `addManyMenus`（不再读全表取根）、`useFileManagerLazyStore.ts` 的 `addManyFiles` 不再取根节点作锚点；失败写 `writeError`；T046 Vue 部分转绿
- [x] T054 [US4] 跑三端单测与 e2e（同 T032），含既有的批量添加 e2e（`tree-menu-batch-add.spec.ts`、`file-manager-lazy-batch-add.spec.ts`、`file-manager-batch-undo.spec.ts` 的「批量添加 100 条只产生 1 条撤销」），全绿

**Checkpoint**: 批量添加三端一致、一次提交，性能预算达标。

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T055 源码检索（SC-005）：`grep -rlE "generateKeys?Between" apps/dev-rxdb-{angular,react,vue}/src --include='*.ts' --include='*.tsx' --include='*.vue' | grep -v '\.spec\.'` 只剩四个拖放文件（Angular `menu/services/menu-drag-drop.service.ts`、`file-manager/services/file-drag-drop.service.ts`，React `hooks/useDragDropService.ts`，Vue `composables/useDragDropService.ts`）；`grep -rn "alert(" apps/dev-rxdb-angular/src/app/pages/{menu,file-manager}` 无 `window.alert` 残留
- [x] T056 覆盖率门禁：对 `rxdb`（≥ 90%）与 `rxdb-test`（≥ 80%）跑 `coverage-gate`（`scripts/audit/coverage-check.mjs`），不达标补测
- [x] T057 lint / typecheck / build：`pnpm nx run-many -t lint typecheck build --skipRemoteCache -p rxdb,rxdb-test,benchmarks,dev-rxdb-angular,dev-rxdb-react,dev-rxdb-vue` 零警告
- [x] T058 全量门禁：`pnpm test-all`（affected）；失败先单独复跑并按 AGENTS.md「全量测试坑」判定真假失败
- [x] T059 三端手工走查 `specs/008-us031-sortable-tree-entities/quickstart.md` §4 的四步（`pnpm nx serve dev-rxdb-{angular,react,vue}`），含既有 demo 库打开后新树为空、旧数据不报错
- [x] T060 回写 `requirements/stories/core/US-031-tree-sortable-migration.md`：AC#1～4 状态 ✅ 与证据（测试文件与用例名、基准比值与 sqlite-wasm 复测数字），交付阶段表阶段 A 改 ✅；同步 `requirements/status-overview.md` 与 `requirements/roadmap.md` 的 US-031 行；在 roadmap「零散收尾项」登记 Angular 死代码 `apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.basic.ts` 与 `menu/models/menu-operation.types.ts`；跑 `node scripts/audit/requirements-consistency.mjs`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001～T003)**：无依赖。
- **Foundational (T004～T009)**：依赖 Setup；阻塞 US2～US4。
- **US1 (T010～T019)**：依赖 Setup；与 Foundational 可并行（不同包）。
- **US2 (T020～T032)**：依赖 US1、Foundational。
- **US3 (T033～T043)**：依赖 US2（换实体与 `writeError` 改名）。
- **US4 (T044～T054)**：core 部分 T044、T045、T048、T049 只依赖 Foundational（T045 用 T009 的套件），可与 US1～US3 并行；demo 部分 T046、T047、T051～T054 依赖 US2。
- **Polish (T055～T060)**：依赖全部故事完成。

### User Story Dependencies

- **US1**：独立。
- **US2**：依赖 US1。
- **US3**：依赖 US2。
- **US4**：core 独立，demo 依赖 US2。

### Within Each User Story

- Tests 先写并确认按预期失败（契约用例 T020 / T033 / T045 若在 core 语义上已绿，记录「语义已具备、本用例守住它」）。
- 换实体先于写入改造；三端同一故事内的实现任务可分人并行，但同一故事的三端要一起合入。

### Parallel Opportunities

- T004、T005、T006、T007 互不相干。
- T011～T014 四个实体文件可并行。
- 每个故事的 Tests 小节里，契约用例、Angular、React、Vue 四条任务可并行。
- US4 的 core 部分（T044 → T048 → T049）可与 US1～US3 并行。

---

## Parallel Example: User Story 2

```bash
# 先并行写四条红测：
Task: "T020 契约用例：缺键新建三条（packages/rxdb-test/src/sortable/manual-order-tree.suite.ts）"
Task: "T021 Angular 回归：createRootFolder 不带 sortOrder（tree-file.store.spec.ts、tree-menu.store.spec.ts）"
Task: "T022 React 单测：五个 hook 的 addRoot / addChild 不带 sortOrder"
Task: "T023 Vue 单测：tree-menu-writes.spec.ts、file-manager-writes.spec.ts"

# 换实体后三端实现可分人并行：
Task: "T026 + T027 Angular"
Task: "T028 + T029 React"
Task: "T030 + T031 Vue"
```

---

## Implementation Strategy

### MVP First（User Story 1）

1. Setup（T001～T003）→ 基准红、测试基线记下。
2. US1（T010～T019）→ 新实体可用、旧实体零改动。可单独合入：只新增 `rxdb-test` 导出，demo 不受影响。

### Incremental Delivery

1. US1 → 新实体。
2. Foundational + US2 → 三端换实体，新建不再撞键（缺陷一关闭）。
3. US3 → 删除提升一次提交（缺陷二与 Angular 懒加载折叠删除关闭）。
4. US4 → core 追加优化 + 批量不写键（性能预算达标）。
5. Polish → 检索、覆盖率、全量门禁、回写故事。

按故事约定，阶段 A 作为一个 PR 交付，三端同交；PR 内按上面的顺序提交，每个故事一个或一组提交。

---

## 基线备注

- T003：`rxdb`、`rxdb-test`、`rxdb-adapter-pglite`、`rxdb-adapter-sqlite-wasm`、`dev-rxdb-angular`、`dev-rxdb-react`、`dev-rxdb-vue` 的 `test` 目标（连同依赖的 79 个任务）在改动前全绿，无既有失败。
- T019：`rxdb` 全量（2,423 条）与 sqlite / wa-sqlite / sqliteai / supabase（本机 `supabase-db` 容器在跑，树测试含在内）一次通过；sqlite-wasm、pglite、electron 三个任务首轮失败——sqlite-wasm 动态导入 `rxdb-adapter-sqlite-core/dist` 失败与一条 5 秒超时、electron 两条钩子超时、pglite 的 vitest 无汇总即退出，发生在三个 demo 子任务并行跑测试、其中一个执行过 `pkill -f vitest` 并触发过被中断的库构建期间；重建依赖后 `--parallel=1` 单独复跑三者全绿（electron 1,268、sqlite-wasm 879、pglite 1,393 + 12 条），判定为并发假失败。旧四个树实体、`docker/sql`、electron / tauri 零改动。
- T056：`rxdb` 四指标 ≥ 90%（`coverage-check.mjs --check --projects=rxdb`）；`rxdb-test` 被门禁脚本有意排除（共享套件由适配器执行），
  按其 `coverage-acceptance` 目标合并后为语句 95.14% / 分支 93.96% / 函数 88.23% / 行 96.42%；覆盖率重映射对 `entities/`、`shop/` 下全部带装饰器的实体文件报 `PARSE_ERROR`，新旧实体一律如此，属工具既有限制。
- T058：`pnpm test-all` 前两轮在 `--parallel=4 --nxBail` 下各被一个与本故事无关的失败中止（electron 的 MV3 扩展 service worker 未启动、React 的 `search-refresh`），单独复跑均通过。
  `search-refresh` 在完整 React e2e 里 7 次失败 3 次，本分支去掉新增的 `tree-write-order` 后 8 次全过：本地 `fullyParallel` + 8 worker 下，新增用例的刷新与批量写入分散到多个 worker 抢占 CPU。
  （曾有 4 次记作「`main` 对照」，作废：shell 里的 `NX_WORKSPACE_ROOT_PATH` 指向本仓库，那几轮实际跑的是本分支应用。）
  三端 `tree-write-order.spec.ts` 改为 `mode: 'serial'` 后 React 完整 e2e 连跑 6 次全过，第三轮 `test-all`（74 个项目）全绿。
- T059：quickstart §4 第 1～3 步由三端 `tree-write-order.spec.ts` 自动覆盖，第 4 步由基准与 sqlite-wasm 复测覆盖。
  「既有 demo 库打开」在 Angular 上用真实升级走查：先用 `main` 构建的 demo 在 8200 端口（IDB）建库，写入旧菜单 3 行、旧懒加载菜单 1 行、旧文件夹 1 行；再用本分支构建打开同一个库。
  首轮走查打开即失败，报 `no such table: main.public$sortable_file_large`。这是引擎既有缺陷：迁移事务按默认值写日志，sqlite 会为全部实体重建触发器，而新实体的表要到迁移之后才补建。
  已修（`migration-runner.ts` 传 `false`），并补门禁 `rxdb-adapter-sqlite-wasm/src/__tests__/existing-db-new-entity.spec.ts`（先红后绿）；rxdb / history / working-tree / wa-sqlite / sqlite-wasm / pglite 串行回归全绿。
  修复后换全新 profile 重走，屏蔽 Service Worker，否则首屏会拿到缓存的旧包：新树为空；新建菜单、文件夹成功，刷新后仍在；旧四张表行数不变（3 / 1 / 1 / 0）；四张新表已补建；页面无报错。
  React / Vue 与 Angular 走同一条 `RxDB.connect()` 补建路径，由上面的门禁用例覆盖，未另做浏览器走查。
