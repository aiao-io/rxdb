# Tasks: US-031 阶段 B — 树页面拖放与显示顺序

**Input**: Design documents from `specs/009-us031-tree-drag-reorder/`

**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/core-drop-target.md、contracts/demo-drag-drop.md、quickstart.md

**Tests**: 需要。constitution II 要求 TDD；spec FR-011、FR-012 指定了单测与 e2e。每组实现任务前的测试任务必须先跑红，并确认红的原因是预期的那一个。

**Organization**: 按 spec 的四个用户故事分阶段：US1 菜单拖放、US2 文件管理器排序模式、US3 失败处理、US4 显示顺序。三端对称：同一任务内三端同交，或拆成三个 [P] 任务、用同名用例。

**命令约定**:

- 命令前先 `export PATH="$HOME/.nvm/versions/node/v26.7.0/bin:$PATH"`；nx 一律带 `--skipRemoteCache`。
- 失败先单独复跑，再判定真假（AGENTS.md「全量测试坑」）。
- 并行子 agent 不得 `pkill`，不得跑会 `^build` 的 nx 目标。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成任务）
- **[Story]**: US1～US4，对应 spec.md 的用户故事

---

## Phase 1: Setup

- [x] T001 跑受影响项目的现有测试，记录绿基线：`pnpm nx run-many -t test --skipRemoteCache -p rxdb,dev-rxdb-angular,dev-rxdb-react,dev-rxdb-vue`。既有失败记入本文件末尾「基线备注」，不在本故事里修。
- [x] T002 跑故事 AC#9 的两条检索（`specs/009-us031-tree-drag-reorder/quickstart.md` §4），把命中的文件清单记入「基线备注」，作为 US4 清零的对照。

---

## Phase 2: Foundational（阻塞全部用户故事）

**Purpose**: core 换算、三端判定函数、页内提示的「拖放」档、三端 e2e 拖拽 helper。

### core：`reorderTargetForDrop`

- [x] T003 新建 `packages/rxdb/src/__tests__/sortable/reorder-target-for-drop.spec.ts`，写 `contracts/core-drop-target.md` 单测表的 10 条表驱动用例。跑红：函数不存在。
- [x] T004 在 `packages/rxdb/src/sortable/sortable.utils.ts` 紧挨 `reorderTargetForMove` 实现 `reorderTargetForDrop`，语义与抛错照 `contracts/core-drop-target.md`。
  - 带中文 TSDoc：`@param`、`@returns`、`@throws RangeError`、`@example`，`@example` 写明与 `reorderTargetForMove` 的分工。
  - 嵌套 ≤ 3。T003 转绿。
- [x] T005 在 `packages/rxdb/src/index.ts` 的 sortable 导出段加 `reorderTargetForDrop`。
  - 跑 `pnpm nx test rxdb --skipRemoteCache`：api-baseline 首跑失败属正常，基线 diff 随提交。
  - 再跑 `pnpm nx run-many -t lint typecheck build --skipRemoteCache -p rxdb`，demo 经别名读 dist。

### 页内提示的「拖放」档（三端）

- [x] T006 [P] Angular `apps/dev-rxdb-angular/src/app/shared/tree-write-error.ts`：`TreeWriteOperation` 加 `'拖放'`；`tree-write-error.spec.ts` 加「拖放失败：<消息>」用例（先红）。
- [x] T007 [P] React `apps/dev-rxdb-react/src/app/utils/tree-write-error.ts`：同 T006。
  - 类型注释「除拖放外的写操作名」改为「树页面的写操作名」。
  - `tree-write-error.spec.ts` 加同名用例。
- [x] T008 [P] Vue `apps/dev-rxdb-vue/src/app/utils/tree-write-error.ts`：同 T007，`tree-write-error.spec.ts` 加同名用例。

### 判定函数 `resolveTreeDrop`（三端，`contracts/demo-drag-drop.md` §1）

