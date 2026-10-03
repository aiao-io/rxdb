---
id: US-028
title: 可排序实体（普通实体手动排序）
status: Done
priority: Medium
epic: epic-004-future-features
created: 2026-09-20
updated: 2026-10-03
tags: [core, sortable, grouping, model, rxdb-model, tree, demo]
---

# 用户故事：可排序实体（普通实体手动排序）

## 作为/我想要/以便

**作为** 模型开发者
**我想要** 让普通（非树）实体显式声明可排序——整表一条序列，或按分组字段各成一条序列——并在 rxdb-model 实体列表里拖拽手动排序
**以便** 分类、菜单、清单等扁平列表也能获得与树形节点一致的排序能力，且排序能力不依赖 `@aiao/rxdb-plugin-tree`

## 背景与动机

- **表格的拖拽重排没有写入路径。** `buildTableOptions()`（`table-factory.ts`）默认开 `rowSeriesNumber.dragOrder`；
  三框架的 `EntityTable` 监听 `change_header_position`、经 `collectReorderedIds` 抛出 `rowReordered`，`QueryTable`
  原样透传，但没有任何组件接它。三框架的 `EntityList` 因此经 `tableOptions` 传 `LIST_TABLE_OPTIONS`
  （`dragOrder: false`）关掉了手柄，即 AC#6 的提前交付；直接渲染 `EntityTable` / `QueryTable` 又不传 `tableOptions`
  的调用方仍拿到默认的拖拽手柄，拖完不落库。`patchDragIconForReadonlyRows` 隐藏 `_readonly` 行与 `_isAddRow` 行的手柄，
  但生产代码不设 `_isAddRow`，`EntityList` 的草稿行不带标记、仍有手柄；`EntityList` 按 `deriveEntityCapabilities()` 给
  `canEdit=false` 的已加载行（含系统表）挂 `_readonly`（[US-027](US-027-entity-permission-model.md) 阶段 C），草稿行不挂。
- **排序只存在于树形实体与应用层。** `ISortableTreeEntity`（`@aiao/rxdb-plugin-tree` 的 `tree-entity.interface.ts`：
  `ITreeEntity` 加 `sortOrder?: string | null`）是仓库里唯一的排序类型；`sortOrder` 在 `@aiao/rxdb` 与
  `@aiao/rxdb-model` 中零实现、零读取。三个 demo 应用的树菜单与文件管理页各自调 `@aiao/utils` 的
  `generateKeyBetween` 算排序键（Angular `MenuDragDropService`、React / Vue `useDragDropService` 及各页 store，共 22 个文件），
  「新建追加到末尾」「拖放插到两邻之间」三端各写一遍；`rxdb-test` 的 `MenuSimple` / `MenuLarge` / `FileNode` /
  `FileLarge` 声明 `sortOrder` 并建 `(parentId, sortOrder)` 索引。
- **排序要在树之外独立成模块。** 树实体在 `@aiao/rxdb-plugin-tree`，`RxDBBranch` 是普通实体；排序若只挂在
  `ISortableTreeEntity` 下，扁平列表要排序就得装树插件。依赖方向应是树插件依赖排序模块，而不是反过来；
  排序模块放在核心（见技术笔记「排序模块归属与依赖方向」），[US-025](US-025-core-plugin-extraction.md) 阶段 E 与此没有先后约束。
- 普通实体同样需要手动排序：商品分类的展示优先级、菜单顺序、清单拖拽。按某列分组排序（某分类下的商品、看板列内的卡片）
  与整表排序是同一能力的两种排序域。US-010 的 AC#2/#3 只覆盖了树形节点排序，扁平列表是空白。
- **三端 Todo 列表需要手动排序。** `modules/angular-todo` 的 `TodoPage`（dev-rxdb-angular / electron / tauri 路由共用）、
  React `todo.tsx`、Vue `TodoPage.vue` 都有「全部 / 进行中 / 已完成」三个 tab，经 `useFindAll` 全量加载、虚拟滚动渲染，
  按 `[completed, id desc]` 排、没有拖拽；新建的待办只能出现在最前，用户无法调整先后。进行中与已完成各自一条序列，
  就是以 `completed` 为分组字段的排序域。写入三端一致：新建 `new Todo({ title }).save()`、勾选 `todo.completed = …; save()`，
  「全部完成」与「批量添加」（最多 10,000 条）经 `entityManager.saveMany`。

## 排序契约

首版只承诺一种能力边界，下文未列入的扩展一律明确不支持（见 Out of Scope），不靠 fallback 降级。

### 排序域

- 排序域由实体声明的**分组字段组合**决定：分组字段取值完全相同的行构成一条扁平序列，不同组的键互不相干、可以重复
  （各组各自从 `a0` 起）。**分组字段为空即整表一条序列**——阶段 A 只交付这一种，分组由阶段 D 交付。
- 分组字段是实体自身的标量列（含多对一关系的外键列），非计算、可写、非加密；关系路径、JSON / 数组列、加密列不能作分组字段，
  违反时元数据初始化明确报错。分组字段可以为 NULL：取 NULL 的行同属一组，归组与锚点读取用 `IS NULL`，不用 `= NULL`。
- 树的兄弟域在结构上就是以 `parentId` 为分组字段、根节点为 NULL 组的排序域；树实体迁移到排序模块不在本故事
  （→ [US-031](US-031-tree-sortable-migration.md)）。
- 实体列表上的筛选、关联选择、部分加载都只是排序域的子集，不开放重排；`fixedQuery` 只在恰好钉住一个完整排序域时例外
  （见「UI 启用谓词」）。

### 声明与 schema

- **显式 opt-in**：实体级声明，只有一处来源，子类继承、可覆写；分组字段随可排序声明一并声明。名称与挂载位置在 plan 定，
  两条约束：不叫 `sortable`（属性级 / 关系级已用于列头排序）；若放进 `EntityMetadataFeatures`，须先改其「核心不内置任何具体特性」的约定。
- **字段由开发者显式声明**，引擎不注入：元数据初始化时校验字段存在、类型为 string、可写、非计算字段、非加密（密文不能排序与区间比较）、**不可为 NULL**
  （`nullable` 为假，两端建表即发 `NOT NULL`），违反即抛明确错误。非空由 DDL 保证，契约里因此没有 NULL 键这一类特殊情况。
- 未声明但恰好有 `sortOrder` 字段的实体，行为完全不变。`ISortableEntity` 只是 TS 便利类型（被擦除），不是运行期声明。
- 排序模块导出排序键类型（名称在 plan 定）作为唯一的类型来源：`ISortableEntity` 用它声明非空的 `sortOrder`；
  树侧的 `ISortableTreeEntity` 用同一个键类型组合出 `sortOrder?: <键类型> | null`，树节点的可空性不变（见阶段 C）。

### 键不变量

- 已启用实体的持久化不变量：`sortOrder` 非空（schema 层 `NOT NULL`）、由 `@aiao/utils` **默认字母表**生成的合法键、
  每个排序域内严格递增。`generateKeyBetween(null, null)` 得 `a0`，显式传 `BASE_62_DIGITS` 得 `V0`——禁止混用不同生成配置。
- **比较规则统一为码点字典序（大小写敏感）**：JS 侧保持 `query-matching.utils.ts` 的 `compareOrderValues` 现有 `<` / `>` 比较
  （UTF-16 码元序，默认字母表的键全为 ASCII，与码点序一致），不得换成 `localeCompare`（`a0V < a0l`，`localeCompare` 排反）；
  SQL 侧对排序键使用二进制比较（SQLite 默认 `BINARY`，PGlite `COLLATE "C"`），`ORDER BY` 与 `WHERE` 里的比较（游标边界、
  锚点读取）都要覆盖。初查、活查询增量合并、游标翻页、刷新四条链路同序。键非空，NULL 位置不进入本契约。
- **只读不写**：查询永不写库，不隐式回填，不自动重编号。
- **按锚点校验**：每次创建追加 / 重排只校验它读到的锚点（目标组的末尾行，或目标位置的前后邻居），锚点必须与写入目标同组。
  锚点为空串 / 非法格式，或前后邻居不满足 `prev < next`（含重复键）时，明确报错、零写入。不得依赖
  `generateKeyBetween` 对反向入参的自动交换来「修复」脏序列。被移动行自身的旧键不是锚点——把空串或非法键的行拖进两个合法邻居之间是合法写入。
  `@aiao/utils` 今天没有导出的键校验：`validateOrderKey` 是私有函数，且不校验小数部分的字符是否属于字母表（`getDigitIndex`
  遇到未知字符返回 0），阶段 A 须新增一个导出的完整校验，「非法格式 / 异字母表」都按它判定。
