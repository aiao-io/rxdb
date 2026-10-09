# Implementation Plan: US-031 阶段 A — 可排序树实体与创建类写入

**Branch**: `003-us031-sortable-tree-entities` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-us031-sortable-tree-entities/spec.md`

## Summary

在 `@aiao/rxdb-test` 新增四个可排序树实体（复刻 `MenuSimple` / `MenuLarge` / `FileNode` / `FileLarge`，按 `parentId` 分组、`sortOrder` 必填），
三端 demo 六个树页面改用它们；新建、批量添加、删除并提升子节点不再自己算键，交给 US-028 的按组追加与改分组字段追加；删除提升三端统一为
一次 `mutations`，子节点从库里取；除拖放外的写入失败三端统一为页内 `role="alert"` 提示。

基准实测（[research.md](research.md) R3）显示 core 的批内追加在 demo 的随机树上是现状的 3.6 倍，本阶段同时优化 core：按组键 `Map` 拆分，
以及「分组外键指向本批新建行的组不读尾键」。两项都不改语义、不碰公开 API。

拖放、显示顺序、比较器与重编号的删除属阶段 B，本阶段拖放照旧由 demo 显式算键再保存（合法显式键 core 原样保留）。

## Technical Context

**Language/Version**: TypeScript 6.0 strict，ESM

**Primary Dependencies**: `@aiao/rxdb`（sortable 模块，US-028 阶段 A + D）、`@aiao/rxdb-plugin-tree`、`@aiao/utils`、Angular 22 / React 19 / Vue 3.5、RxJS 7.8

**Storage**: demo 用 sqlite-wasm（OPFS / IDB）；契约套件跑 SQLite 与 PGlite 两个 runner；node 基准用 PGlite

**Testing**: Vitest（core 与 rxdb-test 单测、sqlite-wasm 浏览器模式契约 runner、三端 demo 单测）；Playwright（三端 e2e）

**Target Platform**: 浏览器 demo（三端）；core 改动覆盖全部本地后端

**Project Type**: Nx monorepo：库（`packages/rxdb`、`packages/rxdb-test`）+ 三个 demo 应用 + 三个 e2e 应用 + `benchmarks`

**Performance Goals**: 批量添加 10,000 条（demo 最大档位）缺键追加 ≤ 同次运行显式键耗时的 1.2 倍；单节点新建落库 < 100 ms（constitution 默认预算）

**Constraints**: US-028 契约语义一字不变；旧四个树实体与远端 `menu_large` 表、electron / tauri 注册零改动；三端对称；不新增公开 API（`rxdb-test` 只新增实体导出）

**Scale/Scope**: core 2 个文件；`rxdb-test` 4 个新实体 + 契约 / 套件 / 基线；三端各 6 页（菜单 3、文件 3）的 store / hook / composable 与批量生成器；三端 e2e；1 个新基准

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                      | 检查                                                                                                                                                                                                                                                             | 结论         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| I 代码质量                | TS strict、零 ESLint 警告、无 `any`、嵌套 ≤ 3；新增导出（四个实体）带 TSDoc；删除 `catch → generateKeyBetween(null, null)` 兜底与 `window.alert`，不加新兜底                                                                                                     | ✅           |
| I 复杂度                  | core 新增「同批新建父行的组不读尾键」一条规则 → 见 Complexity Tracking                                                                                                                                                                                           | ✅（已论证） |
| II 测试                   | TDD：每条缺陷先写不修即红的回归（缺陷一、二、Angular 懒加载删除折叠节点）；core 规则先写计查询次数的红测；US-028 契约套件零修改通过；覆盖率：`rxdb` ≥ 90%、`rxdb-test` ≥ 80%（`scripts/audit/coverage-check.mjs`）                                               | ✅           |
| II 确定性                 | 基准用固定种子造树；比值在同次运行自比；e2e 只走成功路径，失败分支在单测里验（无确定性的失败注入点）                                                                                                                                                             | ✅           |
| III 三端一致              | 写入形状、提交方式、页内错误提示结构与文案三端同一份契约（[contracts/demo-write-paths.md](contracts/demo-write-paths.md)），三端 e2e 同名用例                                                                                                                    | ✅           |
| III 可见状态              | loading（批量添加的禁用态沿用）、empty（空组首节点）、error（页内 `role="alert"`）、a11y（关闭按钮可键盘操作，现有键盘操作不退化）均已定义；demo 已有树数据换实体后不显示，已在 spec 写明                                                                        | ✅           |
| III Never break userspace | 只新增 `rxdb-test` 导出，旧实体不变；demo 用户可见变化（删除提升后子节点排到末尾、旧树数据不显示、旧归档 `incompatible_archive`）在 spec 与故事写明                                                                                                              | ✅           |
| IV 性能                   | 目标与测法已定（R3、R5）；新增 `benchmarks/sortable-batch-append.bench.ts`，并入 nx 目标与 `ci-template.yml` 的 `benchmark` job（触发条件 `need_benchmark` 覆盖改了 `packages/` 或 `benchmarks/` 的 PR）；实现后用同一浏览器用例复测 sqlite-wasm 并记入 research | ✅           |

Phase 1 设计后复查：无新增违规。

## Project Structure

### Documentation (this feature)

```text
specs/008-us031-sortable-tree-entities/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── core-batch-append.md
│   ├── rxdb-test-sortable-tree-entities.md
│   └── demo-write-paths.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks 产出
```

### Source Code (repository root)

```text
packages/rxdb/src/sortable/
├── sortable.utils.ts              # 组键拆分；appendToGroupTails 接收「已知为空的组」判据
└── sortable-mutations.ts          # appendBatchSortOrders 从 create 桶推出外键指向本批新建行的组
packages/rxdb/src/__tests__/sortable/  # 单测：组键规范化、尾键查询次数