- [x] T009 [P] Angular：新建 `apps/dev-rxdb-angular/src/app/shared/tree-drop.spec.ts`，写判定表 9 行各一条（先红）。
  - 用例名照判定表的「条件 → 结果」，三端同名。
  - 新建 `apps/dev-rxdb-angular/src/app/shared/tree-drop.ts`，导出 `TreeDropInput` / `TreeDropDecision` / `resolveTreeDrop`。
  - 手动模式的前后放置调 `@aiao/rxdb` 的 `reorderTargetForDrop`。
  - 同文件导出 `treeDropPosition`（`contracts/demo-drag-drop.md` §1.5），单测：三档边界、非手动模式非根级行整行 `into`、非手动模式根级行仍分三档。
  - 转绿。
- [x] T010 [P] React：在 `apps/dev-rxdb-react/src/app/hooks/useDragDropService.ts` 导出同名类型、`resolveTreeDrop` 与 `treeDropPosition`，`useDragDropService.spec.ts` 加同名的判定表 9 条与落点区间用例（先红后绿）。旧的 `calculateDropPosition` 此任务不删（US1 删）。
- [x] T011 [P] Vue：在 `apps/dev-rxdb-vue/src/app/composables/useDragDropService.ts` 导出同名类型、`resolveTreeDrop` 与 `treeDropPosition`，`useDragDropService.spec.ts` 加同名的判定表 9 条与落点区间用例（先红后绿）。

### e2e 拖拽 helper（三端）

- [x] T012 [P] 三端 e2e 项目各加一个真实鼠标拖拽 helper，放在 `apps/dev-rxdb-{angular,react,vue}-e2e/src/drag-utils.ts`（新建）。
  - 签名：`dragRowTo(page, source: Locator, target: Locator, position: 'before' | 'after' | 'into')`。
  - 动作：`mouse.move` 到源行手柄 → `down` → 分 20 步 `move` 到目标行高的 15% / 85% / 50% → 再 `move` 一步 → `up`（research R9）。
  - 三端签名与行为相同。

**Checkpoint**：core 换算与三端判定函数都有单测保护，用户故事可以开工。

---

## Phase 3: User Story 1 — 菜单拖放的结果确定、刷新不变、三端一致 (Priority: P1) 🎯 MVP

**Goal**：三端菜单 simple / virtual / lazy 的拖放经 `resolveTreeDrop` → `Repository.reorder()`；拖进节点不读子节点（缺陷三）；邻居取自完整组序列。

**Independent Test**：菜单懒加载页折叠 P（有 c1、c2），把 X 拖进 P，展开后 c1、c2、X，刷新不变；三端同。

### 测试（先红）

- [x] T013 [P] [US1] Angular 缺陷三回归：在 `apps/dev-rxdb-angular/src/app/pages/menu/tree-menu-lazy/tree-menu-lazy.store.spec.ts` 加「拖进折叠且子节点未加载的节点：调用 reorder(movedId, { group: { parentId: P } })，不读子节点」。
  - mock 仓库的 `reorder`。
  - 跑红：现状调 `save()`，且按已加载子节点算键。
- [x] T014 [P] [US1] Angular 完整组序列：在 `apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.store.spec.ts` 加「搜索过滤隐藏 B 时，把 X 放到 A 之后，reorder 目标为 { prevId: A, nextId: B }」（先红）。
- [x] T015 [P] [US1] React：`apps/dev-rxdb-react/src/app/hooks/useDragDrop.spec.ts` 加同名的缺陷三与完整组序列用例。
  - 把现有「拖进未展开文件夹时调用 resolveSiblings」用例改写为「不读子节点、目标为 { group }」。先红。
- [x] T016 [P] [US1] Vue：`apps/dev-rxdb-vue/src/app/composables/useDragDrop.spec.ts` 加同名的缺陷三与完整组序列用例。
  - 另加「前后放置到后代上被拒、不调用 reorder」：现状不判环，先红。
