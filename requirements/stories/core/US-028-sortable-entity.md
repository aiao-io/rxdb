---
id: US-028
title: 可排序实体（普通实体手动排序）
status: Backlog
priority: Low
epic: epic-004-future-features
created: 2026-09-20
updated: 2026-10-02
tags: [core, sortable, model, rxdb-model, tree]
---

# 用户故事：可排序实体（普通实体手动排序）

## 作为/我想要/以便

**作为** 模型开发者
**我想要** 让普通（非树）实体显式声明可排序，并在 rxdb-model 实体列表里拖拽手动排序
**以便** 菜单、待办、清单等扁平列表也能获得与树形节点一致的排序能力，且排序能力不依赖 `@aiao/rxdb-plugin-tree`

## 背景与动机

- **表格的拖拽重排没有写入路径。** `buildTableOptions()`（`table-factory.ts`）默认开 `rowSeriesNumber.dragOrder`；
  三框架的 `EntityTable` 监听 `change_header_position`、经 `collectReorderedIds` 抛出 `rowReordered`，`QueryTable`
  原样透传，但没有任何组件接它。三框架的 `EntityList` 因此经 `tableOptions` 传 `LIST_TABLE_OPTIONS`
  （`dragOrder: false`）关掉了手柄，即 AC#6 的提前交付；直接渲染 `EntityTable` / `QueryTable` 又不传 `tableOptions`
  的调用方仍拿到默认的拖拽手柄，拖完不落库。`patchDragIconForReadonlyRows` 隐藏 `_readonly` 行与新增行的手柄；
  `EntityList` 给系统表的行挂 `_readonly`（[US-027](US-027-entity-permission-model.md) AC#16 的列表侧）。
- **排序只存在于树形实体与应用层。** `ISortableTreeEntity`（`@aiao/rxdb-plugin-tree` 的 `tree-entity.interface.ts`：
  `ITreeEntity` 加 `sortOrder?: string | null`）是仓库里唯一的排序类型；`sortOrder` 在 `@aiao/rxdb` 与
  `@aiao/rxdb-model` 中零实现、零读取。三个 demo 应用的树菜单与文件管理页各自调 `@aiao/utils` 的
  `generateKeyBetween` 算排序键（Angular `MenuDragDropService`、React / Vue `useDragDropService` 及各页 store），
  「新建追加到末尾」「拖放插到两邻之间」三端各写一遍；`rxdb-test` 的 `MenuSimple` / `MenuLarge` / `FileNode` /
  `FileLarge` 声明 `sortOrder` 并建 `(parentId, sortOrder)` 索引。
- **排序要在树之外独立成模块。** 树实体在 `@aiao/rxdb-plugin-tree`，`RxDBBranch` 是普通实体；排序若只挂在
  `ISortableTreeEntity` 下，扁平列表要排序就得装树插件。依赖方向应是树插件依赖排序模块，而不是反过来；
  排序模块放在核心（见技术笔记「排序模块归属与依赖方向」），[US-025](US-025-core-plugin-extraction.md) 阶段 E 与此没有先后约束。
- 普通实体同样需要手动排序：菜单顺序、清单拖拽。US-010 的 AC#2/#3 只覆盖了树形节点排序，扁平列表是空白。

## 排序契约

首版只承诺一种能力边界，下文未列入的扩展一律明确不支持（见 Out of Scope），不靠 fallback 降级。

### 排序域

- 每个已声明可排序的实体只有**一条扁平序列：整张实体表**。按业务容器分组（看板内的卡、父对象下的子项）不在本故事；
  树的兄弟域属树插件。
- 实体列表上的筛选、`fixedQuery`、关联选择、部分加载都只是序列的子集，不是另一个排序域，因此不开放重排（见「UI 启用谓词」）。

### 声明与 schema

- **显式 opt-in**：实体级声明，只有一处来源，子类继承、可覆写。名称与挂载位置在 plan 定，两条约束：不叫 `sortable`
  （属性级 / 关系级已用于列头排序）；若放进 `EntityMetadataFeatures`，须先改其「核心不内置任何具体特性」的约定。
- **字段由开发者显式声明**，引擎不注入：元数据初始化时校验字段存在、类型为 string、可写、非计算字段、**不可为 NULL**
  （`nullable` 为假，两端建表即发 `NOT NULL`），违反即抛明确错误。非空由 DDL 保证，契约里因此没有 NULL 键这一类特殊情况。