- **历史数据**：给已有实体启用即一次 schema 迁移（列改 `NOT NULL`），存量行必须在迁移里由开发者显式回填
  （按组、按既定顺序 `generateKeysBetween(null, null, n)`）。未回填的迁移被 DDL 拒绝，不存在「未回填但已启用」的中间态。

### 查询默认排序

- 已启用实体的查询，调用方**未给 `orderBy`** 时归一化为 `[分组字段… asc, sortOrder asc, id asc]`（无分组字段即
  `[sortOrder asc, id asc]`）；调用方显式给出的 `orderBy` 原样尊重，不追加、不改写。
- 覆盖 `Repository` 的 `find` / `findAll` / `findOne` / `findOneOrFail` 四个读入口（`count` 不排序，不受影响；
  `findByCursor` 强制显式 `orderBy`，不走默认；`get` 按 id 取单行，不受影响）。四者现状不一：`find` 已归一化 `limit` /
  `offset` 并把同一对象交给 runner 与 `createTask`；`findAll` 原样下发；`findOne` / `findOneOrFail` 原样下发、只在 runner 里加 `limit: 1`。
- 没有现成的单一入口：`QueryManager.createTask` 决定缓存键与活查询合并选项（`QueryTask.options`），但改不了 SQL；SQL 由各读方法的
  runner 生成。归一化做成一个函数、四个读入口显式调用，同一个归一化对象同时交给 runner 与 `createTask`，不能只改适配器参数。
  活查询 `findAll` 的增量合并只在 `options.orderBy` 非空时按 `calculateOrderBy` 重排（`merge_update.ts`），否则只就地改值——
  归一化后的 `orderBy` 不进 task options，拖拽后列表就不换位。
- 三框架 `EntityList` 的 `buildCursorOrderBy()`：`normal` 状态对可排序实体返回同一个默认排序，
  不可排序实体保持 `[id desc]`；列头排序优先，退回 `normal` 恢复手动顺序。
- 分组字段参与排序时沿用该列现有的比较规则与 NULL 位置（NULL 视为最小），码点序的承诺只覆盖 `sortOrder`。

### 创建追加

- 用户创建且缺键时追加到该行所属排序域的末尾（只读本组尾键）。必须覆盖的入口：`Repository.create`、`EntityManager.create`、
  实体 `save()`（新建）、`EntityManager.saveMany` / `mutations` 中的 create、现有级联保存路径中的 create。
- core 没有统一的创建 / 更新边界，可挂的共同点与 US-027 的判定点相同：门面 `Repository.create` / `Repository.update`
  （`EntityManager.create` / `update`、单实体 `save()` 经它们）与 `EntityManager.mutations`（多实体 / 级联 `save()`、`saveMany` 经它）。
  挂在门面层，同步拉取（`mergeChanges`）与 history 回放（`switchBranch`）天然绕过，正合「非用户来源原样写入」；不挂各适配器的
  `rxdb_adapter_mutations`（每个适配器一份，且会拦到插件经执行器发起的写）。`mutations` 路径的补键要写到实体上，让
  `getEntityStatus(entity).patch` 带上它；`Repository.update` 是显式 patch，两条路径实现不同。plan 给出覆盖证明。
- core 写路径上没有 JS 侧非空 / `required` 校验（`validateEntityFieldValue` 只在 rxdb-model 表单里调用），非空只由 DDL 保证，
  补键先于 SQL 生成即先于非空校验。
- 同批缺键记录按组拆分，每组按批内顺序一次 `generateKeysBetween(该组尾键, null, 该组条数)`，互不碰撞；不得用全局共享默认值。
- 显式传入合法键原样保留；显式传入非法键明确报错。
- 非用户来源（同步拉取、恢复、history 回放）原样写入，不分配、不改写已有键。带入 NULL 时由 `NOT NULL` 约束当场拒绝该次写入
  （拉取写入当场失败，不延后到下一次锚点写入；失败粒度随该同步路径的事务边界，plan 写实）；带入空串 / 非法键时，在下一次以它为锚点的写入时按「按锚点校验」报错。

### 分组字段变更

- 改分组字段即离开原排序域，旧键在新组里没有意义，还可能与新组已有键重复。用户写入改了任一分组字段、且同一次写入没有显式改写
  `sortOrder` 时，在同一个主适配器事务内把该行追加到新组末尾；同一次写入显式给出的合法键原样保留，非法键明确报错。
  「显式改写」以该次写入的变更集（patch）是否含 `sortOrder` 为准。
- 同批多行改分组字段（如 Todo 的「全部完成」经 `saveMany`）按新组拆分，每组按批内顺序一次
  `generateKeysBetween(新组尾键, null, 该组条数)`，与「创建追加」的同批规则一致。
- 必须覆盖的入口：`Repository.update`、实体 `save()`（已有行）、`EntityManager.saveMany` / `mutations` 中的 update、
  现有级联保存路径中的 update。规范化位置与覆盖证明由 plan 给出，与「创建追加」共用同一边界。
- 原组剩下的行不改写：移出一行不破坏组内递增。
- 非用户来源原样写入，不重新分配键，同「创建追加」。

### 写边界与并发

- 读锚点 → 算键 → 写入在**同一个主适配器 transaction** 内完成（`RxDBAdapterLocalBase.transaction` 经 `TransactionExecutor`）。
  同一排序域两次本地并发追加不得读到同一旧尾键；plan 须证明适配器事务对并发写者（含受支持的同库多实例）串行化，不能用组件私有锁代替。
- 现状只有 `mutations` 满足：`RxDBAdapterSqliteBase.mutations` / `RxDBAdapterPGlite.mutations` 已在 transaction 内执行。门面
  `Repository.create` / `update` 走适配器仓库，SQL 在事务外生成、再由 `writeQuery` 为单条语句开事务；`primary$` 只给出
  `IRepository`，`transaction` 也不在 `IRxDBAdapter` 上。可排序实体的门面写入因此须改走主适配器事务，通道由 plan 定。
  两个适配器各有一个并发度 1 的 `AsyncQueueExecutor`，单实例内串行；SQLite 同库多连接的冲突写以 BUSY 失败，不产生重复键（推断，未实测）。
- 首版只支持主适配器能在单个事务内读写的本地后端（SQLite-core 系、PGlite）。remote-only 与 QueryCache 主端的缺键创建、
  重排明确报错，不拿本地缓存子集冒充完整序列。
- 本故事不涉及 CRDT 或离线冲突合并，只保证本地受支持写边界内的确定性。

### 重排写入

- **输入是移动意图，不是最终排列**：移动行 ID + 目标位置。目标位置两种形式：前后邻居 ID（组首 / 组尾时一侧为空，
  目标组由邻居所在组决定）；或「追加到某组末尾」（给目标组的分组字段取值，不给邻居，目标组为空时得 `a0`）。
  目标组与移动行当前组不同即**跨组移动**；后一种形式承载「拖进某个分类 / 节点内部」。两侧邻居都为空时必须用后一种形式。
- UI 来源是 VTable `change_header_position` 的 `source` / `target`，只产生组内移动。VTable 在派发事件前已调用
  `changeRecordOrder`，事件到达时被移动记录在 `target.row`，邻居取 `target.row ± 1`（行号含表头行）；原位放下不派发事件。`rowReordered: string[]` 与
  `collectReorderedIds` 保持原签名、原行为；阶段 B 在三框架 `EntityTable` / `QueryTable` 上新增一个不破坏兼容的移动上下文输出，
  名称在 plan 定，三端同 API。
- **写集合最小**：组内移动只写 `sortOrder`；跨组移动在同一事务内只写分组字段与 `sortOrder`；原位拖拽零写；
  只支持单行（VTable 行序号拖拽本身是单行），多行移动不支持。