- [x] T017 [P] [US1] 三端新建 `apps/dev-rxdb-{angular,react,vue}-e2e/src/tree-drag-reorder.spec.ts`。
  - `test.describe.configure({ mode: 'serial' })`；describe 名三端同为「树页面拖放（US-031 阶段 B）」。
  - 写 `contracts/demo-drag-drop.md` §5 的菜单用例 8 条：
    1. 同父两邻之间；
    2. 组首与组尾；
    3. 跨父两子之间；
    4. 菜单懒加载拖进折叠节点；
    5. 拖到后代被拒零写（撤销计数不变）；
    6. 原位放下与拖进当前父节点（已是末尾）都零写（撤销计数不变，FR-005）；
    7. 撤销一次恢复；
    8. 虚拟页同父重排。
  - 每条刷新后读回 `menu-row` 顺序与 `data-parent-id`。
  - 跑红并记录哪几条红：至少缺陷三那条在 Angular / Vue 红。

### 实现

- [x] T018 [US1] Angular 菜单拖放链路改写：`apps/dev-rxdb-angular/src/app/pages/menu/services/menu-drag-drop.service.ts`。
  - 改为「组装 `TreeDropInput` → `resolveTreeDrop` → `reorder` 时 `rxdb.entityManager.getRepository(entityClass).reorder(id, target)`」。
  - `groupIds` 取 store 里按父节点分组的完整序列：全量页是查询结果，懒加载页是 `childNodesMap` / `rootNodes`。不取 `visibleNodes()`，也不取搜索后的可见集。
  - 删除 `calculateDropPosition`、`performDrop`、`rebalanceSortOrder`、`REORDER_NEEDED`。
  - 拖动中的高亮（`isValidDropTarget` / `canDropInto`）改为调同一个 `resolveTreeDrop`：`reject` 即无效。
  - 落点区间改用 `shared/tree-drop.ts` 的 `treeDropPosition`；删 `menu/utils/tree-utils.ts` 的 `calculateDropMode`（25% / 75%）及其在 `tree-utils.spec.ts` 的用例。
- [x] T019 [US1] Angular `apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.store.ts` 的 `TreeMenuDragDropStore.onDrop`：
  - 删除 `isDropRedundant` 与重编号重试；
  - `reorder` 经 `tree-menu.base.ts` 的 `runWrite('拖放', …)`；
  - `into` 成功后展开目标（保留）。
  - `tree-menu-lazy.store.ts` 的 `onDrop` override 同步。T013、T014 转绿。
- [x] T020 [P] [US1] Angular 三个菜单模板 `tree-menu-{simple,virtual,lazy}.page.html` 的目标行补 `[attr.data-drop-mode]` 与 `[attr.data-drop-valid]`，取值照 `contracts/demo-drag-drop.md` §3；现有 `drop-*` class 保留。
- [x] T021 [P] [US1] React 菜单链路：`apps/dev-rxdb-react/src/app/hooks/useDragDrop.ts`。
  - `onDrop` 改为 `resolveTreeDrop` → `reorder`。
  - 删 `resolveSiblings`、`mergeById` 与「拖进当前父节点不动」的判断；删 `useDragDropService.ts` 的 `calculateDropPosition` / `executeDrop` / `REORDER_NEEDED` 与私有 `compareSortOrder`。
  - `validateDrop` 改为调 `resolveTreeDrop`。
  - 三个菜单页 `apps/dev-rxdb-react/src/app/pages/menu/tree-menu-{simple,virtual,lazy}.tsx` 删 `resolveSiblings` 选项，`groupIds` 由各自 store 提供完整组序列。T015 转绿。
- [x] T022 [P] [US1] Vue 菜单链路：`apps/dev-rxdb-vue/src/app/composables/useDragDrop.ts`。
  - `onDrop` 改为 `resolveTreeDrop` → `reorder`；删 `useDragDropService.ts` 的 `calculateDropPosition` / `REORDER_NEEDED` / 私有比较器。
  - 懒加载页 `apps/dev-rxdb-vue/src/pages/menu/TreeMenuLazyPage.vue` 不再以 `store.loadedNodes` 作数据源算位置，`groupIds` 取该父节点的整组子节点。
  - 三个菜单页同步。T016 转绿。
