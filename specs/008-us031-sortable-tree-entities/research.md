# Research: US-031 阶段 A

## R1 新实体复刻还是继承旧实体

**Decision**：复刻（四个独立的 `@TreeEntity` 类），不继承 `MenuSimple` 等。

**Rationale**：

- 仓库里没有继承**具体**实体的先例（只有继承抽象基类 `TreeAdjacencyListEntityBase`）；`metadata-transition.ts` 的合并规则虽能处理
  （属性按名覆盖、自引用关系改指子类、索引名在 DDL 里带表名前缀不冲突），但没有任何测试覆盖这条路径。
- `@TreeEntity` 在调用方没写 `features` 时会补 `tree.hasChildren ?? false`（`tree-entity.decorator.ts`），合并时子类这层覆盖父类：
  继承 `MenuLarge` 的子类若漏写 `features`，`hasChildren` 会从 `true` 静默变成 `false`，懒加载页的展开图标随之消失。
- 复刻与 `rxdb-test/src/tree-unique/fixtures.ts`「刻意不复用、按 1:1 复刻」的先例一致；旧实体是适配器测试夹具，新实体是 demo 实体，
  解耦后谁改都不牵连对方。复刻的漂移风险由「与旧实体同形」的契约单测兜住（[contracts/rxdb-test-sortable-tree-entities.md](contracts/rxdb-test-sortable-tree-entities.md) 不变量 1）。

**Alternatives considered**：继承（少约 60 行重复，换来未测试的合并路径与上述默认值陷阱）；抽一个共享的实体选项工厂
（要改旧实体的声明写法，违背「旧实体一个字节不变」）。

## R2 「本批新建父行的组必为空」是否可靠

**Decision**：可靠，作为 core 追加的优化规则（[contracts/core-batch-append.md](contracts/core-batch-append.md) 变化二）。

**Rationale**：外键在全部本地后端上强制——SQLite 系 `Oo1ClientBase` 的建连 pragma（`sqlite-client.utils.ts` 的 `PRAGMA foreign_keys = ON`）、
wa-sqlite `WaSqliteClientBase.ts`、electron `node:sqlite`（`node-sqlite-engine.spec.ts` 断言 `PRAGMA foreign_keys` 为 1）、tauri `rust/src/engine.rs`；
`RxDBAdapterSqliteBase` 在事务内设 `defer_foreign_keys = ON`，只推迟到提交时校验。PGlite 建表时生成外键约束（`create_table_sql.ts`）。
已提交的库状态因此不存在指向未建行的外键。树的 `parentId` 是自引用多对一关系的外键列（`TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS`），
本批新建的父行一定在同一实体的 create 桶里。

备份恢复期间 `restore-sqlite-database.ts` 临时 `foreign_keys = OFF`，但它整库替换一份一致的快照，不经手动排序写入路径，不影响判据。

**Alternatives considered**：一次 `IN (…)` 查询取全部目标组的行再在内存取每组尾键——没有聚合能力（`IRepository` 无 `GROUP BY`，见 roadmap
「epic-006 评审顺延的架构项」），返回的是这些组里的**全部**行，追加到大组时成本随组规模增长，还要处理 SQLite 绑定参数上限；
保留逐组查询只做变化一——实测仍是 2.3 倍，超预算。

## R3 批量添加性能基线

**方法**：临时 vitest 浏览器用例（`packages/rxdb-adapter-sqlite-wasm`，内存 VFS，chromium），按 demo `generateBatchMenus` 的方式
用固定种子造随机树（父节点随机取自根与本批已建节点，深度上限 7），同一台机器上依次测三种写法的单次 `saveMany` 耗时；用例跑完已删除。
另用 node 单独测拆分算法。

| 条数   | 组数  | 旧实体 + demo 预算键 | 可排序 + 显式键 | 可排序 + core 追加（现状） |
| ------ | ----- | -------------------- | --------------- | -------------------------- |
| 1,000  | 443   | 62 ms                | 47 ms           | 94 ms                      |
| 10,000 | 4,206 | 450 ms               | 453 ms          | 1,631 ms（3.6×）           |

node 基准（`benchmarks/sortable-batch-append.bench.ts`，PGlite 内存库，每种写法 5 个样本取中位数，同一棵固定种子树）在改动前：

