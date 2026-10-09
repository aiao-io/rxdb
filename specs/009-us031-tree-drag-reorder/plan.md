# Implementation Plan: US-031 阶段 B — 树页面拖放与显示顺序

**Branch**: `003-us031-sortable-tree-entities`（与阶段 A 同分支、同 PR） | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-us031-tree-drag-reorder/spec.md`

## Summary

三端六个树页面的拖放改为「页面判定落点 → `Repository.reorder()` 一次事务完成定位与改挂」。

- **前后放置**：邻居由 core 新增的纯函数 `reorderTargetForDrop` 从目标组的完整序列换算，它与已有的 `reorderTargetForMove` 并列。
- **拖进节点**：一律写 `{ group: { parentId } }`，不读目标的子节点，缺陷三由此根治。
- **文件管理器**：非手动模式三端统一沿用 Angular 的规则。高亮与执行改为调用同一个判定函数。
- **显示顺序**：取自查询的默认排序，删除三端全部算键代码、比较器副本、重编号与「文件夹优先」预排序。
- **失败处理**：拖放失败并入阶段 A 的页内提示，删除 `alert` / `toast`。
- **e2e**：三端新增同名的真实拖拽用例。

## Technical Context

**Language/Version**: TypeScript 6.0 strict，ESM

**Primary Dependencies**: `@aiao/rxdb`（sortable 模块：`Repository.reorder`、`ReorderTarget`、`SortOrderError`、`reorderTargetForMove`）、Angular 22 / React 19 / Vue 3.5、RxJS 7.8

**Storage**: demo 用 sqlite-wasm（OPFS / IDB）；本阶段不改实体与表

**Testing**: Vitest（core 单测、三端 demo 单测）；Playwright（三端 e2e，真实鼠标拖拽）

**Target Platform**: 浏览器 demo（三端）

**Project Type**: Nx monorepo：`packages/rxdb`（一个新导出）+ 三个 demo 应用 + 三个 e2e 应用

**Performance Goals**: 一次拖放从松开到新顺序可见 ≤ 1 秒（SC-004，10,000 节点虚拟滚动页）；`reorder()` 一次事务 < 100 ms（constitution 默认）

**Constraints**:

- US-028 的重排语义一字不变。
- 三端对称：判定表、写入、提示与 DOM 属性同名同义。
- 非手动模式的显示比较器不动。
- 不改阶段 A 交付的创建类写入。

**Scale/Scope**:

- core：1 个新导出（`sortable.utils.ts` + `index.ts` + api-baseline）。
- 三端：各有菜单与文件管理器两条拖放链路（服务 / hook / composable、store、页面），六页的查询与建树，`file-sorters.ts`，页内提示的操作名。
- 三端 e2e：各一个新 spec。

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                      | 检查                                                                                                                                                                                                           | 结论         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| I 代码质量                | TS strict、零 ESLint 警告、无 `any`、嵌套 ≤ 3；新导出 `reorderTargetForDrop` 带 TSDoc；删除 `REORDER_NEEDED` / `rebalanceSortOrder`（非事务的整组重写）、`\|\| ''` / `?? ''` 兜底与 `window.alert`，不加新兜底 | ✅           |
| I 复杂度                  | core 新增一个导出 → 见 Complexity Tracking；三端各自的判定函数替换现有的三份「算位置」服务，净减代码                                                                                                           | ✅（已论证） |
| II 测试                   | TDD：core 换算先写十条表驱动红测；缺陷三先写三端不修即红的单测与 e2e；判定表 9 行三端同名单测；失败分支单测（见 Complexity Tracking）；覆盖率 `rxdb` ≥ 90%（`scripts/audit/coverage-check.mjs`）               | ✅           |
| II 确定性                 | e2e 落点取行高 15% / 50% / 85%，避开三端判定区间的边界；刷新后读回；拖拽 spec `mode: 'serial'`；不依赖时序注入失败                                                                                             | ✅           |
| III 三端一致              | [contracts/demo-drag-drop.md](contracts/demo-drag-drop.md) 一份判定表、一组 DOM 属性、一组文案；三端 e2e 同名用例；React 手动模式「文件夹优先」与另两端对齐（spec 已写明用户可见变化）                         | ✅           |
| III 可见状态              | loading：拖放提交中沿用现有状态；empty：拖进空组 / 折叠节点；error：页内 `role="alert"`；a11y：不新增控件、现有键盘操作不退化（spec Accessibility）                                                            | ✅           |
| III Never break userspace | `@aiao/rxdb` 只新增导出；demo 用户可见变化（拖进当前父节点移到末尾、React 手动模式不再文件夹优先、非手动模式前后放置改为被拒、失败不再弹窗）在 spec 写明                                                       | ✅           |
| IV 性能                   | 不增加查询（research R10）；SC-004 实测一次记入 research；`benchmarks/` 不新增（重排是固定语句数，US-028 已覆盖其契约；本阶段无新的引擎热路径）                                                                | ✅           |

Phase 1 设计后复查：无新增违规。

## Project Structure

### Documentation (this feature)

```text
specs/009-us031-tree-drag-reorder/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── core-drop-target.md
│   └── demo-drag-drop.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks 产出
```

### Source Code (repository root)

```text
packages/rxdb/src/sortable/sortable.utils.ts        # + reorderTargetForDrop
packages/rxdb/src/index.ts                          # 导出
packages/rxdb/src/__tests__/sortable/reorder-target-for-drop.spec.ts   # 新