- **事务内复核**：移动行仍存在；两邻居仍存在、同属目标组且仍相邻（之间没有其他行）；任一不成立即拒绝、零写、重查。
- **权限在开事务前判定**：重排 API 是新增的公开写入口，但读邻居与写入都在主适配器事务内经执行器完成，属
  US-027 不判定的那一层，不会被门面 `update()` 的判定自动覆盖。重排 API 必须在开事务前调用
  `assertEntityOperationAllowed(EntityType, 'update')`：`update: 'system'` 的实体当场抛 `PermissionDeniedError`、零写。
- 只提交上述字段的 update，写日志、同步与普通 update 一致，不得借 `saveMany`
  把该实例其他未提交字段或关系一并保存。单行写入天然原子；失败时抛出错误，不吞。
- 启用 `@aiao/rxdb-plugin-history` 的实体，一次拖拽在 history 里是一项（改走带日志的事务后该项 `type` 为 `'TRANSACTION'`
  而非 `'UPDATE'`，单条 change 仍是更新），撤销粒度沿用现有 history，本故事不新建撤销边界。撤销 / 重做经 `switchBranch` 原样回放，
  不经补键与锚点校验：仓库 / 数据库作用域的撤销后进先出，回到的是曾经存在的一致状态；单记录作用域（`history(record)`）
  越过其他记录的较新追加去撤一次排序写，可能还原出与较新追加相同的键（推断：`generateKeyBetween` 是确定性的），
  由下一次以它为锚点的写入按「按锚点校验」报错。

### UI 启用谓词

判定逻辑放在 `@aiao/rxdb-model`，三框架只做适配、不复制算法。手柄开启当且仅当以下全部成立：

1. 实体已声明可排序；
2. 主键为 string（UI 域；core 对 `string | number | bigint` 主键都成立，UI 不做 `String(id)` 折叠）；
3. 排序状态为 `normal`；
4. 无用户筛选（`filterQuery`，三端是组件内部状态而非输入）、非关联选择模式（`mode: 'select'`）；`fixedQuery` 恰好钉住一个
   完整排序域——无分组字段的实体要求没有 `fixedQuery`，有分组字段的实体要求 `fixedQuery` 只由全部分组字段的等值条件组成
   （NULL 组为 `operator: 'null'`），不含其他条件；一对多关联详情的 `buildFixedQuery` 产出 `[{ field: 外键, operator: '=' }]`，正是这一形状；
5. 数据已完整加载（已确认 `hasMore = false`；虚拟渲染本身不算不完整）。三端 `EntityList` 今天不读 `hasMore`，可从
   `InfiniteScrollingList.hasMore` / `resource.hasMore` / `useInfiniteScroll().hasMore` 取；`hasMore` 按「收满一页」判定，
   总数恰为页大小整数倍时要再触发一次空的 `loadMore` 才转 `false`，活查询重发也可能把它翻回 `true`，plan 写实；
6. 列表内无 `_readonly` 行、无草稿 / 新增行、无待提交编辑。草稿行不带 `_isAddRow`，须直接读草稿列表；「待提交编辑」今天没有
   可读状态（`#pendingChanges` 只活到下一个微任务，`mutations` 在途也无人跟踪），阶段 B 新增；
7. 没有挂起中的重排。

任一不满足时关闭 `dragOrder`，程序化触发同样拒绝、零写入。手柄隐藏只是视觉守卫，写入侧仍按上述条件拒绝。
三端 `tableOptions` 只在建表时读一次（`createListTable`），之后不再应用，而谓词随运行期状态变化，开关须另走动态机制
（`updateOption`、重建表，或类似 `patchDragIconForReadonlyRows` 的 `getIcons` 门控），plan 定。
重排挂起期间拒绝新的拖拽（不排队）；成功后按 DB 重查结果刷新，失败后重查恢复到最新已提交顺序、清忙碌态、展示错误，下一次拖拽可用。
VTable 派发事件前已改了内部记录顺序；拒绝 / 失败零写时活查询不重发、记录引用不变，`setRecords` 被跳过，表格会停在拖后的顺序——
恢复必须显式重置表格记录，不能只靠重查。UI 不做跨组拖拽：跨组移动只经 core 重排 API。

## 交付阶段

| 阶段 | 交付                                                                                                                                                                                | 直接前置                   | AC 区段           | 状态 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------- | ---- |
| A    | core 排序语义（整表排序域）：显式声明与元数据校验、查询默认排序归一化、创建追加、单行重排 API、导出的键校验、键不变量与事务写边界（门面写入改走主适配器事务）、SQLite / PGlite 同序 | 无                         | AC#1～4、#11、#12 | ✅   |
| B    | 三框架 `EntityList` 拖放持久化：移动上下文输出、UI 启用谓词、`normal` 排序接线、挂起 / 失败状态；三端 e2e 同交                                                                      | 阶段 A（AC#17 另需阶段 D） | AC#5～7、#17      | ✅   |
| C    | 树兼容：`ISortableTreeEntity` 由排序模块的类型组合而成，依赖方向测试；树运行期行为不变                                                                                              | 阶段 A                     | AC#8～9           | ✅   |
| D    | 分组排序域：分组字段声明与校验、NULL 组、组内锚点与按组创建追加、默认排序带分组字段、跨组移动（含追加到目标组末尾）、改分组字段的用户写入追加到新组末尾                             | 阶段 A                     | AC#13～16         | ✅   |
| E    | 三端 Todo 手动排序：可排序待办实体（按 `completed` 分组）、新建追加、勾选完成 / 全部完成追加到另一组末尾、单组 tab 内（虚拟滚动）拖拽重排；三端 e2e 同交                            | 阶段 A + D                 | AC#18～19         | ✅   |

AC#10（未声明可排序的实体行为不变）每个阶段都要守住。B、C、D 都只依赖 A，可以并行；E 依赖 A + D。
驱动场景（三端 Todo）的路径是 A → D → E，B 与 C 不在这条路径上，排在 E 之后不影响驱动场景交付。B 的谓词按通用形式实现
（无分组字段时「钉住全部分组字段」即「没有 `fixedQuery`」），但分组列表的 AC#17 要等 D 交付才能验收，B 以 D 交付为关闭前提。

五个阶段均已交付。阶段 B 落地时三框架 `EntityList` 建表统一打开 `dragOrder`，手柄改由 UI 启用谓词经 `getIcons` 门控运行时开关（`setRowDragEnabled`），不再靠 `tableOptions` 静态关闭。

## 范围边界

### In Scope

- 普通（非树）实体的显式可排序声明、字段校验与 `sortOrder` 键不变量
- 排序域：整表一条序列，或按实体自身标量列（含外键列）分组，NULL 组
- core 排序模块（与树无关）：基于 `@aiao/utils` fractional indexing 的键计算、查询默认排序、按组创建追加、单行重排（含跨组移动）、
  改分组字段的用户写入追加到新组末尾
- SQLite-core 系与 PGlite 上排序键的比较规则统一（码点序）；可排序字段的非空约束
- rxdb-model 三框架 `EntityList` 的拖放持久化接线与 UI 启用谓词（含钉住单组的分组列表）
- `ISortableTreeEntity` 改由排序模块的类型组合，旧引用不破坏
- 三端 Todo 页的手动排序（`modules/angular-todo` / React / Vue），以独立的可排序待办实体承载

### Out of Scope

- 共享 `Todo` 实体（`rxdb-test`）的 schema 与行为；`dev-rxdb-supabase` 与 `examples/angular-todo` 的 todo 页、远端 `todos` 表；三端 todo-cursor 页；Todo「全部」tab 内拖拽
- 树实体迁移到排序模块（`sortOrder` 改非空、按 `parentId` 回填）与三个 demo 应用树拖放服务改用排序模块（→ [US-031](US-031-tree-sortable-migration.md)）
- `@aiao/rxdb-plugin-tree` 自身的树能力与树实体运行期行为（环检测、深度、懒加载）；本故事只改 `ISortableTreeEntity` 的类型来源
- 关系路径、JSON / 数组列、加密列作分组字段；string / enum 分组列在两端的同序未进契约套件验收（PGlite 侧已显式 `COLLATE "C"`，见「分组字段的比较规则」）
- UI 跨组拖拽（看板跨列拖拽）；跨组移动只提供 core API
- 筛选 / 未恰好钉住单组的 `fixedQuery` / 关联选择 / 部分加载列表内的重排，及跨页排序
- 含只读行的列表内重排、多行拖拽、非字符串主键实体的 UI 重排
- 存量数据的隐式回填、自动重编号、键长上限
- remote-only 与 QueryCache 主端的创建追加与重排
- 实体操作权限模型本身（→ [US-027](US-027-entity-permission-model.md)）；重排 API 接入其判定原语属本故事（见「重排写入」）
- 多设备离线重排的冲突合并（归 vision 阶段 3 协作）
- sortOrder 的数据库索引 / 查询性能优化（性能单列）

