---
id: US-031
title: 树形实体迁移到排序模块
status: Done
priority: Medium
epic: epic-004-future-features
created: 2026-10-03
updated: 2026-10-09
tags: [core, sortable, tree, rxdb-test, demo]
---

# 用户故事：树形实体迁移到排序模块

## 作为/我想要/以便

**作为** 在三端 demo 里操作树菜单与文件管理器的开发者
**我想要** demo 的树改用声明了可排序（以 `parentId` 为分组字段）的树实体，新建、拖放、删除并提升子节点时的排序键一律由 [US-028](US-028-sortable-entity.md) 的排序模块给出
**以便** 同父兄弟不再撞键，同一操作在三端结果一致，demo 不再各算一遍排序键

## 背景与动机

### 撞键可以复现

下面三条在 Angular demo 上用临时 vitest 用例复现：直接调用页面自己的 store / service（实体为假对象、`save` 为 mock），断言算出的键。

- **新建根文件夹与根级文件撞键。** [`TreeFileStore.createRootFolder`](../../../apps/dev-rxdb-angular/src/app/pages/file-manager/utils/tree-file.store.ts) 只在根级文件夹里取末尾键，`createFile` 却在全部根节点里取：

  ```ts
  const rootFolders = allFiles.filter(f => !f.parentId && f.type === 'folder').sort(compareSortOrder);
  ```

  依次新建文件夹 A（`a0`）、根级文件 X（`a1`）、文件夹 B，B 得 `a1`，与 X 同键。

- **删除并提升子节点后撞键。** [`TreeMenuStore.executePromoteChildrenDelete`](../../../apps/dev-rxdb-angular/src/app/pages/menu/utils/tree-menu.store.ts) 只改子节点的 `parentId`，子节点带着原组的键进入祖父组：G 下有 P（`a0`）、Q（`a1`），P 下有 c1（`a0`）、c2（`a1`），删 P 并提升后 G 组为 `Q:a1 / c1:a0 / c2:a1`。React / Vue 菜单 store 的同名方法同样只改 `parentId`。

- **拖进未展开的懒加载节点，与它的首个子节点撞键。** 拖放服务在传入的节点列表里找目标的子节点取末尾键，`MenuDragDropService.calculateDropPosition`（阶段 B 已删，原文见 `git show 37ccf014:apps/dev-rxdb-angular/src/app/pages/menu/services/menu-drag-drop.service.ts`） 的 `into` 分支：

  ```ts
  newSortOrder = generateKeyBetween(lastChild?.sortOrder || null, null);
  ```

  Angular 懒加载页只传已加载节点（[`TreeMenuLazyStore`](../../../apps/dev-rxdb-angular/src/app/pages/menu/tree-menu-lazy/tree-menu-lazy.store.ts) 与文件管理器的懒加载 store 都以 `visibleNodes()` 作数据源），Vue 懒加载页传 `store.loadedNodes`。目标未展开时它的子节点不在列表里，算出 `a0`，与既有的首个子节点同键，被拖节点也没有落到末尾。React 已为同一缺陷补了 `resolveSiblings`（阶段 B 已删，原文见 `git show 37ccf014:apps/dev-rxdb-react/src/app/hooks/useDragDrop.ts`）（注释写明「缺了它算出的键会和既有子节点撞车」），Angular / Vue 的菜单与文件懒加载共 4 页没有。

读源码可见、未运行的两条：

- React 懒加载文件管理器的 [`addManyFiles`](../../../apps/dev-rxdb-react/src/app/hooks/useFileManagerLazyStore.ts) 以 `rootIds` 末位作批量追加的锚点，`rootIds` 按「文件夹优先、再按 `sortOrder`」排过序；根级有文件夹排在最后一个文件之后时，新批次的根键与该文件夹撞键。
- Angular 文件管理器的新建路径在 `generateKeyBetween` 抛错时 `catch` 后改用 `generateKeyBetween(null, null)`，静默落成 `a0`。

### 三端已经分叉

- **懒加载取兄弟**：React 读库补齐，Angular / Vue 只看已加载节点（见上）。
- **算键失败**（两邻同键时 `generateKeyBetween` 抛错）：Angular 菜单返回 `REORDER_NEEDED` 后由 `MenuDragDropService.rebalanceSortOrder`（阶段 B 已删） 把整组逐条重写键，不在事务内，也违反 US-028「不重编号」；React / Vue 的拖放服务同样返回 `REORDER_NEEDED`，调用方直接抛错，没有恢复。
- **删除并提升子节点**：Angular 一次 `mutations` 提交；React / Vue 逐条 `save()` 子节点后再删父节点，中途失败会留下部分子节点已搬走的状态。