apps/dev-rxdb-angular/src/app/
├── shared/tree-write-error.ts                      # TreeWriteOperation + '拖放'
├── shared/tree-drop.ts                             # 新：resolveTreeDrop（菜单与文件管理器共用）
└── pages/
    ├── menu/
    │   ├── services/menu-drag-drop.service.ts      # 改为 resolveTreeDrop + reorder；删 calculateDropPosition / rebalanceSortOrder
    │   ├── utils/tree-menu.store.ts                # 建树不排序；删 isDropRedundant；onDrop 经 runWrite
    │   ├── utils/tree-menu.drag-drop.ts            # 删 window.alert
    │   ├── utils/tree-utils.ts                     # 删 compareSortOrder
    │   ├── tree-menu-{simple,virtual}/*.page.ts    # 查询去 orderBy
    │   └── tree-menu-lazy/tree-menu-lazy.store.ts  # 查询去 orderBy、删内联比较器
    └── file-manager/
        ├── services/file-drag-drop.service.ts      # 同菜单；高亮与执行共用判定
        ├── utils/{tree-file.store,tree-file-drag-drop.base,tree-utils,file-sorters}.ts
        ├── file-manager-{simple,virtual}/*.page.ts
        └── file-manager-lazy/file-manager-lazy.store.ts
    # 六页模板补 data-drop-mode / data-drop-valid
apps/dev-rxdb-react/src/app/
├── utils/{tree-write-error,file-sorters,sort-order}.ts   # sort-order.ts 删除
├── hooks/useDragDropService.ts、useDragDrop.ts            # resolveTreeDrop + reorder；删 resolveSiblings / mergeById
├── hooks/useTreeMenu{,Virtual,Lazy}Store.ts、useFileManager{,Lazy}Store.ts   # 查询去 orderBy、删比较器与文件夹优先预排序
└── pages/menu/*、pages/file-manager/*                     # 去 alert，拖放经页内提示；文件管理器传排序模式
apps/dev-rxdb-vue/src/
├── app/utils/{tree-write-error,file-sorters,sort-order,tree-menu}.ts
├── app/composables/useDragDropService.ts、useDragDrop.ts、useTreeMenu*Store.ts、useFileManager*Store.ts
└── pages/menu/*、pages/file-manager/*                     # 去 useToast，拖放经页内提示
apps/dev-rxdb-{angular,react,vue}-e2e/src/tree-drag-reorder.spec.ts   # 新
```

**Structure Decision**：

- 沿用现有目录，判定函数放在各端现有的拖放服务文件里，不新建目录。
- Angular 菜单与文件管理器两条拖放链路的判定共用 `resolveTreeDrop`（菜单传 `manual: true`、`isFolder: true`），放在 `app/shared/tree-drop.ts`，与阶段 A 的 `tree-write-error.ts` 同目录。
- React / Vue 本来就由菜单与文件管理器共用 `useDragDropService`，判定函数放在那里。

## 实施顺序

1. **core**（先红后绿）：`reorderTargetForDrop` 十条表驱动用例 → 实现 → 导出与 api-baseline → `rxdb` 构建进 dist（demo 经别名读 dist）。
2. **三端判定与写入**（三端同一顺序）：
   1. `resolveTreeDrop` 判定表 9 行单测（红）→ 实现；
   2. 缺陷三回归单测（红）→ 拖进改 `{ group }`；
   3. 拖放执行改为 `reorder()`，经页内提示，操作名 `'拖放'`；删 `alert` / `toast`，`finally` 复位拖拽状态；失败分支单测；
   4. 文件管理器接入排序模式（React / Vue 新增输入；Angular 高亮与执行共用判定）；
   5. 删除旧的算位置服务、`rebalanceSortOrder`、`REORDER_NEEDED`、`isDropRedundant`、`resolveSiblings` 及其单测。
3. **三端显示顺序**：六页查询去 `orderBy: sortOrder`；建树不排序；`getSortComparator(Manual)` → `null`；删「文件夹优先」预排序与 `sort-order.ts` / `compareSortOrder`；React `file-sorters.spec.ts` 改写。AC#9 两条检索清零。
4. **三端 e2e**：Angular 行模板补 DOM 属性；各写拖拽 helper 与 `tree-drag-reorder.spec.ts`（[contracts/demo-drag-drop.md](contracts/demo-drag-drop.md) §5）。
5. **验收与回写**：
   - `pnpm test-all`；quickstart §5 走查与 SC-004 实测；
   - US-031 AC#5～9 状态与证据、交付阶段表 B；
   - 故事「一阶段一 PR」改为「A、B 同一 PR」（owner 2026-10-08 定）；
   - roadmap / status-overview 同步，故事转 In Review 由 PR 决定。

## 风险

- **e2e 拖拽的最后一次落点判定**：落点区间三端统一为三等分（research R11），e2e 取 15% / 50% / 85%。真实拖拽的 `dragover` 节流可能让最后一次落点判定滞后，helper 在 `up` 之前多停一步 `move`。
- **删比较器后某处的显示依赖了排序副作用**：例如 Angular 懒加载 store 合并多次查询结果时按 `sortOrder` 重排。按父节点的查询本身有序，合并处要保持「每组一个数组」，不能把多组拼成一个再期望有序。实施时逐处核对，单测断言建树顺序 = 查询顺序。
- **React 手动模式不再文件夹优先**：属用户可见变化，spec 已写明。阶段 A 的 React `tree-write-order.spec.ts` 根级交替新建用例按故事技术笔记收紧为 A、X、B。

## Complexity Tracking

| Violation                                                                      | Why Needed                                                                                                                                                     | Simpler Alternative Rejected Because                                                                                                                                                         |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@aiao/rxdb` 新增导出 `reorderTargetForDrop`                                   | 前后放置的邻居换算三端今天各写一份且已分叉；跨组放置不是 `reorderTargetForMove`（同一序列的下标移动）能表达的；三端 todo 页已用 core 的同类换算（research R1） | 三端各留一份：同一张契约表三份实现，故事要消除的「三端各算一遍」换个形式留下；放进 `@aiao/rxdb-plugin-tree`：换算与树无关，且扩大插件公开面                                                  |
| 拖放失败分支只有单测、没有 e2e（constitution III 要求跨框架一致性由 E2E 验证） | 同一页面里活查询在拖动前就把界面刷新到库里的状态，提交时的 `staleTarget` / `notFound` 在 Playwright 下没有确定性触发点；成功路径与「被拒零写」路径有三端 e2e   | 为造失败加测试专用开关或延迟注入：只为测试存在的产品面，且时序注入违背 constitution II 的确定性；改由三端同名单测断言提示结构、文案与状态复位（同阶段 A 的处理）。审批：随本 plan 的 PR 评审 |