- 未声明但恰好有 `sortOrder` 字段的实体，行为完全不变。`ISortableEntity` 只是 TS 便利类型（被擦除），不是运行期声明。
- 排序模块导出排序键类型（名称在 plan 定）作为唯一的类型来源：`ISortableEntity` 用它声明非空的 `sortOrder`；
  树侧的 `ISortableTreeEntity` 用同一个键类型组合出 `sortOrder?: <键类型> | null`，树节点的可空性不变（见阶段 C）。

### 键不变量

- 已启用实体的持久化不变量：`sortOrder` 非空（schema 层 `NOT NULL`）、由 `@aiao/utils` **默认字母表**生成的合法键、全序列严格递增。
  `generateKeyBetween(null, null)` 得 `a0`，显式传 `BASE_62_DIGITS` 得 `V0`——禁止混用不同生成配置。
- **比较规则统一为码点字典序（大小写敏感）**：JS 侧保持 `query-matching.utils.ts` 现有 `<` / `>` 比较器，
  不得换成 `localeCompare`（`a0Z < a0a`）；SQL 侧对排序键使用二进制比较（SQLite 默认 `BINARY`，PGlite `COLLATE "C"`）。
  初查、活查询增量合并、游标翻页、刷新四条链路同序。键非空，NULL 位置不进入本契约。
- **只读不写**：查询永不写库，不隐式回填，不自动重编号。
- **按锚点校验**：每次创建追加 / 重排只校验它读到的锚点（末尾行，或目标位置的前后邻居）。锚点为空串 / 非法格式，
  或前后邻居不满足 `prev < next`（含重复键）时，明确报错、零写入。不得依赖 `generateKeyBetween` 对反向入参的自动交换来「修复」脏序列。
  被移动行自身的旧键不是锚点——把空串或非法键的行拖进两个合法邻居之间是合法写入。
- **历史数据**：给已有实体启用即一次 schema 迁移（列改 `NOT NULL`），存量行必须在迁移里由开发者显式回填
  （如按既定顺序 `generateKeysBetween(null, null, n)`）。未回填的迁移被 DDL 拒绝，不存在「未回填但已启用」的中间态。

### 查询默认排序

- 已启用实体的查询，调用方**未给 `orderBy`** 时归一化为 `[sortOrder asc, id asc]`；调用方显式给出的 `orderBy` 原样尊重，不追加、不改写。
- 覆盖 `Repository` 的 `find` / `findAll` / `findOne` / `findOneOrFail` 四个读入口（`count` 不排序，不受影响；
  `findByCursor` 强制显式 `orderBy`，不走默认）。四者现状不一：`find` 已有 options 归一化，`findAll` 原样下发。
- 归一化在单一入口完成，结果同时进入 SQL 下发、查询任务缓存键与活查询合并选项，不能只改适配器参数。
- 三框架 `EntityList` 的 `buildCursorOrderBy()`：`normal` 状态对可排序实体返回 `[sortOrder asc, id asc]`，
  不可排序实体保持 `[id desc]`；列头排序优先，退回 `normal` 恢复手动顺序。

### 创建追加

- 用户创建且缺键时追加到序列末尾。必须覆盖的入口：`Repository.create`、`EntityManager.create`、实体 `save()`（新建）、
  `EntityManager.saveMany` / `mutations` 中的 create、现有级联保存路径中的 create。规范化落在这些入口共同经过的边界，plan 给出位置与覆盖证明，
  并证明它先于任何非空 / `required` 校验执行（否则缺键创建会先被非空约束拒绝）。
- 同批 n 条缺键记录按批内顺序一次 `generateKeysBetween(tail, null, n)`，互不碰撞；不得用全局共享默认值。
- 显式传入合法键原样保留；显式传入非法键明确报错。
- 非用户来源（同步拉取、恢复、history 回放）原样写入，不分配、不改写已有键。带入 NULL 时由 `NOT NULL` 约束当场拒绝该次写入
  （拉取写入当场失败，不延后到下一次锚点写入；失败粒度随该同步路径的事务边界，plan 写实）；带入空串 / 非法键时，在下一次以它为锚点的写入时按「按锚点校验」报错。

### 写边界与并发