## 验收标准

| #   | 前置条件                                                                                                                                                       | 操作                                                                                                                                                                                                            | 预期结果                                                                                                                                                                                                                                                                                                                                                                                                     | 状态 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 普通实体显式声明可排序（无分组字段）；数据的 `id` 顺序与 `sortOrder` 相反                                                                                      | 元数据初始化；不带 `orderBy` 与带显式 `orderBy` 查询                                                                                                                                                            | 字段缺失 / 非 string / 计算字段 / 不可写 / `nullable: true` 在初始化时明确报错；`find` / `findAll` / `findOne` / `findOneOrFail` 不带 `orderBy` 按 `[sortOrder asc, id asc]`，带则原样；两种查询缓存键隔离，活查询增量合并与初查同序                                                                                                                                                                         | ✅   |
| 2   | 同上，创建时未提供 sortOrder                                                                                                                                   | 依次经「创建追加」列出的每个入口创建；同批创建 n 条；显式传合法 / 非法键；同步拉取写入                                                                                                                          | 缺键追加到末尾；同批 n 条按批内顺序、互不碰撞；合法键原样保留，非法键明确报错；同步写入不分配、不改写键                                                                                                                                                                                                                                                                                                      | ✅   |
| 3   | 已回填的可排序序列；另有声明 `update: 'system'` 的可排序实体                                                                                                   | 经 core 重排 API 把一行移到首、尾、前移、后移、原位；移动前删除该行或在两邻之间插入新行；对后者调用重排 API                                                                                                     | 只有移动行的 `sortOrder` 一个字段被写，新键落在两邻之间；原位零写；移动行已删除或邻居不再相邻时拒绝、零写；后者在开事务前抛 `PermissionDeniedError`（指名实体与 `update`）、零写                                                                                                                                                                                                                             | ✅   |
| 4   | 同一序列                                                                                                                                                       | 固定种子性质测试；同一间隙两个方向（贴下界、贴上界）各连续最坏插入 1,000 次；用异步屏障固定两次并发追加的读写交错                                                                                               | 键始终合法且严格递增；1,000 次最坏插入后键长贴下界 169、贴上界 202（实测预算，本故事只承诺已测预算）；两次并发追加不碰撞；全程无重编号                                                                                                                                                                                                                                                                       | ✅   |
| 5   | 三框架 `EntityList`，可排序实体，满足 UI 启用谓词                                                                                                              | 真实拖拽一行 → DB 重查 → 刷新页面；切到列头排序再退回 `normal`；挂起中再拖；注入写失败                                                                                                                          | 顺序持久化且刷新后保持；列头排序优先，退回后恢复手动顺序；挂起期间拒绝新拖拽；失败后恢复到最新已提交顺序并展示错误，下一次拖拽可用                                                                                                                                                                                                                                                                           | ✅   |
| 6   | 三框架实体列表，UI 启用谓词不成立                                                                                                                              | 打开列表；程序化触发移动事件                                                                                                                                                                                    | 不可排序实体、非字符串主键、列头排序、有筛选 / 未恰好钉住单组的 `fixedQuery` / 关联选择、未完整加载、含草稿或待提交编辑，均不显示手柄；强制事件零写入，草稿与原编辑状态保留                                                                                                                                                                                                                                  | ✅   |
| 7   | 可排序实体声明 `update: 'system'`（`EntityList` 整表挂 `_readonly`）                                                                                           | 打开列表；程序化触发移动事件                                                                                                                                                                                    | 整表不开拖拽手柄；强制事件零写入；只读行 `sortOrder` 逐字不变                                                                                                                                                                                                                                                                                                                                                | ✅   |
| 8   | 树形实体（含 `ISortableTreeEntity` 引用）                                                                                                                      | 类型检查；跑现有树测试与三端 demo 树拖放                                                                                                                                                                        | 旧引用编译通过；树查询、创建与 demo 拖放行为不变；树实体不因类型继承自动获得可排序声明；两个父节点下各自从 `a0` 开始的数据不受影响                                                                                                                                                                                                                                                                           | ✅   |
| 9   | `@aiao/rxdb-plugin-tree` 与排序模块                                                                                                                            | 类型检查 + 依赖分析                                                                                                                                                                                             | 排序键类型只在排序模块声明一处，`ISortableTreeEntity` 由它组合而成且 `sortOrder` 保持 `?: … \| null`；排序模块不 import 树插件（依赖方向：tree → sortable）                                                                                                                                                                                                                                                  | ✅   |
| 10  | 未声明可排序的现有实体（含恰好有 `sortOrder` 字段的）                                                                                                          | 原有查询、写入与 UI 操作                                                                                                                                                                                        | schema、查询顺序、写入、列头排序、`rowReordered` 签名均不变（拖拽手柄已按 AC#6 关闭）                                                                                                                                                                                                                                                                                                                        | ✅   |
| 11  | 可排序序列含空串 / 非法 / 重复 / 异字母表键；另有带 NULL 键的同步拉取                                                                                          | 查询与游标翻页；以这些行为锚点创建追加或重排；把空串键行拖进两个合法邻居之间；同步写入 NULL 键                                                                                                                  | 查询不写库；锚点违反不变量时明确报错、零写；空串键行移入合法邻居之间成功；NULL 键写入被 `NOT NULL` 拒绝；同一数据在 SQLite 与 PGlite 的初查、增量合并、游标翻页、刷新结果一致（码点序）                                                                                                                                                                                                                      | ✅   |
| 12  | 可排序实体的主适配器为 remote-only 或 QueryCache                                                                                                               | 缺键创建；调用重排 API                                                                                                                                                                                          | 明确报错，不读本地缓存子集算键                                                                                                                                                                                                                                                                                                                                                                               | ✅   |
| 13  | 可排序实体声明分组字段（可空的外键列）；数据分布在 3 个组含 NULL 组，各组键都从 `a0` 起                                                                        | 元数据初始化；不带 `orderBy` 查询；带分组字段等值条件（含 `IS NULL`）查询                                                                                                                                       | 分组字段缺失 / 计算 / 不可写 / 关系路径 / JSON 或数组列 / 加密列在初始化时明确报错；不带 `orderBy` 按 `[分组字段 asc, sortOrder asc, id asc]`，NULL 组整体在最前；组间重复键不报错；按组查询的初查与活查询增量合并同序，SQLite 与 PGlite 一致                                                                                                                                                                | ✅   |
| 14  | 同上，创建时未提供 sortOrder                                                                                                                                   | 向普通组、NULL 组、空组各创建；同批 n 条跨 3 组混排创建；用异步屏障固定两次向同一组并发追加                                                                                                                     | 各自追加到本组末尾、只读本组尾键（空组得 `a0`）；同批按组拆分、组内按批内顺序互不碰撞；同组并发追加不碰撞；其他组的键不变                                                                                                                                                                                                                                                                                    | ✅   |
| 15  | 已回填的分组序列；另有声明 `update: 'system'` 的分组实体                                                                                                       | 经重排 API：组内移动；跨组移到目标组两邻之间；跨组追加到目标组末尾（含目标组为空、目标为 NULL 组）；邻居不属同一目标组或不再相邻；移动前删除该行；对后者调用重排 API                                            | 组内移动只写 `sortOrder`；跨组移动在一个事务内只写分组字段与 `sortOrder`，新键落在目标组两邻之间或尾键之后，原组剩余行不改写；邻居不同组 / 不相邻 / 移动行已删除时拒绝、零写；后者在开事务前抛 `PermissionDeniedError`、零写                                                                                                                                                                                 | ✅   |
| 16  | 同上                                                                                                                                                           | 经「分组字段变更」列出的每个入口只改分组字段；同批 n 条改到同一新组（`saveMany`）；同一次写入另给合法 / 非法键；同步拉取写入改了分组字段的行                                                                    | 未显式给键的行在同一事务内追加到新组末尾，同批按批内顺序互不碰撞；合法键原样保留，非法键明确报错；同步写入原样落库、不改写键                                                                                                                                                                                                                                                                                 | ✅   |
| 17  | 三框架 `EntityList`，分组实体，`fixedQuery` 恰好钉住一个组（含 NULL 组），满足其余谓词                                                                         | 真实拖拽一行 → DB 重查 → 刷新页面；把 `fixedQuery` 改成只钉部分分组字段 / 另加分组字段外的条件 / 去掉，再程序化触发移动事件                                                                                     | 钉住单组时显示手柄，顺序持久化且只写移动行的 `sortOrder`；后三种不显示手柄，强制事件零写入                                                                                                                                                                                                                                                                                                                   | ✅   |
| 18  | 三端 Todo 页改用可排序待办实体（分组字段 `completed`，非空），数据经 `useFindAll` 完整加载、虚拟滚动渲染                                                       | 新建 3 条；「进行中」tab 把末条拖到首位 → DB 重查 → 刷新页面；撤销该次拖拽；批量添加 100 条后把首条拖到视口外的位置；勾选其中一条完成；「全部完成」；「已完成」tab 内拖拽；切到「全部」tab 并切换完成态排序方向 | 新建追加到进行中组末尾；拖拽只写移动行的 `sortOrder`，刷新后顺序保持；撤销恢复拖拽前的顺序与键；视口外拖拽同样落在目标位置；勾选完成的行在同一事务内追加到已完成组末尾，进行中组其余行顺序与键不变；「全部完成」按批内顺序追加、互不碰撞；已完成 tab 拖拽同样持久化；「全部」tab 按 `[completed（所选方向）, sortOrder asc, id asc]` 显示两组、不显示拖拽手柄；三端行为一致（Playwright 真实拖拽后 DB 重查） | ✅   |
| 19  | 现有 `Todo` 消费方：各包测试、benchmarks、三端 todo-cursor 页与 workspace 页、`dev-rxdb-supabase` 与 `examples/angular-todo` 的 todo 页；electron / tauri 宿主 | 运行现有测试与 e2e；构建 electron / tauri                                                                                                                                                                       | 全部通过（三端 `working-tree` e2e 经 `/todo` 写入，按新实体表名改断言后通过）；electron / tauri 五个 setup 注册新实体后构建与类型检查通过；`Todo` 的 schema、默认查询顺序与写入行为不变；`docker/sql` 的远端 `todos` 表结构不变                                                                                                                                                                              | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