- [x] T023 [US1] 删改被删代码的单测：
  - Angular 无菜单拖放服务的 spec；
  - React `useDragDropService.spec.ts` 删 `calculateDropPosition` / `executeDrop` / `REORDER_NEEDED` 用例；
  - Vue `useDragDropService.spec.ts` 同。
  - 三端 `pnpm nx run-many -t test lint --skipRemoteCache -p dev-rxdb-angular,dev-rxdb-react,dev-rxdb-vue` 全绿。
- [ ] T024 [US1] 跑三端 `tree-drag-reorder.spec.ts` 的菜单用例（`pnpm nx run-many -t e2e --skipRemoteCache --parallel=1 -p dev-rxdb-angular-e2e,dev-rxdb-react-e2e,dev-rxdb-vue-e2e -- --grep 树页面拖放`），T017 转绿。

**Checkpoint**：三端菜单拖放全部经引擎，缺陷三关闭。

---

## Phase 4: User Story 2 — 文件管理器在两种排序模式下的拖放规则一致 (Priority: P1)

**Goal**：三端文件管理器 simple / virtual / lazy 的拖放经 `resolveTreeDrop` → `reorder()`；按排序模式取规则；高亮与执行同一判定。

**Independent Test**：切到「名称 A→Z」，把文件夹 F 下的 x 拖到根级节点下方，切回手动，x 在根组末尾；同级前后放置被拒。

### 测试（先红）

- [x] T025 [P] [US2] Angular `apps/dev-rxdb-angular/src/app/pages/file-manager/services/file-drag-drop.service.spec.ts` 改写：
  - 删 `calculateDropPosition` / `executeDrop` 的算键用例（含 `generateKeyBetween` 造的 `KEY_0..2`）；
  - 改为「执行拖放时传入当前排序模式：非手动模式子级拖到根级节点下方 → reorder(x, { group: { parentId: null } })」（现状执行时不传排序模式，先红）；
  - 「手动模式拖进文件夹 → { group }」「拖到文件上选拖入被拒」。
- [x] T026 [P] [US2] React `apps/dev-rxdb-react/src/app/hooks/useDragDrop.spec.ts` 加「非手动模式同级前后放置被拒、不调用 reorder」「非手动模式子级拖到根级节点下方 → { group: { parentId: null } }」。现状不看排序模式，先红。
- [x] T027 [P] [US2] Vue `apps/dev-rxdb-vue/src/app/composables/useDragDrop.spec.ts` 加 T026 的同名两条（先红）。
- [x] T028 [P] [US2] 三端 `tree-drag-reorder.spec.ts` 加 `contracts/demo-drag-drop.md` §5 的文件管理器用例 4 条：
  1. 手动模式文件夹之间重排、拖进文件夹；
  2. 文件管理器懒加载拖进折叠文件夹（缺陷三）；
  3. 非手动模式子级拖到根级节点下方移到根组末尾；
  4. 非手动模式同级前后放置被拒（`data-drop-valid="false"`，零写）。
  - 排序模式经 `file-sort-select` 切换。先红。

### 实现

- [x] T029 [US2] Angular `apps/dev-rxdb-angular/src/app/pages/file-manager/services/file-drag-drop.service.ts`：
  - `isValidDrop` / `calculateDropPosition` / `executeDrop` 收为「组装 `TreeDropInput`（`manual = sortMode === Manual`，`isFolder` 取节点类型）→ `resolveTreeDrop` → `reorder`」；
  - 删四处 `generateKeyBetween` 与内联 `|| ''` 比较器。
  - `getInvalidTargets` 改为对每个候选目标调 `resolveTreeDrop`。
  - 删本文件的 `calculateDropMode`，改用 `shared/tree-drop.ts` 的 `treeDropPosition`。T025 转绿。