- 读锚点 → 算键 → 写入在**同一个主适配器 transaction** 内完成（`TransactionExecutor`）。同一序列两次本地并发追加不得读到同一旧尾键；
  plan 须证明适配器事务对并发写者（含受支持的同库多实例）串行化，不能用组件私有锁代替。
- 首版只支持主适配器能在单个事务内读写的本地后端（SQLite-core 系、PGlite）。remote-only 与 QueryCache 主端的缺键创建、
  重排明确报错，不拿本地缓存子集冒充完整序列。
- 本故事不涉及 CRDT 或离线冲突合并，只保证本地受支持写边界内的确定性。

### 重排写入

- **输入是移动意图，不是最终排列**：移动行 ID + 目标位置的前后邻居 ID（序列首 / 尾时一侧为空）。来源是 VTable
  `change_header_position` 的 `source` / `target`。`rowReordered: string[]` 与 `collectReorderedIds` 保持原签名、原行为；
  阶段 B 在三框架 `EntityTable` / `QueryTable` 上新增一个不破坏兼容的移动上下文输出，名称在 plan 定，三端同 API。
- **写集合最小**：只更新移动行的 `sortOrder` 一个字段；原位拖拽零写；只支持单行（VTable 行序号拖拽本身是单行），多行移动不支持。
- **事务内复核**：移动行仍存在、两邻居仍存在且仍相邻（之间没有其他行）；任一不成立即拒绝、零写、重查。
- 只提交 `sortOrder` 的 update，走普通用户写路径（写日志、同步、US-027 写边界若落地自动覆盖），不得借 `saveMany`
  把该实例其他未提交字段或关系一并保存。单行写入天然原子；失败时抛出错误，不吞。
- 启用 `@aiao/rxdb-plugin-history` 的实体，一次拖拽就是一次普通 update，撤销粒度沿用现有 history，本故事不新建撤销边界。

### UI 启用谓词

判定逻辑放在 `@aiao/rxdb-model`，三框架只做适配、不复制算法。手柄开启当且仅当以下全部成立：

1. 实体已声明可排序；
2. 主键为 string（UI 域；core 对 `string | number | bigint` 主键都成立，UI 不做 `String(id)` 折叠）；
3. 排序状态为 `normal`；
4. 无 `filterQuery`、无 `fixedQuery`、非关联选择模式；
5. 数据已完整加载（已确认 `hasMore = false`；虚拟渲染本身不算不完整）；
6. 列表内无 `_readonly` 行、无草稿 / 新增行、无待提交编辑；
7. 没有挂起中的重排。

任一不满足时关闭 `dragOrder`，程序化触发同样拒绝、零写入。手柄隐藏只是视觉守卫，写入侧仍按上述条件拒绝。
重排挂起期间拒绝新的拖拽（不排队）；成功后按 DB 重查结果刷新，失败后重查恢复到最新已提交顺序、清忙碌态、展示错误，下一次拖拽可用。

## 交付阶段

| 阶段 | 交付                                                                                                                        | 直接前置 | AC 区段           | 状态 |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------- | ---- |
| A    | core 排序语义：显式声明与元数据校验、查询默认排序归一化、创建追加、单行重排 API、键不变量与事务写边界、SQLite / PGlite 同序 | 无       | AC#1～4、#11、#12 | ⬜   |
| B    | 三框架 `EntityList` 拖放持久化：移动上下文输出、UI 启用谓词、`normal` 排序接线、挂起 / 失败状态；三端 e2e 同交              | 阶段 A   | AC#5～7           | ⬜   |
| C    | 树兼容：`ISortableTreeEntity` 由排序模块的类型组合而成，依赖方向测试；树运行期行为不变                                      | 阶段 A   | AC#8～9           | ⬜   |

AC#10（未声明可排序的实体行为不变）每个阶段都要守住。B 与 C 都只依赖 A，可以并行。

AC#6 已提前交付：三框架 `EntityList` 经 `tableOptions` 关掉了拖拽手柄，阶段 B 只在 UI 启用谓词成立时重新打开。

## 范围边界

### In Scope

- 普通（非树）实体的显式可排序声明、字段校验与 `sortOrder` 键不变量
- core 排序模块（与树无关）：基于 `@aiao/utils` fractional indexing 的键计算、查询默认排序、创建追加、单行重排
- SQLite-core 系与 PGlite 上排序键的比较规则统一（码点序）；可排序字段的非空约束
- rxdb-model 三框架 `EntityList` 的拖放持久化接线与 UI 启用谓词
- `ISortableTreeEntity` 改由排序模块的类型组合，旧引用不破坏