AC#6 的关闭：提前交付时只有传参单测；阶段 B 改为谓词驱动后，三端 `entity-list.real.spec` 用真实组件验谓词不成立时
不开手柄、强制事件零写入并恢复原顺序，三端 `entity-list-sort.spec.ts` 用 Playwright 在 canvas 上验「未钉住排序域」时没有手柄、
程序拖放刷新后顺序不变。谓词的逐条分支（非字符串主键、关联选择、未完整加载、草稿等）由 `manual-order-list.spec.ts` 单测覆盖。

AC#10 的关闭：阶段 A 一侧已验——未声明 `manualOrder` 的实体（含恰好有 `sortOrder` 字段的）元数据不变、查询不归一化、
创建不追加、PGlite 的同名字段不加 `COLLATE "C"`；UI 侧由三端 `entity-list.real.spec`「列头排序驱动 cursor orderBy 重查（默认 id desc…）」
与三端 entity-table / query-table real spec 的 `rowReordered` 用例守住，阶段 C / E 的树与 `Todo` 测试照常通过。

阶段 B 顺带修了一个既有缺陷：三端 `sort_click` 回调返回 `false` 阻止 VTable 客户端排序，同时也阻止了它记录 `sortState`，
列头图标停在 `sort_normal`、每次点击都发 `asc`，`desc` 与回到 `normal` 都到不了。现由 `syncHeaderSortIcon`
（`updateSortState(state, false)`，只同步图标、不在客户端重排）补记，三端 entity-table real spec 断言 `sortState`。

阶段 A 的证据（SQLite 与 PGlite 两个 runner 跑同一套跨适配器契约套件，顺序断言都对照 JS `<` 算出的码点序期望）：