| 条数   | 组数  | 显式键   | 缺键追加   | 比值 |
| ------ | ----- | -------- | ---------- | ---- |
| 1,000  | 443   | 78.4 ms  | 173.4 ms   | 2.21 |
| 10,000 | 4,206 | 637.1 ms | 1,857.1 ms | 2.91 |

PGlite 上同样超出 1.2 的门槛，基准在实现前即为红。

拆分算法（node，10,000 行 / 4,206 组）：线性 `find` + `isEqual` 581 ms，按组键 `Map` 4 ms。其余约 600 ms 是 4,206 次尾键查询。

实现后复测（同一方法；组键 `Map` 拆分 + 同批新建父行的组不读尾键）：

| 后端                    | 条数   | 旧实体 + demo 预算键 | 可排序 + 显式键 | 可排序 + core 追加 | 比值（追加 / 显式键） |
| ----------------------- | ------ | -------------------- | --------------- | ------------------ | --------------------- |
| sqlite-wasm（chromium） | 1,000  | 63 ms                | 51 ms           | 54 ms              | 1.06                  |
| sqlite-wasm（chromium） | 10,000 | 477 ms               | 478 ms          | 454 ms             | 0.95                  |
| PGlite（node 基准）     | 1,000  | —                    | 82.6 ms         | 83.4 ms            | 1.01                  |
| PGlite（node 基准）     | 10,000 | —                    | 686.1 ms        | 665.0 ms           | 0.97                  |

**结论**：现状 core 追加超出 SC-004（≤ 1.2×）三倍，必须在本阶段优化。两项优化后的推算值：显式键路径 453 ms + 组键拆分约 4 ms +
根组一次尾键查询 ≈ 460 ms（约 1.02×）。推算不能代替验收：实现后用 `benchmarks/sortable-batch-append.bench.ts` 与同一浏览器用例复测。

**Alternatives considered**：放宽 SC-004（demo 最大档位多等 1 秒多）——批量添加 10,000 条本身就是 demo 的性能展示，退化三倍不可接受。

## R4 删除提升一次提交时会不会被级联删掉子节点

**Decision**：不会；三端统一用 `entityManager.mutations(getEntityMutations({ needSaveEntities: 子节点, needRemoveEntities: [被删节点] }))`（Angular 现状）。

**Rationale**：适配器的 `mutations` 依次执行 create → update → remove（`packages/rxdb-adapter-sqlite-core/src/rxdb_adapter_mutations.ts` 的三个循环），
子节点改挂先于父节点删除，父关系的 `ON DELETE CASCADE` 生效时子节点已不指向它。子节点只改 `parentId`、不给 `sortOrder`，
`EntityManager.mutations` 按 US-028「分组字段变更」在同一事务内把它们按批内顺序追加到新组末尾。顺序依赖由三端回归用例守住
（删除提升后子节点仍在、位于新组末尾）。

**Alternatives considered**：React / Vue 现状的逐条 `save()` 再 `remove()`——中途失败留下部分子节点已搬走；`Promise.all` 并发保存——追加顺序取决于入队顺序，且同样不原子。

## R5 基准放在哪

**Decision**：新增 `benchmarks/sortable-batch-append.bench.ts`（node + PGlite，与 `push-receipts.bench.ts` 同一套写法与 `bench-stats.ts`），
nx 目标 `benchmarks:bench-sortable-batch`；同一次运行里先测「显式键」再测「缺键追加」，比值超过 1.2 即 `process.exit(1)`。

**Rationale**：比值在同一次运行里自比，不需要冻结跨机器的参考档；node 基准是 `benchmarks/` 的既有形态。demo 的真实后端是 sqlite-wasm，
它的数字只能在浏览器里测，作为 R3 的一次性实测与实现后复测记录，不进 CI。

**Alternatives considered**：只在 sqlite-wasm 浏览器用例里断言比值——浏览器 runner 计时抖动大，放进常规测试会产生假失败。

## R6 页内错误提示怎么统一

**现状**（逐文件盘点）：