### Out of Scope

- `@aiao/rxdb-plugin-tree` 自身的树能力与树实体运行期行为；本故事只改 `ISortableTreeEntity` 的类型来源
- 按业务容器分组的排序域（看板内卡片、父对象下子项、树兄弟域）
- 跨层级树拖拽移动（改变 parentId 的拖放，属树能力）
- 三个 demo 应用树拖放服务的重构（可以改用排序模块，但不是本故事的验收项）
- 筛选 / `fixedQuery` / 关联选择 / 部分加载列表内的重排，及跨页排序
- 含只读行的列表内重排、多行拖拽、非字符串主键实体的 UI 重排
- 存量数据的隐式回填、自动重编号、键长上限
- remote-only 与 QueryCache 主端的创建追加与重排
- 实体操作权限（→ [US-027](US-027-entity-permission-model.md)：其写边界与 `_readonly` 守卫自动覆盖重排）
- 多设备离线重排的冲突合并（归 vision 阶段 3 协作）
- sortOrder 的数据库索引 / 查询性能优化（性能单列）

## 验收标准

| #   | 前置条件                                                              | 操作                                                                                                              | 预期结果                                                                                                                                                                                                                             | 状态 |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 普通实体显式声明可排序；数据的 `id` 顺序与 `sortOrder` 相反           | 元数据初始化；不带 `orderBy` 与带显式 `orderBy` 查询                                                              | 字段缺失 / 非 string / 计算字段 / 不可写 / `nullable: true` 在初始化时明确报错；`find` / `findAll` / `findOne` / `findOneOrFail` 不带 `orderBy` 按 `[sortOrder asc, id asc]`，带则原样；两种查询缓存键隔离，活查询增量合并与初查同序 | ⬜   |
| 2   | 同上，创建时未提供 sortOrder                                          | 依次经「创建追加」列出的每个入口创建；同批创建 n 条；显式传合法 / 非法键；同步拉取写入                            | 缺键追加到末尾；同批 n 条按批内顺序、互不碰撞；合法键原样保留，非法键明确报错；同步写入不分配、不改写键                                                                                                                              | ⬜   |
| 3   | 已回填的可排序序列                                                    | 经 core 重排 API 把一行移到首、尾、前移、后移、原位；移动前删除该行或在两邻之间插入新行                           | 只有移动行的 `sortOrder` 一个字段被写，新键落在两邻之间；原位零写；移动行已删除或邻居不再相邻时拒绝、零写                                                                                                                            | ⬜   |
| 4   | 同一序列                                                              | 固定种子性质测试；同一间隙两个方向（贴下界、贴上界）各连续最坏插入 1,000 次；用异步屏障固定两次并发追加的读写交错 | 键始终合法且严格递增；1,000 次最坏插入后键长贴下界 169、贴上界 202（实测预算，本故事只承诺已测预算）；两次并发追加不碰撞；全程无重编号                                                                                               | ⬜   |
| 5   | 三框架 `EntityList`，可排序实体，满足 UI 启用谓词                     | 真实拖拽一行 → DB 重查 → 刷新页面；切到列头排序再退回 `normal`；挂起中再拖；注入写失败                            | 顺序持久化且刷新后保持；列头排序优先，退回后恢复手动顺序；挂起期间拒绝新拖拽；失败后恢复到最新已提交顺序并展示错误，下一次拖拽可用                                                                                                   | ⬜   |
| 6   | 三框架实体列表，UI 启用谓词不成立                                     | 打开列表；程序化触发移动事件                                                                                      | 不可排序实体、非字符串主键、列头排序、有筛选 / `fixedQuery` / 关联选择、未完整加载、含草稿或待提交编辑，均不显示手柄；强制事件零写入，草稿与原编辑状态保留                                                                           | ⚠️   |
| 7   | 可排序实体列表含只读行（`_readonly`）                                 | 打开列表；程序化触发移动事件                                                                                      | 整表不开拖拽手柄；强制事件零写入；只读行 `sortOrder` 逐字不变                                                                                                                                                                        | ⬜   |
| 8   | 树形实体（含 `ISortableTreeEntity` 引用）                             | 类型检查；跑现有树测试与三端 demo 树拖放                                                                          | 旧引用编译通过；树查询、创建与 demo 拖放行为不变；树实体不因类型继承自动获得可排序声明；两个父节点下各自从 `a0` 开始的数据不受影响                                                                                                   | ⬜   |
| 9   | `@aiao/rxdb-plugin-tree` 与排序模块                                   | 类型检查 + 依赖分析                                                                                               | 排序键类型只在排序模块声明一处，`ISortableTreeEntity` 由它组合而成且 `sortOrder` 保持 `?: … \| null`；排序模块不 import 树插件（依赖方向：tree → sortable）                                                                          | ⬜   |
| 10  | 未声明可排序的现有实体（含恰好有 `sortOrder` 字段的）                 | 原有查询、写入与 UI 操作                                                                                          | schema、查询顺序、写入、列头排序、`rowReordered` 签名均不变（拖拽手柄已按 AC#6 关闭）                                                                                                                                                | ⬜   |
| 11  | 可排序序列含空串 / 非法 / 重复 / 异字母表键；另有带 NULL 键的同步拉取 | 查询与游标翻页；以这些行为锚点创建追加或重排；把空串键行拖进两个合法邻居之间；同步写入 NULL 键                    | 查询不写库；锚点违反不变量时明确报错、零写；空串键行移入合法邻居之间成功；NULL 键写入被 `NOT NULL` 拒绝；同一数据在 SQLite 与 PGlite 的初查、增量合并、游标翻页、刷新结果一致（码点序）                                              | ⬜   |
| 12  | 可排序实体的主适配器为 remote-only 或 QueryCache                      | 缺键创建；调用重排 API                                                                                            | 明确报错，不读本地缓存子集算键                                                                                                                                                                                                       | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