| AC  | 测试                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/rxdb/src/__tests__/sortable/manual-order-metadata.spec.ts`（声明校验）、`manual-order-repository.spec.ts`「AC#1 读归一化」、契约套件「活查询增量合并」            |
| 2   | `manual-order-repository.spec.ts`「AC#2 缺键创建追加」「AC#2 显式键先校验」、契约套件「创建追加」                                                                           |
| 3   | `manual-order-repository.spec.ts`「AC#3 reorder()」（含 `PermissionDeniedError`）、契约套件「重排」                                                                         |
| 4   | `packages/utils/src/__tests__/indexing/fractional-indexing.spec.ts`（性质测试、贴下界 169 / 贴上界 202 预算）、契约套件「异步屏障…并发追加」                                |
| 10  | `manual-order-metadata.spec.ts`、`manual-order-repository.spec.ts` 的普通实体用例、`packages/rxdb-adapter-pglite/src/__tests__/query/manual-order-collate.spec.ts`（AC#10） |
| 11  | 契约套件「码点序」「脏序列」（`packages/rxdb-test/src/sortable/manual-order.suite.ts`，两个 runner 各 12 条）                                                               |
| 12  | `packages/rxdb/src/__tests__/sortable/manual-order-primary.spec.ts`                                                                                                         |

阶段 D 的证据（core 单测在 `packages/rxdb/src/__tests__/sortable/`；契约套件分组用例在
`packages/rxdb-test/src/sortable/manual-order-group.suite.ts`，SQLite 与 PGlite 两个 runner 各 23 条全过）：

| AC  | 测试                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | `manual-order-group-metadata.spec.ts`（分组声明校验含缺失 / 计算 / 不可写 / 关系路径 / JSON 或数组 / 加密列、继承、默认排序归一化）、`manual-order-group.spec.ts`「AC#13 分组实体的读归一化」、契约套件「分组：可空外键 listId」的默认排序与按组等值（含 `IS NULL`）初查 + 活查询增量合并、`manual-order-collate.spec.ts`（PGlite 分组字段 `COLLATE "C"`） |
| 14  | `manual-order-group.spec.ts`「AC#14 按组创建追加」、契约套件「缺键创建追加到本组末尾…」「异步屏障把同组两次并发追加挤到一起…」                                                                                                                                                                                                                             |
| 15  | `manual-order-group.spec.ts`「AC#15 分组实体的 reorder()」（含 `staleTarget` / `notFound` / `PermissionDeniedError`）、契约套件「组内移动…跨组移到两邻之间…」「跨组追加到目标组末尾…」「邻居不同组报 staleTarget…」                                                                                                                                        |
| 16  | `manual-order-group.spec.ts`「AC#16 改分组字段的用户写入追加到新组末尾」、`manual-order-primary.spec.ts`（remote-only / QueryCache 主端改组缺键报 `unsupportedPrimary`、零写）、契约套件「分组：boolean completed…」（含 `mergeChanges` 原样落库）                                                                                                         |

阶段 B 的证据（三端用例同名；real spec 用真实组件 + 内存 RxDB，e2e 用 Playwright 在 canvas 场景树上取手柄坐标真实拖拽，刷新后再读）：

| AC  | 测试                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | 三端 `entity-list.real.spec`「手动排序（US-028 阶段 B）」：拖放按界面邻居落库、列头排序收起手柄 / 回到 `normal` 恢复、重排落库中拒绝新的拖放（不排队）、落库失败恢复原顺序并展示错误；`manual-order-list.spec.ts`「commitRowMove」；三端 `entity-list-sort.spec.ts`「钉住单组时显示手柄，拖动后顺序落库，按列排序时手柄收起」 |
| 6   | `manual-order-list.spec.ts`「canReorderEntityList」「pinsSingleOrderDomain」；三端 real spec「分组排序实体没有钉住单组时不显示手柄…」「有未完成的行内编辑时收起手柄…」；三端 `entity-list-sort.spec.ts`「未钉住排序域时没有手柄，程序拖放零写入并恢复原顺序」                                                                 |
| 7   | 三端 real spec「AC#7 update: system 的可排序实体整表不开手柄，强制拖放零写入、sortOrder 不变」                                                                                                                                                                                                                                |
| 17  | 三端 `entity-list-sort.spec.ts`（`Task` 钉住 `completed = false` 一组，拖动、刷新、未钉住时零写入）；`manual-order-list.spec.ts`「分组排序：缺字段、多余规则、重复字段、非等值、嵌套组或 or 组合都不算」；三端 demo 实体列表页的 `fixedQuery` 透传构造测试                                                                    |

阶段 C 的证据：`packages/rxdb-plugin-tree/src/__tests__/contracts/sortable-type-source.spec.ts`（AC#9 类型由核心
`SortOrderKey` 组合、核心不 import 树插件；AC#8 树实体不因实现 `ISortableTreeEntity` 获得手动排序声明），以及树插件现有单测与
三端 demo 树拖放 e2e（`menu-drag-sort` / `tree-menu-drag-drop`）照常通过。

阶段 E 的证据：

| AC  | 测试                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18  | 三端 `todo-sort.spec.ts`（4 条：「全部」页无手柄与进行中页拖动落库 + 撤销 / 重做、完成追加到已完成组末尾与「全部」页排序方向、全选按当前顺序追加、贴视口下沿自动滚动落到视口外）；`packages/utils/src/__tests__/@browser/fixed-row-drag.spec.ts`；三端 todo 页单测；`task-model.spec.ts` |
| 19  | `published-model-invariants.spec.ts`、`task-model.spec.ts`「共享 Todo 不变」；三端 `working-tree.spec.ts`（新表名 `tasks`）；electron / tauri 两个宿主 lint、typecheck、build 通过；全量单测与 e2e                                                                                       |

覆盖率按仓库规则：core 及核心框架包 ≥90%，其他受影响 packages ≥80%。AC#5～7、#17、#18 的三端验收必须是真实组件 + Playwright
拖拽后 DB 重查，不只断言 `dragOrder` 选项。

## 技术笔记

**关键设计决策**：

- **可排序声明 surface**：已定为显式 opt-in + 开发者显式声明字段（见「声明与 schema」）。识别 `sortOrder` 字段自动启用
  会破坏 AC#10，已否决。显式声明**不宜叫 `sortable`**：`sortable?: boolean` 已是属性级与关系级的标志
  （`property-types.interface.ts` 的 `ISortable`、`relation-types.interface.ts`，含义是列头可排序，`entity-field.utils.ts`
  按它输出字段元数据），实体级再叫 `sortable` 就同名异义。`EntityMetadataFeatures`（`entity-options.interface.ts`）
  是插件挂特性的落点，其 TSDoc 写明核心不内置任何具体特性，core 的排序声明要放进 `features`，得先改这条约定。
- **排序域用分组字段表达**：整表与分组是同一套语义，差别只在锚点读取多带一组等值条件。分组字段声明为空时
  条件为空，阶段 A 的实现就是阶段 D 的特例；阶段 D 不另起一套键计算，只把「读尾键 / 读邻居 / 默认排序」参数化到分组条件上。
- **NULL 组**：SQL 的 `= NULL` 永不成立，NULL 组的尾键与邻居必须用 `IS NULL` 读；`Repository.ts` 的模块级函数
  `_generate_cursor_rule_group`（经 `_cursor_equal_rule` / `_cursor_boundary_rule`）已有把 NULL 展开成 `IS NULL` / `IS NOT NULL`
  分支的先例。默认排序里分组字段的 NULL 位置沿用现有规则（NULL 视为最小）：PGlite `nulls_order` 对可空列补 NULLS 子句，
  外键列不在 `propertyMap` 里、无论是否可空一律补，结果同样是 NULL 最小。
- **分组字段的比较规则**：码点序对 `sortOrder` 承诺。PGlite 以 `--locale=C.UTF-8` 初始化、适配器不覆盖，很可能已是字节序
  （推断，未实测）；阶段 D 不靠这条推断，手动排序实体的 string / enum 分组字段（varchar 落盘）与 `sortOrder` 一样在
  ORDER BY 与区间比较上显式 `COLLATE "C"`，等值比较不加；uuid、boolean、外键列与经关系别名引用的字段不加
  （`manual-order-collate.spec.ts` 断言生成的 SQL）。这比评审时的口径多走了一步：两端 string 分组列同序的**契约验收**仍在
  Out of Scope，AC#13 用外键（UUID）分组列验收。boolean 分组列（Todo 的 `completed`）两端同序：SQLite 存 `INTEGER` 带
  `CHECK in(0,1)`，PGlite 原生 `boolean`，`false` 都在前，JS `false < true` 一致（契约套件 AC#16 用例已验）。
- **加密列不能作排序字段**：`rxdb-adapter-encrypted` 在运行期拒绝对加密列过滤与排序（`where_on_encrypted` /
  `order_on_encrypted`），`sortOrder` 与分组字段要读尾键、比邻居、进默认排序，声明为 `encrypted` 时在元数据初始化即报
  `invalidManualOrder`，不等到查询时才失败。
- **分组字段变更与跨组移动是两条路**：普通 update 改分组字段只能「追加到新组末尾」，因为它没有目标位置信息；
  要落到新组的指定位置，走重排 API 的跨组移动。两者都在同一主适配器事务内读新组锚点。
- **列表默认排序的现状**：三框架 `buildCursorOrderBy()` 的 `normal` 状态返回 `[id desc]`，并作为**显式** `orderBy`
  传给 `Repository.findByCursor`（要求末尾为 `id`）。core 的默认排序归一化碰不到这条路径，所以 `EntityList` 必须单独接线（AC#5）。
- **只读行与移动意图**：`collectReorderedIds` 跳过 `_readonly` 与 `_isAddRow`，且只收 `typeof id === 'string'`。
  序列 `[A, R, B]`（R 只读）里「B 拖到 A 前」与「A 拖到 B 后」给出同一个载荷 `[B, A]`，只读锚点信息丢失；
  最终排列也推不出唯一的最小写集合。这就是首版改用 VTable `source` / `target` 移动意图、并对含只读行的列表整表关手柄的原因。
- **事务能力部分已有**：`EntityManager.mutations` 路由到主适配器，`RxDBAdapterSqliteBase.mutations` 与
  `RxDBAdapterPGlite.mutations` 已经在 transaction 内执行批量变更，core 可在其外包一层「读尾键 → `executor.mutations`」；
  门面 `Repository.create` / `update` 不在可读锚点的事务里，须改走 `RxDBAdapterLocalBase.transaction`（见「写边界与并发」）。
  三端 `EntityList` 的 `#flushPending`（React / Vue 同构）保存旧值并在失败时回滚内存。本故事复用适配器事务，不新建事务机制。
- **为什么强制非空**：fractional-indexing 的键是字符串，NULL 不是合法键，以 NULL 行做锚点生成不出新键；
  `nullable: false` 让 DDL 直接挡住同步拉取的 NULL 键（场景 11），锚点校验不必再处理 NULL。`build_order_by` 两端都不补
  collation 策略。fractional-indexing 上游要求大小写敏感排序、提醒 `localeCompare` 会排错；PostgreSQL collation 会影响字符串排序，`C` 使用字符编码顺序。
- **权限**：[US-027](US-027-entity-permission-model.md) 的判定只挂在门面 `Repository` 的 `create()` / `update()` / `remove()`
  与 `EntityManager.mutations()` 上，适配器 / 执行器层不判定。重排要在同一主适配器事务内复核邻居再写，走的是执行器，
  所以重排 API 显式调用 `assertEntityOperationAllowed(EntityType, 'update')`（AC#3、#15）。创建追加与分组字段变更只在既有
  写入口内部补键，不新增写入口，权限沿用这些入口已有的判定。UI 侧：`EntityList` 按 `deriveEntityCapabilities()` 的 `canEdit`
  整表挂 `_readonly`，`update: 'system'` 的可排序实体因此所有行只读、不开手柄（AC#7）。