packages/rxdb-test/
├── entities/SortableMenuSimple.ts | SortableMenuLarge.ts | SortableFileNode.ts | SortableFileLarge.ts   # 新
├── entities/index.ts              # 导出与 ENTITIES
├── src/sortable/                  # 自引用树夹具 + 契约用例（同批新建父行、既有组追加、删除提升）
├── src/__tests__/                 # 同形契约单测；published-model-invariants 实体数 14 → 18
└── public-contract/               # consumer.ts、baseline.json

benchmarks/
├── sortable-batch-append.bench.ts # 新
└── project.json                   # bench-sortable-batch 目标

.github/workflows/ci-template.yml  # benchmark job 的 run-many 并入 bench-sortable-batch

apps/dev-rxdb-angular/src/app/pages/
├── menu/                          # 三个页面换实体；TreeMenuStore 新建 / 批量 / 删除 / 删除提升；tree-utils.ts generateBatchMenus；
│                                  # tree-menu.base.ts 的错误提示；懒加载 store 删除判据与子节点读库
└── file-manager/                  # 三个页面换实体；TreeFileStore 新建 / 批量；file-manager-lazy.store.ts 批量；file-utils.ts generateBatchFiles；
                                   # tree-file.base.ts 的错误提示
apps/dev-rxdb-react/src/app/
├── hooks/useTreeMenu{,Virtual,Lazy}Store.ts、useFileManager{,Lazy}Store.ts
├── utils/menu-utils.ts、utils/file-utils.ts
├── components/OperationErrorAlert.tsx   # 扩大接线范围
└── pages/menu/*、pages/file-manager/*   # 换实体、批量与新建的错误接线
apps/dev-rxdb-vue/src/
├── app/composables/useTreeMenu{,Virtual,Lazy}Store.ts、useFileManager{,Lazy}Store.ts
├── app/utils/menu-utils.ts、app/utils/file-utils.ts
├── app/components/                      # 页内错误提示组件（与 React 同结构）
└── pages/menu/*、pages/file-manager/*
apps/dev-rxdb-{angular,react,vue}-e2e/src/  # 树菜单与文件管理器 spec：顺序读回、删除提升、懒加载折叠删除
```

**Structure Decision**：沿用现有目录，不新建项目。Angular 的 `menu/utils/tree-menu.basic.ts` 与 `menu/models/menu-operation.types.ts` 无人引用
（后者引用旧实体），本阶段不动——删除死代码不在本故事范围，另记零散收尾项。

## 实施顺序

1. **core 优化**（先红后绿）：组键拆分 → 同批新建父行的组不读尾键 → `rxdb-test` 自引用树契约用例两 runner 绿 → 基准 ≤ 1.2 → 基准接入 CI。
2. **新实体**：四个实体 + 同形契约单测 + 注册与公开契约基线（`rxdb-test` 需构建进 dist，demo 经 `tsconfig.base.json` 别名读 dist）。
3. **三端 demo**（三端同一 PR、同一顺序）：
   1. 页面换实体（含 Angular 两个注入令牌的取值）；
   2. 新建：去掉锚点与算键（缺陷一回归先红）；
   3. 批量：生成器不写 `sortOrder`，React 懒加载菜单改回一次 `saveMany`；
   4. 删除提升：子节点读库、一次 `mutations`（缺陷二回归先红）；懒加载 / virtual 页删除判据改用 `hasChildren`（Angular 懒加载折叠删除回归先红）；
   5. 页内错误提示接上五类写入，去掉 `window.alert` 与未处理拒绝；
   6. 三端 e2e。
4. **回写**：US-031 AC#1～4 状态与证据、交付阶段表 A；research R3 补实现后的 sqlite-wasm 复测数字；roadmap / status-overview 同步。

## 风险

- **共享 `saveMany` 的外键推断判错组**：若某分组外键在本批 create 桶里找不到对应实体类型（关系指向别的实体且该实体不在本批），规则不触发、回到逐组查询——只会慢，不会错。
  判错方向（把非空组当空组）只在库里存在指向未建行的外键时发生，R2 已论证不可能；契约用例在两个后端上各断言一次「插入指向不存在父行的子行被外键约束拒绝」，把判据的前提钉住。
- **demo 既有库的旧树数据「消失」**：开发者打开 demo 会看到空树。已在 spec 写明；不做迁移提示（不新增 UI）。
- **e2e 时长**：三端各新增约 5 条树用例；沿用现有页面的 `resetE2eState` 与 helper，不新建夹具应用。

## Complexity Tracking

| Violation                                                                          | Why Needed                                                                                          | Simpler Alternative Rejected Because                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core 追加新增一条判据：分组外键指向本批新建行的组不读尾键                          | demo 随机树 10,000 行有约 4,200 组，逐组读尾键约 600 ms，光改拆分仍是现状 2.3 倍（R3），超出 SC-004 | 一次 `IN` 查询取全部目标组的行：没有聚合查询能力，返回目标组的全部行、随组规模增长，还要处理 SQLite 参数上限（R2）；放宽 SC-004：批量添加是 demo 的性能展示，退化三倍不可接受                                                             |
| 页内错误提示只有组件单测、没有 e2e（constitution III 要求跨框架一致性由 E2E 验证） | 本地库写入无法从 Playwright 拦截，页面的路径冲突预检又挡在唯一索引之前，e2e 没有确定性的失败注入点  | 为造失败给产品加测试专用的读写 API 或故障开关：只为测试存在的产品面，且各端不一致的风险更大；改由三端同名的组件 / 页面单测断言结构（`role="alert"`、关闭按钮、`data-testid`）与失败分支，成功路径仍有三端 e2e。审批：随本 plan 的 PR 评审 |