AC#6 的保留：三框架 `EntityList` 已传 `dragOrder: false`，三端 `entity-list.real.spec` 的
「行序号列不带拖拽手柄…」用例断言了传给表格的 `rowSeriesNumber`；三端 e2e 未做——行画在 canvas 上，
随阶段 B 的拖拽 e2e 一起补。传参单测不等于拖拽 e2e，阶段 B 不得沿用这条提前交付直接关闭 AC#6。

覆盖率按仓库规则：core 及核心框架包 ≥90%，其他受影响 packages ≥80%。AC#5～7 的三端验收必须是真实组件 + Playwright
拖拽后 DB 重查，不只断言 `dragOrder` 选项。

## 技术笔记

**关键设计决策**：

- **可排序声明 surface**：已定为显式 opt-in + 开发者显式声明字段（见「声明与 schema」）。识别 `sortOrder` 字段自动启用
  会破坏 AC#10，已否决。显式声明**不宜叫 `sortable`**：`sortable?: boolean` 已是属性级与关系级的标志
  （`property-types.interface.ts` 的 `ISortable`、`relation-types.interface.ts`，含义是列头可排序，`entity-field.utils.ts`
  按它输出字段元数据），实体级再叫 `sortable` 就同名异义。`EntityMetadataFeatures`（`entity-options.interface.ts`）
  是插件挂特性的落点，其 TSDoc 写明核心不内置任何具体特性，core 的排序声明要放进 `features`，得先改这条约定。
- **列表默认排序的现状**：三框架 `buildCursorOrderBy()` 的 `normal` 状态返回 `[id desc]`，并作为**显式** `orderBy`
  传给 `Repository.findByCursor`（要求末尾为 `id`）。core 的默认排序归一化碰不到这条路径，所以 `EntityList` 必须单独接线（AC#5）。
- **只读行与移动意图**：`collectReorderedIds` 跳过 `_readonly` 与 `_isAddRow`，且只收 `typeof id === 'string'`。
  序列 `[A, R, B]`（R 只读）里「B 拖到 A 前」与「A 拖到 B 后」给出同一个载荷 `[B, A]`，只读锚点信息丢失；
  最终排列也推不出唯一的最小写集合。这就是首版改用 VTable `source` / `target` 移动意图、并对含只读行的列表整表关手柄的原因。
- **事务能力已有**：`EntityManager.mutations` 路由到主适配器，`RxDBAdapterSqliteBase.mutations` 与
  `RxDBAdapterPGlite.mutations` 已经在 transaction 内执行批量变更；Angular `EntityList` 的 `#flushPending` 保存旧值并在失败时回滚内存。
  本故事复用这些能力，不新建事务机制。