- [x] T030 [US2] Angular `apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file.store.ts` 的 `TreeFileDragDropStore`：
  - `onDragOver` 与 `onDrop` 共用同一份判定（不再在执行时漏传排序模式）；
  - 删 `isDropRedundant`；
  - `reorder` 经 `tree-file.base.ts` 的 `runWrite('拖放', …)`。
  - `file-manager-lazy.store.ts` 的 override 同步，`groupIds` 取整组子节点。
  - `tree-file.store.spec.ts` 中 mock `executeDrop` 的用例改为断言 `reorder` 入参。
- [x] T031 [P] [US2] Angular 三个文件管理器模板 `file-manager-{simple,virtual,lazy}.page.html` 补 `data-drop-mode` / `data-drop-valid`（同 T020）。
- [x] T032 [P] [US2] React：`useDragDrop` 增加排序模式输入，菜单恒传手动；落点区间改用 `treeDropPosition`，删 `DROP_ZONE_THRESHOLD`（非手动模式非根级行整行拖进，FR-006 / FR-013）。
  - 三个文件管理器页 `apps/dev-rxdb-react/src/app/pages/file-manager/file-manager-{simple,virtual,lazy}.tsx` 传当前 `sortMode`，并提供完整组序列。T026 转绿。
- [x] T033 [P] [US2] Vue：`useDragDrop` 增加排序模式输入；落点区间改用 `treeDropPosition`，删 `DROP_ZONE_THRESHOLD`。
  - 三个文件管理器页 `apps/dev-rxdb-vue/src/pages/file-manager/FileManager{Simple,Virtual,Lazy}Page.vue` 传 `sortMode`；`FileManagerLazyPage.vue` 不再以 `store.loadedNodes` 算位置。T027 转绿。
- [ ] T034 [US2] 三端 `test lint` 全绿，跑三端 `tree-drag-reorder.spec.ts` 的文件管理器用例，T028 转绿。

**Checkpoint**：两条拖放链路都经引擎；三端文件管理器规则一致。

---

## Phase 5: User Story 3 — 拖放失败时看得见、界面停在库里的真实顺序 (Priority: P1)

**Goal**：拖放失败只走页内提示，删 `alert` / `toast`，拖拽状态在所有路径复位。

**Independent Test**：mock `reorder` 抛 `SortOrderError('staleTarget')`，页内出现「拖放失败：…」，无弹窗，拖拽状态复位，下一次拖放可用。

### 测试（先红）

- [x] T035 [P] [US3] Angular：`apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.store.spec.ts` 与 `apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file.store.spec.ts` 各加两条：
  - 「reorder 抛 SortOrderError 时 writeError 为『拖放失败：…』、拖拽状态复位、不调用 window.alert」；
  - 「下一次拖放清空错误」。
  - spy `window.alert` 断言未调用。现状弹窗，先红。
- [x] T036 [P] [US3] React：`apps/dev-rxdb-react/src/app/hooks/useDragDrop.spec.ts` 加同名两条，断言 `writeError` 为「拖放失败：…」与状态复位。
  - 拖放失败经 `useDragDrop` 接入 `runWrite`，使它成为唯一出口；「不调用 `alert`」断言放在这里（spy `window.alert`）。
  - 六个页面里不再有拖放的 catch 分支，由 T041 的检索兜住。先红。
- [x] T037 [P] [US3] Vue：`apps/dev-rxdb-vue/src/app/composables/useDragDrop.spec.ts` 加同名两条。
  - 另加「save/reorder 抛错时拖拽状态复位」：现状 `resetState` 被跳过，先红。
  - 页面层断言不调用 `useToast().error`。

### 实现

- [x] T038 [P] [US3] Angular：
  - 删 `apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.drag-drop.ts` 与 `apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file-drag-drop.base.ts` 里的 `window.alert` / `alert` 与 `console.error`；
  - 失败经 `runWrite('拖放', …)` 进页内提示；
  - 拖拽状态在 `finally` 复位。T035 转绿。
- [x] T039 [P] [US3] React：
  - 六页（`pages/menu/tree-menu-{simple,virtual,lazy}.tsx`、`pages/file-manager/file-manager-{simple,virtual,lazy}.tsx`）的 drop handler 删 `alert(getErrorMessage(…))`；
  - 失败经 `useTreeWriteError` 的 `runWrite('拖放', …)` 进 `OperationErrorAlert`。
  - `useDragDrop` 的 `finally` 复位。T036 转绿。