| 端      | 新建 / 批量添加                                                                                                    | 删除 / 级联 / 删除提升                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Angular | `tree-menu.base.ts` / `tree-file.base.ts` 用 `console.error` + `window.alert`；批量添加经 `useAction` 抛出、无人接 | 同左，`window.alert('删除失败')`                                                                                        |
| React   | 表单 `onSubmit` 与批量添加的 `try/finally` 都不接错，成为未处理拒绝；文件页没有任何错误状态                        | 菜单页 `deleteError` 状态经 `OperationErrorAlert`（`div.alert role="alert"`）显示                                       |
| Vue     | 不接错，未处理拒绝                                                                                                 | 删除叶子节点在 virtual / lazy 页走全局 `useToast`（`AppToast.vue`，`role="alert"`，4 秒自动消失）；删除提升与级联不接错 |

三个应用都没有全局 `errorHandler` / `unhandledrejection` 兜底。

**Decision**：六个树页面各放一个页内错误提示，承接页面上除拖放外的全部写入（新建、重命名、批量添加、删除、级联删除、删除提升）：
`div.alert.alert-error`、`role="alert"`、带关闭按钮、`data-testid="tree-write-error"`；文案统一为「<操作>失败：<错误消息>」，
操作名取固定的六个（新建、重命名、批量添加、删除、级联删除、删除并提升子节点）。React 复用并扩大 `OperationErrorAlert` 的接线范围；
Angular 用一个 signal 与同结构模板替换这几处 `window.alert`；Vue 补同结构的页内组件，这几类写入不走 toast（toast 留给拖放，阶段 B 再统一）。

**Rationale**：只修删除提升会让同一个页面里删除与删除提升走两套提示；页内提示可被 e2e 定位、对读屏可见，`window.alert` 是阻塞弹窗、
4 秒自动消失的 toast 在 e2e 里有竞态。删除与级联删除不涉及排序键，但与删除提升共用同一个错误状态（React 现状即如此），一并接上才不留半套。

**Alternatives considered**：三端都改用 toast——需要给 Angular / React 各补一个全局 toast 设施，且自动消失不利于断言；只接删除提升——同页两套提示。

## R7 排序键怎么验收

**Decision**：分两层。键层面（各组严格递增、同批新建父行的组从首键起、既有组从尾键之后）由 core 契约套件验收：
在 `packages/rxdb-test/src/sortable/` 增加自引用树夹具（独立 namespace，与 `tree-unique` 夹具同法），按 demo 的三种写法（缺键新建、
`generateBatchMenus` 形状的批量、`mutations` 删除提升）写入后直接读键，SQLite 与 PGlite 两个 runner 各跑一遍。
demo 层面只断言两件事：单测断言交给引擎的写入不含 `sortOrder`、删除提升是一次 `mutations`；e2e 断言操作后刷新读回的顺序。

**Rationale**：e2e 读不到键——没有通用的读库测试 API（`__searchDemoTestApi` 只管 Article / Comment，Angular 的 `__rxdbFailureArchive.snapshot()`
只给行数），行上也没有排序键属性；为此给三端加读库 API 或 `data-sort-order` 属性是只为测试存在的产品面。键的正确性本是 core 的责任，
用契约套件在真实后端上验，比在 demo 里间接验更直接。`rxdb-test/src` 的 `rootDir` 够不到 `entities/`，所以套件用自己的夹具；
新实体与夹具同形由 R1 的同形契约单测保证。

**Alternatives considered**：经 Angular 失败现场归档 `archive()` 在 node 里打开 SQLite 读键——只有 Angular、只在强制 IDB 的 e2e 端口可用，三端不对称。

## R8 删除提升读哪批子节点

**Decision**：三端都从库里取被删节点的直接子节点（按父节点查询，React 懒加载 `fetchMenuChildren` 的做法）；是否弹出删除对话框按库算的
`hasChildren`（`SortableMenuLarge` 懒加载 / virtual 页），全量加载的 simple 页内存即全集、照旧。

**Rationale**：Angular 的 `TreeMenuStore.deleteMenu` 与 `executePromoteChildrenDelete` 都按 `menuResource.value()` 判断，懒加载页传入的是
`visibleNodes()`（只含已加载节点）；节点折叠时不弹对话框、直接 `remove()`，父关系 `ON DELETE CASCADE` 把未加载的子树一并删掉。
Vue 懒加载页的删除提升读全表（`fetchAllMenus()`）再过滤，结果正确但读得多；按父查询即可。

**Alternatives considered**：删除前强制展开节点——依赖异步订阅时序，且改变交互。