- **为什么强制非空**：同一 `[NULL, a0, a1]` 升序，SQLite 得 `[NULL, a0, a1]`，PGlite 得 `[a0, a1, NULL]`，`query_sql.ts` 的
  `build_order_by` 两端都不补 NULL 策略；`Repository` 的 `_generate_cursor_rule_group` 又按「排序列非空」生成游标谓词
  （`{ field, operator, value: cursor[field] }`），游标落在 NULL 行时 SQLite 的 `build_rule` 拒绝 `> null` 直接抛错，
  PGlite 则因 NULL 排在末尾、`> 's3'` 把 NULL 行全部排除而静默少行。允许 NULL 就得同时补齐两端 NULL 位置与游标谓词的 NULL 展开；
  `nullable: false` 让 DDL 挡住 NULL，这几处一起消失。该游标缺陷对任何可空列的列头排序今天就存在，不归本故事，
  见 roadmap「零散收尾项」。`build_order_by` 两端也都不补 collation 策略。fractional-indexing 上游要求大小写敏感排序、提醒
  `localeCompare` 会排错；PostgreSQL collation 会影响字符串排序，`C` 使用字符编码顺序。
- **权限**：重排是 update 的一种，与其他 update 走同一条写路径，本故事不为权限单独接线。
  [US-027](US-027-entity-permission-model.md) 若落地，其写边界拒绝无权 update，其阶段 C 给 `canEdit=false` 的行挂
  `_readonly`（列表因此不开手柄），两者都自动覆盖重排；本故事不依赖 US-027。
- **现有资产复用**：`table-factory.ts` 的 `dragOrder: true`、三框架 `EntityTable` / `QueryTable` 的 `rowReordered` 与
  `tableOptions`、`patchDragIconForReadonlyRows` 与 `collectReorderedIds` 均已有单测，接线时不动其 API。
  `buildTableOptions()` 对 `rowSeriesNumber` 是整体覆盖，关 `dragOrder` 时 `title` / `width` 要一并带上。
- **排序模块归属与依赖方向**：本故事定为 core——查询默认排序与 create 追加键都在引擎写路径上。
  `@aiao/rxdb-plugin-tree` 依赖 `@aiao/rxdb`，core 反向 import 树插件会被 nx 项目图判成环，AC#9 的依赖方向因此有现成门禁。
- **树只做类型兼容**：树键只在兄弟集合内有意义，不同父节点可以重复（`FileDragDropService` 先按目标 `parentId` 筛兄弟再取相邻键），
  与本故事的「整表一条序列」不同。阶段 C 只迁移类型来源，树要复用排序引擎行为须另立故事定义兄弟域。
  树实体的 `sortOrder` 列声明为 `nullable: true`（如 `rxdb-test` 的 `MenuSimple`），所以阶段 C 组合的是键类型而不是
  非空的 `ISortableEntity`——直接继承会把树的 `sortOrder` 收窄成非空，破坏 AC#8。

## 价值待证

本故事**价值待证**。用户踩得到的症状只有一处：三框架 `EntityList` 显示拖拽手柄、拖完不落库。AC#6 已经提前交付，
不靠本故事的任何抽象就把它关掉了（背景第 1 条）。剩下的都不是今天有人踩到的症状：直接渲染 `EntityTable` /
`QueryTable` 的调用方默认仍有手柄，但 `rowReordered` 本就是交给调用方处理的输出，仓内 apps / modules / website
没有这样的调用方；三个 demo 的树拖放各自算排序键（背景第 2 条），但 demo 拖放服务的重构在 Out of Scope，本故事不验收它。

本故事要新增的抽象至少 4 个：实体级可排序声明与 `ISortableEntity`、core 的键封装 / 默认排序 / 重排 API、
`EntityTable` 的移动上下文输出、rxdb-model 的 UI 启用谓词与重排协调。病灶数 < 抽象数，`priority` 因此为 Low。

**解锁条件**（满足其一）：出现需要手动排序的扁平实体（demo 或外部 issue），且它落在「整表一条序列」的首版边界内；
或有调用方直接渲染 `EntityTable` / `QueryTable` 并要把移动结果落库。届时一并上调优先级，排序契约与交付阶段不变；
真实调用方若需要分组排序域或只读混排，先改本故事的范围再排期。