- [x] T040 [P] [US3] Vue：
  - 六页（`pages/menu/TreeMenu{Simple,Virtual,Lazy}Page.vue`、`pages/file-manager/FileManager{Simple,Virtual,Lazy}Page.vue`）删拖放路径的 `useToast().error`；
  - 失败经 `useTreeWriteError` 的 `guardWrite('拖放', …)` 进 `TreeWriteError`。
  - `useDragDrop.onDrop` 用 `try/finally` 复位。T037 转绿。
- [x] T041 [US3] 三端 `test lint` 全绿；`grep -rnE "alert\(|useToast\(\)\.error" apps/dev-rxdb-{angular,react,vue}/src/app/pages/{menu,file-manager} apps/dev-rxdb-vue/src/pages/{menu,file-manager}` 中不再有拖放相关调用（其余调用逐条核对后记入「基线备注」）。

**Checkpoint**：三端拖放的失败处理一致。

---

## Phase 6: User Story 4 — 手动顺序只有一个来源 (Priority: P2)

**Goal**：六页查询不带显式 `sortOrder` 排序；建树不排序；Manual 不排序；删「文件夹优先」预排序与全部比较器副本；AC#9 两条检索清零。

**Independent Test**：AC#9 两条检索无输出；React 文件管理器手动模式根级交替新建文件夹 A、文件 X、文件夹 B，显示 A、X、B。

### 测试（先红）

- [x] T042 [P] [US4] 三端文件排序器：
  - React `apps/dev-rxdb-react/src/app/utils/file-sorters.spec.ts` 把「自由排序…保持文件夹优先」改为「Manual 返回 null（保留查询顺序）」；
  - Angular 新建 `apps/dev-rxdb-angular/src/app/pages/file-manager/utils/file-sorters.spec.ts`、Vue 新建 `apps/dev-rxdb-vue/src/app/utils/file-sorters.spec.ts`，写同名用例。
  - 先红。
- [x] T043 [P] [US4] 三端建树顺序 = 查询顺序。给出一组「库序」与 `sortOrder` 字典序不同的输入（同组内键乱序但数组已按查询给出的顺序），断言建出的树按输入顺序，同名，先红：
  - Angular `apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.store.spec.ts`；
  - Angular 文件管理器 `apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file.store.spec.ts`；
  - React `useTreeMenuStore.spec.ts`、`useTreeMenuVirtualStore.spec.ts`、`useFileManagerLazyStore.spec.ts`；
  - Vue `apps/dev-rxdb-vue/src/app/composables/tree-menu-contract.spec.ts`、`file-manager-contract.spec.ts`。
- [x] T044 [P] [US4] 三端查询选项：
  - 把现有断言 `orderBy: [{ field: 'sortOrder', sort: 'asc' }]` 的用例改为断言不传 `orderBy`，先红：Angular `tree-menu-lazy.store.spec.ts:96-105` 等，React `useTreeMenuLazyStore.spec.ts`、`useFileManagerLazyStore.spec.ts`，Vue `apps/dev-rxdb-vue/src/app/composables/tree-menu-contract.spec.ts`、`file-manager-contract.spec.ts`。
  - React 阶段 A 的 `apps/dev-rxdb-react-e2e/src/tree-write-order.spec.ts` 根级交替新建用例收紧为 A、X、B 顺序断言（故事技术笔记），先红。

### 实现