### 病灶在结构上

排序键在 demo 里算了三遍：22 个非 spec 文件直接调 `@aiao/utils` 的 `generateKeyBetween`（Angular 6、React 8、Vue 8），`sortOrder` 比较器的副本散在 15 个文件里——Angular 两个 `tree-utils.ts` 的 `compareSortOrder`、两个拖放服务与 `tree-menu-lazy.store.ts` 的内联比较，React / Vue 的 `utils/sort-order.ts` 与 virtual store 的内联比较，三端 `file-sorters.ts` 的 Manual 模式。键从内存里的局部列表算，读写不在同一事务，也不复核邻居；上面每一条缺陷都出自这个结构。逐条定点修能关掉这几条，下一个写入口还会再长出来。

US-028 阶段 A + D 已提供所需的全部原语：按组创建追加、`Repository.reorder()`（含追加到某组末尾的跨组移动）、改分组字段的写入追加到新组末尾、锚点校验与事务写边界。`parentId` 是多对一关系 `parent` 的外键列，[`groupFieldIssue`](../../../packages/rxdb/src/entity/metadata-validate.ts) 对外键列放行，可作分组字段；`TreeRepository` 继承 `Repository`，即有 `reorder()`。已知病灶 5 条、新增抽象 0（新实体是测试夹具，不是引擎抽象），满足 [CONVENTIONS](../../CONVENTIONS.md#价值待证) 的「病灶数 ≥ 抽象数」。

### 新建可排序树实体，不改现有四个

`rxdb-test` 的 `MenuSimple` / `MenuLarge` / `FileNode` / `FileLarge` 声明可空的 `sortOrder`，不满足 US-028 的非空校验；它们也不只是 demo 实体：

- **引擎改不了既有表的列。** 连接既有库时只经 [`RxDB.#ensureEntityTables`](../../../packages/rxdb/src/RxDB.ts) 补建缺失的表，没有实体改列的路径；SQLite 加 `NOT NULL` 要重建表（连带适配器维护的触发器与索引），`MigrationType.up(executor)` 做不了。原地改声明只会让新库建成 `NOT NULL`、旧库仍可空。
- **适配器测试会整批失败。** [`menuIntegrationSuite`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/shared-menu.suite.ts)（electron、tauri conformance、sqlite、sqlite-wasm、sqliteai、wa-sqlite 六个 runner 共用）与 PGlite 的树测试经 `save()` 写入 `'a'`、`'1'`、`'special'` 这类非法键，声明 `manualOrder` 后门面的 [`assertMutationSortOrders`](../../../packages/rxdb/src/sortable/sortable-mutations.ts) 整批抛 `invalidKey`；不带 `orderBy` 的查询也改按 `[parentId, sortOrder, id]` 排序。
- **远端表与桌面宿主也在用。** [03-business-tables.sql](../../../docker/sql/03-business-tables.sql) 的 `menu_large."sortOrder"` 是可空 `varchar` 且已 `rxdb_enable_sync_for_table`，supabase 适配器测试经适配器层仓库写入 `'a'`～`'e'`；electron 三个、tauri 两个 setup 注册了这四个实体（不渲染树页面）。

理由与 US-028 阶段 E 不改共享 `Todo`、另建 `Task` 相同。新实体是新表，建表即 `NOT NULL`，不需要迁移；代价是 demo 里已有的树数据换实体后不再显示。

## 范围边界

### In Scope

- `rxdb-test` 新增四个可排序树实体，列形状与索引 1:1 复刻 `MenuSimple` / `MenuLarge` / `FileNode` / `FileLarge`（含同级唯一索引、`(parentId, sortOrder)` 索引与 `FileNode` / `FileLarge` 的计算属性），另声明 `manualOrder: { groupBy: ['parentId'] }`、`sortOrder` 非空；注册进 `ENTITIES`
- 三端 demo 的树菜单（simple / virtual / lazy）与文件管理器（simple / virtual / lazy）改用新实体
- 新建、批量添加、删除并提升子节点、同父与跨父拖放、拖进节点内部，排序键一律由 core 给出；手动顺序取自查询默认排序
- 删除 demo 内算树排序键的代码、`sortOrder` 比较器副本、`rebalanceSortOrder` / `REORDER_NEEDED` 路径与 `catch → a0` 兜底
- 三端同一套拖放失败处理；三端拖放 e2e（含上面三条缺陷的回归）

### Out of Scope

- `MenuSimple` / `MenuLarge` / `FileNode` / `FileLarge` 的 schema、默认查询顺序与写入行为；`docker/sql` 的远端 `menu_large` 表；electron / tauri 的实体注册
- 既有 demo 库里旧实体的树数据搬到新实体
- US-028 的排序语义本身（本故事只消费阶段 A + D）；引擎为既有表补 `NOT NULL` 的改列能力
- `@aiao/rxdb-plugin-tree` 的写入期环检测、深度限制、懒加载语义；环检测沿用 demo 的 `isDescendantOf`
- 树查询（`findDescendants` 等适配器递归 CTE）的排序
- `ISortableTreeEntity` 收窄为非空：新实体的 `sortOrder!: string` 已满足 `sortOrder?: SortOrderKey | null`，收窄会让不声明 `manualOrder` 的树实体编译失败（US-028 AC#8 / AC#9），没有病灶支撑
- 文件管理器名称 / 类型 / 扩展名 / 大小等非手动排序模式的比较器（这些模式下的拖放写入在范围内，见 AC#6）
- rxdb-model 实体模型页对新实体的手动排序：`children` 关联表钉住 `parentId`，手柄由 US-028 阶段 B 的 UI 启用谓词自动打开，本故事不另加验收

## 交付阶段

| 阶段 | 交付                                                                                                                                                                                                                                            | 直接前置                    | AC 区段 | 状态 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------- | ---- |
| A    | 新实体与创建类写入：四个可排序树实体；三端六页改用新实体；新建、批量添加、删除并提升子节点不再自己算键（交给 core 的按组追加与改分组字段追加），删除提升三端统一为一次提交；core 批内追加优化（按组键拆分、同批新建父行的组不读尾键）；三端 e2e | US-028 阶段 A + D（已交付） | AC#1～4 | ✅   |
| B    | 拖放与显示顺序：三端拖放改走 `Repository.reorder()`（含文件管理器非手动排序模式的映射），失败处理三端同交；手动顺序取自查询默认排序；删除剩余的算键、比较器、`rebalanceSortOrder` 与兜底；三端拖放 e2e                                          | 阶段 A                      | AC#5～9 | ✅   |

两个阶段同一分支、同一 PR（owner 2026-10-08 定；原计划一阶段一 PR），每个阶段三端同交。按写入类型而不按页面切：React / Vue 的 `useDragDrop` → `useDragDropService` 由菜单与文件管理器共用，按页面切会让共用的拖放层在中间态同时挂两条写入路径。阶段 A 交付后拖放仍由 demo 显式算键再 `save()`，合法的显式键 core 原样保留，可以单独发布；懒加载撞键（上面第三条）由阶段 B 关闭。

## 验收标准

| #   | 前置条件                                                             | 操作                                                                                                                                                   | 预期结果                                                                                                                                                                                                                                | 状态 |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `rxdb-test` 四个可排序树实体                                         | 元数据初始化；新库建表；不带 `orderBy` 查询；跑旧实体的现有测试                                                                                        | 校验通过，`sort_order` 建成 `NOT NULL`；不带 `orderBy` 按 `[parentId asc, sortOrder asc, id asc]`，根节点所在的 NULL 组在前；旧实体的 schema、默认查询顺序与写入行为不变，`menuIntegrationSuite`、PGlite 与 supabase 的树测试不改即通过 | ✅   |
| 2   | 三端菜单与文件管理器 simple / virtual / lazy 六页改用新实体          | 新建根节点与子节点；文件管理器根级依次新建文件夹、文件、文件夹；在未展开、子节点未加载的父节点下新建；刷新页面                                         | 页面不传 `sortOrder`，新节点追加到同父末尾，文件与文件夹同属一组；刷新后顺序不变；三端一致                                                                                                                                              | ✅   |
| 3   | 同上，同父下已有节点（文件管理器根级有排在最后一个文件之后的文件夹） | 批量添加菜单与文件；刷新页面                                                                                                                           | 同组按批内顺序排在同父原有节点之后，与原有节点不重序；批量生成不再写空串键；三端一致                                                                                                                                                    | ✅   |
| 4   | 祖父 G 下有 P、Q，P 下有若干子节点                                   | 删除 P 并选择提升子节点；刷新页面                                                                                                                      | 子节点改挂 G 与删除 P 在一次提交内完成，子节点按原顺序追加到 G 组末尾（排在 Q 之后）；三端一致                                                                                                                                          | ✅   |
| 5   | 三端菜单页，每组至少三个兄弟                                         | 同父拖到两邻之间、组首、组尾；跨父拖到两邻之间；拖进已展开节点、拖进未展开且子节点未加载的懒加载节点；拖到自己或后代；原位放下；撤销一次拖放；刷新页面 | 同父只写 `sortOrder`；跨父在一个事务内只写 `parentId` 与 `sortOrder`；拖进节点一律追加到其子节点末尾，与是否展开无关；拖到后代被拒绝、零写；原位零写；撤销恢复拖放前的父节点与顺序；刷新后顺序与拖放后一致；三端 Playwright 真实拖拽    | ✅   |
| 6   | 三端文件管理器页                                                     | 手动排序模式下做 AC#5 的全部拖放（文件不作拖入目标）；非手动排序模式下拖进文件夹、把子级节点拖到根级节点上 / 下方、同级上 / 下方拖放                   | 手动模式同 AC#5；非手动模式拖进文件夹追加到其末尾，拖到根级节点上 / 下方追加到根组末尾，同级上 / 下方拖放被拒、零写（规则沿用现状，写入改走 core）                                                                                      | ✅   |
| 7   | 三端菜单与文件管理器页                                               | 重排被拒（`SortOrderError`：`staleTarget` / `notFound` / `corruptAnchor`）                                                                             | 零写，展示错误，界面保持库里最新已提交的顺序，下一次拖放可用；三端同交互                                                                                                                                                                | ✅   |
| 8   | 三端六页，手动排序模式                                               | 浏览全量、虚拟滚动与懒加载树；拖放后与刷新后各读一次顺序                                                                                               | 兄弟顺序取自查询默认排序，页面查询不再带显式 `sortOrder` 排序，也不再自带 `sortOrder` 比较器；React / Vue 懒加载文件管理器的「文件夹优先」预排序不参与手动模式                                                                          | ✅   |
| 9   | 三端 demo 源码                                                       | 跑下方两条检索                                                                                                                                         | 都无输出（被删代码的单测随之删改）                                                                                                                                                                                                      | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

AC#9 的检索：

```bash
grep -rlE "generateKeys?Between|compareSortOrder|rebalanceSortOrder|REORDER_NEEDED" apps/dev-rxdb-{angular,react,vue}/src
grep -rlE "sortOrder *(\?\?|\|\|) *''" apps/dev-rxdb-{angular,react,vue}/src
```

AC#2～#8 的三端验收是 Playwright 操作后刷新页面读回顺序（同 US-028 阶段 E 的 `todo-sort.spec.ts`），AC#5、#6 是真实拖拽。写集合最小、键严格递增由 core 保证（US-028 的跨适配器契约套件）；本故事的单测断言 demo 交给 core 的入参：新建与批量不传 `sortOrder`，拖放调用 `reorder()` 的目标形式。需要直接读键的断言（如 AC#2 根级交替新建）经 demo 的实体模型页或 e2e 测试 API 读库，由 plan 定。

阶段 A 的证据（契约套件在 SQLite 与 PGlite 两个 runner 上各跑一遍；三端用例同名）：

| AC  | 测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/rxdb-test/src/__tests__/sortable-tree-entities.spec.ts`（与旧实体同形、可排序声明、旧实体不变、命名不撞）、`entity-model-contract.spec.ts`、`published-model-invariants.spec.ts`；`menuIntegrationSuite` 六个 runner、PGlite 与 supabase 树测试不改即通过                                                                                                                                                                                                                                                                                                                                                                   |
| 2   | 契约套件「缺键新建：根组、已有子节点的组、空组各自追加到组尾」；Angular `tree-file.store.spec.ts`「新建文件夹 / 子文件夹 / 文件都不赋 sortOrder（缺陷一：根级文件夹与文件交替新建）」、React `useFileManagerStore.spec.ts`、Vue `file-manager-writes.spec.ts` 的同一场景；三端 `tree-write-order.spec.ts`「根级依次新建文件夹、文件、文件夹，刷新后顺序不变」「折叠节点下新建子节点，展开后排在末尾」                                                                                                                                                                                                                                 |
| 3   | 契约套件「批量添加：同批新建的父节点下从首键起，既有组从库里尾键之后，组内按批内顺序」；`packages/rxdb/src/__tests__/sortable/manual-order-batch-append.spec.ts`（同批新建父行的组不读尾键）；三端批量单测；三端 `tree-write-order.spec.ts`「批量添加后原有根节点仍在最前」「文件管理器懒加载页批量添加后根级原有节点在前」；`benchmarks/sortable-batch-append.bench.ts` 比值 ≤ 1.2                                                                                                                                                                                                                                                   |
| 4   | 契约套件两条「删除并提升子节点」（被删节点是根 / 不是根）；Angular `tree-menu.store.spec.ts`「删除并提升子节点（缺陷二）」「删除读库里的子节点，不看页面已加载的节点」、React `useTreeMenuStore.spec.ts`、Vue `tree-menu-writes.spec.ts` 的同组用例；文件端 Angular `tree-file.store.spec.ts`「删除读库里的子节点，不看页面已加载的节点」、React `useFileManagerLazyStore.spec.ts`「删除对话框的影响数取自库」、Vue `file-manager-writes.spec.ts` 的同组用例；三端 `tree-write-order.spec.ts`「删除并提升子节点，子节点排到祖父组末尾」「懒加载页删除折叠节点仍弹出选择对话框」「文件管理器懒加载页删除折叠文件夹弹出级联删除对话框」 |

批量添加的性能（demo 的随机树，10,000 行约 4,200 组）：core 追加优化前缺键追加是显式键的 3.6 倍（sqlite-wasm）/ 2.91 倍（PGlite），
优化后 0.95 / 0.97 倍；测法与数字见 `specs/008-us031-sortable-tree-entities/research.md` R3。
全量门禁 `pnpm test-all`（74 个项目的 lint / typecheck / test / test-browser / build / e2e）通过；三端 `tree-write-order.spec.ts` 以 `mode: 'serial'` 运行，并发分散到多个 worker 时会抢占本机 CPU、拖慢同批的 `search-refresh`（实测与对照见 `specs/008-us031-sortable-tree-entities/tasks.md` 基线备注）。
既有库升级：用 `main` 构建的 Angular demo 建库后，再用本故事的代码打开同一个库。新树为空，新建可用，旧表行数不变，四张新表已补建。
首轮走查暴露的引擎缺陷（技术笔记「既有库打开」）已修，门禁用例为 `rxdb-adapter-sqlite-wasm/src/__tests__/existing-db-new-entity.spec.ts`；
该修复在引擎层，三端共用；React / Vue 未另做浏览器走查。

阶段 B 的证据（三端单测与 e2e 用例同名，`specs/009-us031-tree-drag-reorder/contracts/demo-drag-drop.md` §4、§5）：

| AC  | 测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | `packages/rxdb/src/__tests__/sortable/reorder-target-for-drop.spec.ts`（前后放置换算，含跨组与原位）；三端 `resolveTreeDrop` 判定表 9 条与 `treeDropPosition` 落点区间 5 条；三端「拖进折叠且子节点未加载的节点：目标为 { group }，不读子节点」（缺陷三）「前后放置的邻居取自组的完整序列，不取搜索过滤后的可见行」；三端 `tree-drag-reorder.spec.ts`「同父拖到两邻之间」「拖到组首与组尾」「跨父拖到两个子节点之间」「菜单懒加载：拖进折叠节点，展开后排在末尾」「拖到后代上被拒、零写」「原位放下与拖进当前父节点（已是末尾）都零写」「拖放后撤销一次恢复」「虚拟滚动页同父重排」 |
| 6   | 三端「非手动模式同级前后放置被拒、不调用 reorder」「非手动模式子级拖到根级节点下方 → { group: { parentId: null } }」；三端 `tree-drag-reorder.spec.ts`「文件管理器手动模式：文件夹之间重排、拖进文件夹」「文件管理器懒加载：拖进折叠文件夹，展开后排在末尾」「文件管理器非手动模式：子级拖到根级节点下方移到根组末尾」「文件管理器非手动模式：同级前后放置被拒」                                                                                                                                                                                                                    |
| 7   | 三端「reorder 抛 SortOrderError 时页内提示「拖放失败：…」、拖拽状态复位、不弹窗」「下一次拖放清空错误」；三端 `tree-write-error.spec.ts` 的「拖放」操作名。失败路径只有单测，理由见 `specs/009-us031-tree-drag-reorder/plan.md` Complexity Tracking                                                                                                                                                                                                                                                                                                                                 |
| 8   | 三端「建树顺序 = 查询顺序」「查询不传 orderBy」「Manual 返回 null（保留查询顺序）」；React `tree-write-order.spec.ts` 根级交替新建收紧为 A、X、B                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 9   | 下方两条检索在三端 demo 源码中无输出                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 技术笔记

- **拖放到 core 的映射**（阶段 B）：
  - 拖进节点 → `reorder(id, { group: { parentId: target.id } })`，不读目标的子节点；目标未展开同样正确，第三条缺陷由此根治，React 的 `resolveSiblings` 不再需要。
  - 拖到某节点上 / 下方 → `reorder(id, { prevId, nextId })`，邻居由 core 的 `reorderTargetForDrop` 从目标所在组的**完整**序列（含被搜索过滤隐藏、不在虚拟滚动窗口内的兄弟）去掉被拖节点后换算，目标在组首 / 组尾时一侧为 `null`；只取可见兄弟会把隐藏的兄弟夹在两个邻居之间，被 core 判 `staleTarget`。
  - 原位放下不调用：`reorderTargetForDrop` 返回 `null`；拖进当前父节点而它已是末尾时由 core 零写。
  - 三端的落点判定是同名纯函数 `resolveTreeDrop`（判定表）与 `treeDropPosition`（落点区间统一为三等分，非手动模式非根级行整行为「拖进」）；拖动中的高亮与放下后的执行调同一个函数。
  - 文件管理器非手动排序模式下拖到根级节点上 / 下方 → `{ group: { parentId: null } }`。
- **环检测**留在调用 `reorder()` 之前，沿用 demo 的 `isDescendantOf`：能拖到的目标必然逐级展开过祖先，懒加载下祖先链已在内存（`useDragDrop` 的注释有同样论证）。它与重排事务之间有窗口，并发移动下可能放过环（推断，未复现）；写入期检测属树插件能力，不在本故事。
- **查询**：阶段 B 前三端都给显式 `orderBy: [{ field: 'sortOrder', sort: 'asc' }]`，按 US-028 契约显式排序原样尊重、不补 `id`；阶段 B 删掉后走默认排序 `[parentId, sortOrder, id]`（懒加载按父查询同样适用），建树按查询顺序、不再排序。
- **批量添加**：`generateBatchMenus` 先给每个节点写 `sortOrder = ''` 再算键；空串是显式的非法键，不再算键后若留着它，整批被 `invalidKey` 拒绝。批量造数一律不写 `sortOrder`；core 按目标组拆分追加，同批新建的父节点下的子节点从 `a0` 起，与现状一致。
- **删除并提升子节点**：子节点只改 `parentId`、不给键，由 US-028「分组字段变更」在同一事务内按批内顺序追加到祖父组末尾——提升的子节点排到原兄弟之后，不再按旧键插进原兄弟之间，这是用户看得见的行为变化。三端统一为一次 `mutations` 提交（Angular 现状），React / Vue 的逐条 `save()` 改掉。
- **分组字段经关系设置**：demo 有几处用 `parent$.set()` 改父节点；多对一关系的 `set()` 同步写外键（`relation-helper.ts`），core 读到的分组取值就是新父节点，与直接写 `parentId` 等价。
- **失败处理**：`reorder()` 失败时抛 `SortOrderError` 且零写。树页面由活查询驱动，零写时界面本就停在库里的顺序（不同于 VTable，不会停在拖后的顺序），只需展示错误、清忙碌态。`staleTarget` / `notFound` 提示后重试即可；`corruptAnchor` 说明数据已脏，新实体只经 core 写入，正常不会出现。三端共用同一组提示与状态。
- **撤销**：拖放改走主适配器事务后，history 里这一项的类型是 `TRANSACTION`（US-028「重排写入」），一次撤销仍恢复一次拖放；三端树页面的 e2e 不断言 history 项类型。
- **新实体**：复刻还是继承旧实体由 plan 定，前提是不改旧实体的 schema；命名不得与 `rxdb-test/src/sortable/` 的契约夹具重名，注册约束同 US-028 技术笔记「新实体的注册与连带改动」（三端 `entity-model.spec.ts` 断言首个实体是 `Account`）。electron / tauri 不注册新实体（不渲染树页面）。
- **连带变化**：
  - `DEMO_ENTITIES` 变了，备份与失败现场归档的结构指纹由实体清单算出（[`schemaFingerprintInput`](../../../packages/rxdb/src/backup/schema-fingerprint.ts)），本故事合入前导出的归档会按 `incompatible_archive` 拒绝恢复。
  - 实体模型页里新实体的默认列表顺序是 `[parentId, sortOrder, id]`；`children` 关联表钉住 `parentId`，自动出现拖拽手柄（见 Out of Scope）。
- **三端文件管理器的手动排序显示**（阶段 B 已统一）：阶段 B 前 React 的 `utils/file-sorters.ts` 在手动模式下先把文件夹排在文件前；
  现在三端 `getSortComparator(Manual)` 都返回 `null`、保留查询顺序，React 的文件管理器从「文件夹优先」变为纯手动顺序（用户可见），
  React `tree-write-order.spec.ts` 的根级交替新建用例已收紧为与另两端相同的 A、X、B 顺序断言。
- **拖放失败的提示**（阶段 B 已统一）：阶段 B 前 Angular / React 用 `window.alert`、Vue 用 `useToast`；现在三端提交失败都进页内 `tree-write-error` 提示（`拖放失败：…`），
  页面判定为被拒的落点（环、文件作拖入目标、非手动模式的同级前后放置）不提示，以拖动中的无效高亮表示、零写。
- **既有库打开**（阶段 A 走查发现的引擎缺陷，已修）：用 main 的 demo 建过库，再用本故事的代码打开，`connect()` 以 `no such table: main.public$sortable_file_large` 失败，页面空白、任何写入都报错。
  - 起因：`runMigrations` 的引导期事务按默认值写日志。sqlite 每个带日志的事务开头会为 `config.entities` 的全部实体重建变更触发器，而新实体的表要到迁移之后的 `#ensureEntityTables` 才补建。
  - 必然触发：工作树插件贡献了系统迁移，装了它的库每次 `connect()` 都会开这次事务。
  - 修法：迁移事务改为不写日志，与同一条引导链路上 `#assertClaimedCapabilities` 的只读事务口径一致。迁移里的写入照样由表上已有的触发器记进 `rxdb_change`，只是不再共享 `transactionId`。
  - 范围：缺陷不限于本故事，任何既有库新增记日志的实体都会撞上。e2e 全在新库上跑，走首装一次性建表的路径，碰不到补建分支。
- **现有 e2e 基线**：Angular `menu-drag-sort.spec.ts` 没有拖拽操作；Angular 与 Vue 的文件管理器 spec 没有拖放；React 的菜单与文件管理器覆盖了同父重排与拖入。AC#5、#6 的三端 e2e 是新增的 `tree-drag-reorder.spec.ts`。
- **Angular 的视图转场**：Angular 树页面的放下包在 `document.startViewTransition` 里（三端只有 Angular 有），转场期间指针事件交给覆盖层，紧接着的下一次拖拽起不来；e2e 的 `dragRowTo` 松开后等 `document.activeViewTransition` 回到 `null`。
  三端的转场差异是既有现象，不在本故事。

## 实现文件

| 阶段  | 文件                                                                                                                                                                                                                                                                               | 说明                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A     | `packages/rxdb-test/entities/`（四个新实体文件、`index.ts`）                                                                                                                                                                                                                       | 可排序树实体与 `ENTITIES` 注册                                                                                                                   |
| A     | `packages/rxdb/src/sortable/sortable.utils.ts`、`sortable-mutations.ts`                                                                                                                                                                                                            | 批内追加：按组键拆分；分组外键指向本批新建行的组不读尾键                                                                                         |
| A     | `packages/rxdb-test/src/sortable/manual-order-tree.suite.ts`、`fixtures.ts`（`SortableNode`）                                                                                                                                                                                      | 自引用外键分组的契约用例（缺键新建、批量、删除提升、外键前提）                                                                                   |
| A     | `benchmarks/sortable-batch-append.bench.ts`、`benchmarks/project.json`、`.github/workflows/ci-template.yml`                                                                                                                                                                        | 批内追加基准（比值 ≤ 1.2）并入 CI 的 `benchmark` job                                                                                             |
| A     | `packages/rxdb/src/system/migration-runner.ts`、`packages/rxdb-adapter-sqlite-wasm/src/__tests__/existing-db-new-entity.spec.ts`                                                                                                                                                   | 既有库升级：迁移事务不写日志，新实体表补建前不再重建它的触发器（见技术笔记「既有库打开」）                                                       |
| A     | `packages/rxdb-test/public-contract/`、`packages/rxdb-test/src/__tests__/published-model-invariants.spec.ts`、`entity-model-contract.spec.ts`                                                                                                                                      | 公开契约基线、`DEMO_ENTITIES` 实体数断言、新实体的索引断言                                                                                       |
| A     | `apps/dev-rxdb-angular/src/app/pages/menu/`、`pages/file-manager/`                                                                                                                                                                                                                 | 页面换实体；`TreeMenuStore`、`TreeFileStore` 与两个懒加载 store 的新建、批量添加（`generateBatchMenus` 等）、删除提升                            |
| A     | `apps/dev-rxdb-react/src/app/hooks/useTreeMenu*Store.ts`、`useFileManager*Store.ts`、`utils/menu-utils.ts`、`utils/file-utils.ts`、`pages/menu/`、`pages/file-manager/`                                                                                                            | 同上；删除提升改为一次提交                                                                                                                       |
| A     | `apps/dev-rxdb-vue/src/app/composables/useTreeMenu*Store.ts`、`useFileManager*Store.ts`、`src/app/utils/menu-utils.ts`、`src/app/utils/file-utils.ts`、`src/pages/menu/`、`src/pages/file-manager/`                                                                                | 同上                                                                                                                                             |
| B     | `packages/rxdb/src/sortable/sortable.utils.ts`（`reorderTargetForDrop`）、`src/index.ts`、`requirements/api-baseline/rxdb.json`、`scripts/audit/api-surface.mjs`（SC-014 逐名例外）                                                                                                | 前后放置换算成 `reorder()` 的邻居目标，三端共用                                                                                                  |
| B     | `apps/dev-rxdb-angular/src/app/shared/tree-drop.ts`、`pages/menu/services/menu-drag-drop.service.ts`、`pages/file-manager/services/file-drag-drop.service.ts`、两个 `tree-utils.ts`、`file-sorters.ts`、`tree-menu.store.ts`、`tree-file.store.ts`、两个懒加载 store、六个页面模板 | 拖放经 `resolveTreeDrop` → `reorder()`；删比较器、`rebalanceSortOrder`、兜底与显式 `sortOrder` 排序；模板补 `data-drop-mode` / `data-drop-valid` |
| B     | `apps/dev-rxdb-react/src/app/hooks/useDragDrop.ts`、`useDragDropService.ts`、`utils/file-sorters.ts`（删 `utils/sort-order.ts`）、各 store 与六个页面                                                                                                                              | 同上；删 `resolveSiblings`                                                                                                                       |
| B     | `apps/dev-rxdb-vue/src/app/composables/useDragDrop.ts`、`useDragDropService.ts`、`src/app/utils/file-sorters.ts`、`tree-menu.ts`（删 `utils/sort-order.ts`）、各 store 与六个页面                                                                                                  | 同上；补前后放置的环检测                                                                                                                         |
| A / B | `apps/dev-rxdb-angular-e2e/`、`apps/dev-rxdb-react-e2e/`、`apps/dev-rxdb-vue-e2e/` 的树菜单与文件管理器 spec                                                                                                                                                                       | 新建、批量、删除提升（A）与拖放（B）的三端 e2e                                                                                                   |

## References

- [US-028 可排序实体](US-028-sortable-entity.md) — 排序模块、分组排序域与跨组移动（阶段 A / D）；不改共享实体、另建可排序实体的先例（阶段 E 的 `Task`）
- [US-010 树形实体](US-010-tree-entity.md) — 树节点排序的原始验收（AC#2/#3）
- [tree-entity.interface.ts](../../../packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts) — `ISortableTreeEntity`
- [menu-drag-drop.service.ts](../../../apps/dev-rxdb-angular/src/app/pages/menu/services/menu-drag-drop.service.ts) — Angular 菜单的算键、`rebalanceSortOrder` 与 `isDescendantOf`
- [useDragDrop.ts](../../../apps/dev-rxdb-react/src/app/hooks/useDragDrop.ts) — React 的 `resolveSiblings` 与祖先链论证