两条都未满足：唯一的扁平演示实体 `rxdb-test` 的 `Todo` 只有 `title` / `completed`，`modules/angular-todo` 无拖拽；
apps / modules / website 无 `EntityTable` / `QueryTable` 直接调用；仓库 issue 无排序需求。不得为满足解锁条件给演示实体加排序字段。

## 实现文件

| 阶段 | 文件                                                                                                                                                                                          | 说明                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| A    | `packages/rxdb/src/entity/sortable-entity.interface.ts`                                                                                                                                       | `ISortableEntity`（新）                                   |
| A    | `packages/rxdb/src/entity/`                                                                                                                                                                   | 基于 `@aiao/utils` 的排序键封装、锚点校验、单行重排（新） |
| A    | `packages/rxdb/src/entity/entity-options.interface.ts` / `metadata-validate.ts`                                                                                                               | 可排序声明与字段校验                                      |
| A    | `packages/rxdb/src/repository/`、`packages/rxdb/src/entity/entity-manager.ts`                                                                                                                 | 查询默认排序归一化、各创建入口的追加规范化                |
| A    | `packages/rxdb-adapter-sqlite-core/src/query/query_sql.ts`、`packages/rxdb-adapter-pglite/src/query/query_sql.ts`                                                                             | 排序键二进制比较（PGlite `COLLATE "C"`）                  |
| B    | `packages/rxdb-model/src/entity-table/`                                                                                                                                                       | UI 启用谓词、移动上下文、重排写入协调                     |
| B    | 三框架 `entity-table` / `query-table`                                                                                                                                                         | 新增移动上下文输出，`rowReordered` 不变                   |
| B    | `packages/rxdb-model-angular/src/entity-list/entity-list.component.ts`、`packages/rxdb-model-react/src/entity-list/entity-list.tsx`、`packages/rxdb-model-vue/src/entity-list/EntityList.vue` | `normal` 排序接线、拖拽持久化、挂起 / 失败状态，三端同交  |
| B    | `apps/dev-rxdb-angular-e2e/`、`apps/dev-rxdb-react-e2e/`、`apps/dev-rxdb-vue-e2e/`                                                                                                            | 拖拽排序 e2e                                              |
| C    | `packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts`                                                                                                                               | `ISortableTreeEntity` 改由排序模块的类型组合              |

## References

- [US-010 树形实体](US-010-tree-entity.md) — 树节点排序的原始验收（AC#2/#3）
- [US-025 核心包子系统按插件边界外移](US-025-core-plugin-extraction.md) — 树实体已外移到 `@aiao/rxdb-plugin-tree`；排序模块由本故事定为 core
- [US-027 实体操作权限模型](US-027-entity-permission-model.md) — 无 update 权限的行经其阶段 C 挂 `_readonly`，列表因此不开手柄
- [tree-entity.interface.ts](../../../packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts) — `ISortableTreeEntity` 现状
- [fractional-indexing.ts](../../../packages/utils/src/indexing/fractional-indexing.ts) — `generateKeyBetween` / `generateKeysBetween`
- [table-operations.ts](../../../packages/rxdb-model/src/entity-table/vtable/table-operations.ts) — `collectReorderedIds`
- [table-factory.ts](../../../packages/rxdb-model/src/entity-table/vtable/table-factory.ts) — `buildTableOptions()` 默认开 `dragOrder`
- [entity-table.component.ts](../../../packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts) — 已有 dragOrder / rowReordered 半成品
- [entity-list.component.ts](../../../packages/rxdb-model-angular/src/entity-list/entity-list.component.ts) — `LIST_TABLE_OPTIONS` 关手柄、`buildCursorOrderBy`（React `entity-list.tsx`、Vue `EntityList.vue` 同构）
- [fractional-indexing 上游 README](https://github.com/rocicorp/fractional-indexing) — 大小写敏感排序，`localeCompare` 会排错
- [SQLite ORDER BY](https://www.sqlite.org/lang_select.html) / [PostgreSQL Sorting Rows](https://www.postgresql.org/docs/current/queries-order.html) / [PostgreSQL Collation](https://www.postgresql.org/docs/current/collation.html) — NULL 默认位置与 collation