- [x] T045 [P] [US4] Angular：
  - 删 `apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-utils.ts` 与 `apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-utils.ts` 的 `compareSortOrder`（含 `tree-utils.spec.ts` 对它的用例）；
  - `tree-menu.store.ts` 建树不排序；`tree-menu-lazy.store.ts` 删内联比较器；
  - 六页与懒加载 store 的查询删 `orderBy: [{ field: 'sortOrder', sort: 'asc' }]`：`tree-menu-{simple,virtual}.page.ts`、`tree-menu-lazy.store.ts` 三处、`tree-menu.store.ts` 的 `findChildren`、`file-manager-{simple,virtual}.page.ts`、`file-manager-lazy.store.ts` 三处；
  - `file-sorters.ts` 的 `getSortComparator(SortMode.Manual)` 返回 `null`，调用方（`tree-utils.ts` 的 `buildTreeNodes`、`file-manager-lazy.store.ts` 的 `treeNodes`）遇 `null` 不排序。
- [x] T046 [P] [US4] React：
  - 删 `apps/dev-rxdb-react/src/app/utils/sort-order.ts` 与 `sort-order.spec.ts`；
  - `useTreeMenuStore.ts` 建树不排序；`useTreeMenuVirtualStore.ts` 删内联比较器；
  - `useFileManagerLazyStore.ts` 删「文件夹优先」预排序（根、子、展开全部三处）；
  - 六页与 store 的查询删 `orderBy: sortOrder`（survey 列出的 `pages/menu/*`、`pages/file-manager/*`、`useTreeMenuStore.ts:31`、`useTreeMenuVirtualStore.ts:25`、`useTreeMenuLazyStore.ts` 四处、`useFileManagerLazyStore.ts` 四处）；
  - `utils/file-sorters.ts` Manual 返回 `null`，`useFileManagerStore.ts` / `useFileManagerLazyStore.ts` 遇 `null` 不排序；
  - 更新 `useTreeMenuLazyStore.spec.ts:163`、`useFileManagerLazyStore.spec.ts:137` 的期望顺序。
- [x] T047 [P] [US4] Vue：
  - 删 `apps/dev-rxdb-vue/src/app/utils/sort-order.ts` 与 `sort-order.spec.ts`；
  - `app/utils/tree-menu.ts` 的 `buildTreeMenuNodes` 不排序；
  - `useFileManagerLazyStore.ts` 删「文件夹优先」预排序三处；
  - 六页与 store 的查询删 `orderBy: sortOrder`；
  - `app/utils/file-sorters.ts` Manual 返回 `null`，调用方遇 `null` 不排序。
- [x] T048 [US4] 跑故事 AC#9 两条检索，确认无输出。三端 `test lint typecheck` 全绿；T042～T044 转绿。

**Checkpoint**：手动顺序只来自查询默认排序，demo 内不再有算键与比较器。

---

## Phase 7: Polish & 验收

- [ ] T049 三端 e2e 全量（含三端现有 a11y 用例，确认键盘操作与页内提示的 `role="alert"` 不退化；提示组件结构由阶段 A 的组件单测覆盖）（`pnpm nx run-many -t e2e --skipRemoteCache --parallel=1 -p dev-rxdb-angular-e2e,dev-rxdb-react-e2e,dev-rxdb-vue-e2e`）。
  - 新旧拖放 spec、阶段 A 的 `tree-write-order.spec.ts` 都绿。
  - 旧拖放 spec 若断言了被删行为，逐条改写并记入「基线备注」：React「拖进当前父节点不动」、React「文件夹优先」。
- [ ] T050 `pnpm test-all`；失败先单独复跑，再按 AGENTS.md 判真假，记入「基线备注」。
- [ ] T051 覆盖率：`node scripts/audit/coverage-check.mjs --check --projects=rxdb`，四指标 ≥ 90%。
- [ ] T052 quickstart §5 手工走查三端各一遍（1～4 步）。
  - SC-004：Angular 虚拟滚动页批量添加 10,000 条后拖一次，测松开到新顺序可见的耗时。
  - 数字写入 `specs/009-us031-tree-drag-reorder/research.md` R10「实测」。