- **现有资产复用**：`table-factory.ts` 的 `dragOrder: true`、三框架 `EntityTable` / `QueryTable` 的 `rowReordered` 与
  `tableOptions`、`patchDragIconForReadonlyRows` 与 `collectReorderedIds` 均已有单测，接线时不动其 API。
  `buildTableOptions()` 对 `rowSeriesNumber` 是整体覆盖，关 `dragOrder` 时 `title` / `width` 要一并带上。
- **排序模块归属与依赖方向**：本故事定为 core——查询默认排序与 create 追加键都在引擎写路径上。
  `@aiao/rxdb-plugin-tree` 依赖 `@aiao/rxdb`，core 反向 import 树插件会被 nx 项目图判成环，AC#9 的依赖方向因此有现成门禁。
- **Todo 接入不改共享 `Todo`**：`rxdb-test` 的 `Todo` 被约 17 个项目、约 124 个文件引用（六个 dev 应用、`modules/angular-todo`、
  `examples/angular-todo`、benchmarks、pglite / sqlite-core / sqlite-wasm / supabase 适配器测试、三端 rxdb-model）；`dev-rxdb-supabase`
  以 `SyncType.Full` 同步它，`docker/sql/03-business-tables.sql` 的远端 `todos` 表没有 `sortOrder` 列。直接给它声明可排序会让
  supabase 同步的远端表缺列、让所有不带 `orderBy` 的查询改序，所以阶段 E 用独立的可排序待办实体（名称与放置位置在 plan 定），
  三端 todo 页改用它；todo-cursor 页、workspace 页与 supabase 仍用 `Todo`。小程序用自己的 `MiniProgramTodo`，不受影响。
- **新实体的注册与连带改动**：`modules/angular-todo` 被 dev-rxdb-angular / electron / tauri 三个宿主的路由共用。electron / tauri
  不读 `ENTITIES`，五个 setup（electron `setup_rxdb_wa-sqlite` / `desktop` / `desktop_pglite`、tauri `setup_rxdb_wa-sqlite` / `desktop`）
  各自列实体，无论哪种落点都要逐个加；两者没有 todo e2e，以构建与类型检查守住。加进 `rxdb-test` 的 `ENTITIES` 则一并进入 Angular 四个、
  React 两个、Vue 一个 setup，`published-model-invariants.spec.ts` 的 `toHaveLength(13)` 要改；三端 `entity-model.spec.ts` 不数实体，但断言
  首个实体是 `Account`、用 `/^Todo/` 匹配链接，新实体名不能排在 `Account` 之前、不能以 `Todo` 开头。新实体与 `Todo` 同库，不能沿用
  `todos` 表名，三端 `working-tree.spec.ts` 断言的 `/\/todos\//` 与 `'todos'` 筛选随之改。Angular `todo.page.spec.ts` mock 了 `Todo`，一并改。
  加进 `ENTITIES` 还是在各宿主单独注册，由 plan 定。
- **Todo 页的拖拽开关在页面层**：todo 页不经 `EntityList`，不依赖阶段 B 的谓词实现；只在「进行中 / 已完成」tab（恰好一组）、
  数据完整加载、无挂起重排时开拖拽，按同一组条件判定，三端同交互。拖拽组件选型在 plan 定，约束如下：
  - 三端列表都是虚拟滚动（Angular `cdk-virtual-scroll-viewport`、React / Vue `@tanstack/*-virtual` 绝对定位 + `translateY`），
    视口外的行不在 DOM 里，批量添加可到 10,000 条；拖拽须支持自动滚动与可视下标到数据下标的映射，或在开拖拽时换掉虚拟化，plan 定。
    仓库没有拖拽库依赖，树 demo 用原生 HTML5 拖放；`@angular/cdk` 已在根依赖，但其 drag-drop 不支持 `cdk-virtual-scroll-viewport`（推断，按官方文档）。
  - Angular 的 `trackBy` 是 `getEntityStatus().fingerprint`（id + updatedAt），每次写入后行 DOM 重建，可能打断拖拽状态；React / Vue 已按 `id` 键。
  - 行内有双击编辑与悬停操作按钮，拖拽须用独立手柄。Angular 的完成态排序按钮没有 `data-testid="todo-sort"`（React / Vue 有），e2e 前补齐。
  - 撤销 / 重做沿用页面现有的 `history(<实体>)` 与 `history()`（仓库 / 数据库作用域，后进先出），`history(Todo)` 与历史侧栏随之改指新实体。
- **Todo 的可见行为变化**：新建待办从「出现在最前」（`id desc`）变为「追加到进行中组末尾」；勾选完成经普通 update 改分组字段，
  按「分组字段变更」追加到已完成组末尾，取消勾选同理回到进行中组末尾；「全部完成」经 `saveMany` 按批内顺序追加。
  页面给的是显式 `orderBy`，core 默认排序不介入，三端页面各自改成 `[completed（所选方向）, sortOrder asc, id asc]`。
  三端现有 `todo.spec.ts` 只按文本定位行、不断言位置，新建改为追加不影响它们（只有 Angular 每个用例 `resetE2eState`）。
- **树兄弟域即分组排序域**：树键只在兄弟集合内有意义，不同父节点可以重复（`FileDragDropService` 先按目标 `parentId`
  筛兄弟再取相邻键）——这正是以 `parentId` 为分组字段、根节点为 NULL 组的排序域；树的跨父拖放就是跨组移动加环检测。
  阶段 D 交付后树可以复用排序引擎，但树实体的 `sortOrder` 列声明为 `nullable: true`（如 `rxdb-test` 的 `MenuSimple`），
  直接声明可排序会被非空校验拒绝，须先迁移存量数据，归 [US-031](US-031-tree-sortable-migration.md)。阶段 C 因此只迁移类型来源，
  组合的是键类型而不是非空的 `ISortableEntity`——直接继承会把树的 `sortOrder` 收窄成非空，破坏 AC#8。

## 驱动场景

owner 确认三端 Todo 列表需要手动排序：进行中与已完成各自一条序列（以 `completed` 为分组字段，阶段 D），
验收落在三端 todo 页（阶段 E，AC#18）。`priority` 为 Medium。

其余来源都不构成今天的症状：三框架 `EntityList` 的拖拽手柄已由 AC#6 关掉；直接渲染 `EntityTable` / `QueryTable`
的调用方仓内没有；三个 demo 的树拖放各自算排序键与比较器的重复归 [US-031](US-031-tree-sortable-migration.md)。
新增抽象至少 5 个：实体级可排序声明与 `ISortableEntity`、分组字段声明与按组归一化、core 的键封装 / 默认排序 / 重排 API
（含跨组移动）、`EntityTable` 的移动上下文输出、rxdb-model 的 UI 启用谓词与重排协调；后两个属阶段 B，不在驱动路径上。

## 实现文件