- [ ] T053 回写需求：
  - `requirements/stories/core/US-031-tree-sortable-migration.md`：AC#5～9 状态与阶段 B 证据表；交付阶段表 B ✅；「一阶段一 PR」改为「A、B 同一 PR（owner 2026-10-08 定）」；技术笔记里「拖放失败仍走旧提示」「React 手动模式文件夹优先」两条改为已解决；实现文件表 B 行按实际路径更新；`status` 按 PR 状态。
  - `requirements/roadmap.md`、`requirements/status-overview.md` 同步。
  - 跑 `node scripts/audit/requirements-consistency.mjs`。
- [ ] T054 `npx prettier --write` 本故事改过的全部文件；三端 `lint` 零警告；`git status` 核对无顺带写回的 `benchmarks/reports/*.json` 等无关文件。

---

## Dependencies & Execution Order

- **Setup (T001～T002)** → **Foundational (T003～T012)**。
  - T003→T004→T005 串行；T006～T008、T012 与 core 可并行。
  - T009～T011 依赖 T005（读 dist 里的 `reorderTargetForDrop`）。
- **US1 (T013～T024)** 依赖 Foundational。三端实现 T018/T019（Angular）、T021（React）、T022（Vue）互相独立可并行；T023、T024 收尾。
- **US2 (T025～T034)** 依赖 Foundational。
  - React / Vue 与 US1 改的是同一个 `useDragDrop`，必须排在 US1 的 T021 / T022 之后。
  - Angular 文件管理器链路与 US1 独立，可与 US1 并行。
- **US3 (T035～T041)** 依赖 US1、US2（失败路径挂在新的拖放执行上）。
- **US4 (T042～T048)** 只依赖 Foundational 之前的阶段 A 成果，可与 US1～US3 并行。
  - 与 US1/US2 同改的文件（`tree-menu.store.ts`、`tree-file.store.ts`、`file-manager-lazy.store.ts`、React / Vue 的 store）要排在对应任务之后，避免冲突。
- **Polish (T049～T054)** 依赖全部故事。

## Parallel Example

```text
# Foundational 内并行：
T006 / T007 / T008（三端提示档）  ∥  T003→T004→T005（core）  ∥  T012（三端 e2e helper）
# US1 内三端并行：
T013 ∥ T015 ∥ T016 ∥ T017   →   T018+T019 ∥ T021 ∥ T022   →   T023 → T024
# US4 三端并行：
T045 ∥ T046 ∥ T047
```

## Implementation Strategy

- **MVP = US1**：菜单拖放全部经引擎，缺陷三关闭，三端 e2e 证明刷新一致。
- 之后 US2 补文件管理器、US3 统一失败处理、US4 收尾清零。
- 每个阶段结束跑该阶段的 Checkpoint，三端同一时刻停在同一状态。阶段 B 与阶段 A 同一 PR，不单独发布中间态。

---

## 基线备注

- T001：`rxdb`、`dev-rxdb-angular`、`dev-rxdb-react`、`dev-rxdb-vue` 的 `test`（连同依赖共 82 个任务，51 个命中缓存）全绿，无既有失败。
  同日发现本机 `~/Library/Caches/ms-playwright/` 被外部清空（磁盘占用 94%，疑为清理工具），按仓库锁定的 Playwright 1.63 重装 chromium；
  缓存命中的浏览器测试当时没有真正启动，所以基线未受影响。
- T002：AC#9 第一条检索命中 21 个文件（Angular 7、React 8、Vue 6，含 spec），第二条命中 13 个（Angular 6、React 4、Vue 3），清单见 research 盘点与本阶段 diff。
- T003：实现先于浏览器可用写成，红态事后补证——把 `sortable.utils.ts` 临时换回 HEAD 版本跑该 spec，命名导入缺失使整个文件加载失败（0 条用例执行）；
  换回实现后 10 / 10 通过。`rxdb` 全量 2,433 条通过。
- T005：`api-surface.mjs --check` 命中 SC-014 前缀规则（核心新增导出须为 `Commit*` / `WorkingTree*`）。按 US-028 `reorderTargetForMove` 的先例，
  把 `reorderTargetForDrop` 逐名登记进 `scripts/audit/api-surface.mjs` 的例外清单并写明理由，再 `--update`：基线 diff 只多这一项；脚本自测 14 / 14。