| 阶段 | 文件                                                                                                                                                                                              | 说明                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A    | `packages/rxdb/src/sortable/sortable.interface.ts`                                                                                                                                                | `SORT_ORDER_FIELD`、`SortOrderKey`、`ISortableEntity`、`ReorderBetween` / `ReorderToGroupEnd` / `ReorderTarget`（新） |
| A    | `packages/rxdb/src/sortable/sortable-error.ts`                                                                                                                                                    | `SortOrderError` 与 `SortOrderErrorReason`（新）                                                                      |
| A    | `packages/rxdb/src/sortable/sortable.utils.ts`                                                                                                                                                    | `isManualOrderEntity`、`normalizeManualOrderBy`、`assertSortOrderKey`；读尾键追加、锚点校验、单行重排（新）           |
| A    | `packages/rxdb/src/sortable/sortable-mutations.ts`                                                                                                                                                | `mutations()` 整批的显式键预检与事务内缺键追加（新）                                                                  |
| A    | `packages/rxdb/src/entity/entity-options.interface.ts`、`metadata-transition.ts`、`metadata-validate.ts`                                                                                          | `manualOrder` 声明与 TSDoc、元数据透传、`sortOrder` 字段校验                                                          |
| A    | `packages/rxdb/src/repository/Repository.ts`                                                                                                                                                      | 查询默认排序归一化、门面缺键创建改走主适配器事务、`reorder()`、remote-only / QueryCache 主端拒绝                      |
| A    | `packages/rxdb/src/entity/entity-manager.ts`                                                                                                                                                      | `save` / `saveMany` / `mutations()` 的显式键预检与缺键追加                                                            |
| A    | `packages/rxdb/src/index.ts`、`scripts/audit/api-surface.mjs`                                                                                                                                     | 导出排序模块的公开符号；命名规则逐个豁免并写明理由                                                                    |
| A    | `packages/rxdb-adapter-pglite/src/query/query_sql.ts`                                                                                                                                             | 手动排序实体的 `sortOrder` 在 ORDER BY 与区间比较上显式 `COLLATE "C"`；SQLite 的 TEXT 默认 BINARY，不改               |
| A    | `packages/utils/src/indexing/fractional-indexing.ts`                                                                                                                                              | 导出 `isValidOrderKey`（含小数位）                                                                                    |
| A    | `packages/rxdb-test/src/sortable/`（子路径 `@aiao/rxdb-test/sortable`）                                                                                                                           | 跨适配器契约套件、`SortableItem` 夹具、runner 接入类型                                                                |
| A    | `packages/rxdb-adapter-pglite/src/__tests__/manual-order-contract.spec.ts`、`packages/rxdb-adapter-sqlite-wasm/src/__tests__/manual-order-contract.spec.ts`                                       | 契约套件的两个 runner                                                                                                 |
| B    | `packages/rxdb-model/src/entity-list/manual-order-list.ts`、`entity-table/vtable/table-row-move.ts`、`entity-table/vtable/table-operations.ts`                                                    | UI 启用谓词、默认排序、移动上下文、手柄运行时开关、重排写入协调、列头排序图标同步（`syncHeaderSortIcon`）             |
| B    | 三框架 `entity-table` / `query-table`                                                                                                                                                             | 新增移动上下文输出，`rowReordered` 不变                                                                               |
| B    | `packages/rxdb-model-angular/src/entity-list/entity-list.component.ts`、`packages/rxdb-model-react/src/entity-list/entity-list.tsx`、`packages/rxdb-model-vue/src/entity-list/EntityList.vue`     | `normal` 排序接线、拖拽持久化、挂起 / 失败状态，三端同交                                                              |
| B    | `apps/dev-rxdb-angular-e2e/`、`apps/dev-rxdb-react-e2e/`、`apps/dev-rxdb-vue-e2e/`                                                                                                                | 拖拽排序 e2e（含钉住单组的分组列表）                                                                                  |
| C    | `packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts`                                                                                                                                   | `ISortableTreeEntity` 改由排序模块的类型组合                                                                          |
| D    | `packages/rxdb/src/sortable/sortable.interface.ts`、`sortable.utils.ts`、`sortable-mutations.ts`                                                                                                  | `ManualOrderOptions`、`manualOrderGroupFields`；按组读尾键 / 邻居（NULL 走 `IS NULL`）、跨组移动、改组检测与按组追加  |
| D    | `packages/rxdb/src/entity/entity-options.interface.ts`、`metadata-validate.ts`                                                                                                                    | `manualOrder: { groupBy }` 声明与 TSDoc；分组字段校验；`sortOrder` 与分组字段拒绝 `encrypted`                         |
| D    | `packages/rxdb/src/repository/Repository.ts`、`packages/rxdb/src/entity/entity-manager.ts`                                                                                                        | 默认排序带分组字段、按组创建追加、改分组字段的写入追加到新组末尾、remote-only / QueryCache 主端改组缺键拒绝           |
| D    | `packages/rxdb-adapter-pglite/src/query/query_sql.ts`                                                                                                                                             | string / enum 分组字段在 ORDER BY 与区间比较上显式 `COLLATE "C"`                                                      |
| D    | `packages/rxdb-test/src/sortable/`（`fixtures.ts`、`manual-order-group.suite.ts`、`transaction-barrier.ts`）                                                                                      | 分组夹具 `SortableList` / `SortableListItem` / `SortableTodo`、分组契约用例、异步屏障                                 |
| D    | `scripts/audit/api-surface.mjs`、`requirements/api-baseline/rxdb.json`、`packages/rxdb-test/public-contract/`                                                                                     | 新导出的命名豁免与 API / 公开契约基线                                                                                 |
| E    | `packages/rxdb-test/entities/Task.ts`                                                                                                                                                             | 可排序待办实体 `Task`（新，分组字段 `completed`，表名 `tasks`）                                                       |
| E    | `modules/angular-todo/todo-page/todo.page.ts`、`apps/dev-rxdb-react/src/app/pages/todo.tsx`、`apps/dev-rxdb-vue/src/pages/TodoPage.vue`                                                           | 改用可排序待办实体、单组 tab 拖拽重排                                                                                 |
| E    | `packages/rxdb-test/entities/index.ts` 的 `ENTITIES`                                                                                                                                              | 注册新实体（排在 `Account` 之后）                                                                                     |
| E    | `apps/dev-rxdb-angular-e2e/src/todo-sort.spec.ts`、`apps/dev-rxdb-react-e2e/src/todo-sort.spec.ts`、`apps/dev-rxdb-vue-e2e/src/todo-sort.spec.ts`                                                 | Todo 拖拽排序 e2e                                                                                                     |
| E    | `modules/angular-todo/todo-page/todo.page.html`、`todo.page.spec.ts`                                                                                                                              | 拖拽手柄、`data-testid="todo-sort"`；spec 的 `Todo` mock 改指新实体                                                   |
| E    | `apps/dev-rxdb-electron/src/app/setup_rxdb_wa-sqlite.ts`、`setup_rxdb_desktop.ts`、`setup_rxdb_desktop_pglite.ts`、`apps/dev-rxdb-tauri/src/app/setup_rxdb_wa-sqlite.ts`、`setup_rxdb_desktop.ts` | 各自的实体列表注册新实体                                                                                              |
| E    | `apps/dev-rxdb-angular-e2e/src/working-tree.spec.ts`、`apps/dev-rxdb-react-e2e/src/working-tree.spec.ts`、`apps/dev-rxdb-vue-e2e/src/working-tree.spec.ts`                                        | 新表名的路径与筛选断言                                                                                                |
| E    | `packages/rxdb-test/src/__tests__/published-model-invariants.spec.ts`                                                                                                                             | 实体数断言                                                                                                            |

## References

- [US-010 树形实体](US-010-tree-entity.md) — 树节点排序的原始验收（AC#2/#3）
- [US-025 核心包子系统按插件边界外移](US-025-core-plugin-extraction.md) — 树实体已外移到 `@aiao/rxdb-plugin-tree`；排序模块由本故事定为 core
- [US-027 实体操作权限模型](US-027-entity-permission-model.md) — 无 update 权限的行经其阶段 C 挂 `_readonly`，列表因此不开手柄
- [US-031 树形实体迁移到排序模块](US-031-tree-sortable-migration.md) — 以 `parentId` 为分组字段复用本故事 A + D
- [todo.page.ts](../../../modules/angular-todo/todo-page/todo.page.ts) — Todo 页现状：三 tab、`[completed, id desc]`、无拖拽
- [tree-entity.interface.ts](../../../packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts) — `ISortableTreeEntity` 现状
- [fractional-indexing.ts](../../../packages/utils/src/indexing/fractional-indexing.ts) — `generateKeyBetween` / `generateKeysBetween`
- [table-operations.ts](../../../packages/rxdb-model/src/entity-table/vtable/table-operations.ts) — `collectReorderedIds`
- [table-factory.ts](../../../packages/rxdb-model/src/entity-table/vtable/table-factory.ts) — `buildTableOptions()` 默认开 `dragOrder`
- [entity-table.component.ts](../../../packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts) — 已有 dragOrder / rowReordered 半成品
- [entity-list.component.ts](../../../packages/rxdb-model-angular/src/entity-list/entity-list.component.ts) — `LIST_TABLE_OPTIONS` 关手柄、`buildCursorOrderBy`（React `entity-list.tsx`、Vue `EntityList.vue` 同构）
- [fractional-indexing 上游 README](https://github.com/rocicorp/fractional-indexing) — 大小写敏感排序，`localeCompare` 会排错
- [SQLite ORDER BY](https://www.sqlite.org/lang_select.html) / [PostgreSQL Sorting Rows](https://www.postgresql.org/docs/current/queries-order.html) / [PostgreSQL Collation](https://www.postgresql.org/docs/current/collation.html) — NULL 默认位置与 collation
