# Contract: 批内按组追加的性能（core 内部）

范围：`packages/rxdb/src/sortable/sortable.utils.ts` 的 `appendToGroupTails` 与 `packages/rxdb/src/sortable/sortable-mutations.ts`
的 `appendBatchSortOrders`。二者都不在 `@aiao/rxdb` 的公开导出里（`index.ts` 只导出 `assertSortOrderKey` / `isManualOrderEntity` /
`manualOrderGroupFields` / `normalizeManualOrderBy` / `reorderTargetForMove` 与类型），改动不触及 API 基线。

## 语义：一个字都不变

US-028 的 AC#2、#14、#16 定义的行为原样保留：

- 每个目标组的新键 = `generateKeysBetween(锚点, null, 该组条数)`，组内按批内顺序；
- 锚点 = 库里该组尾键（排除本批已在库里、正在改组的行）与同组预留显式键中码点最大者；
- 尾键不合法时抛 `SortOrderError('corruptAnchor')`，一条不写；
- 读尾键与写入在同一个主适配器事务内。

US-028 的契约套件（`packages/rxdb-test/src/sortable/manual-order*.suite.ts`，SQLite 与 PGlite 两个 runner）不改即通过，是这条的验收。

## 变化一：按组键索引拆分

现状 `splitByGroup` 对每一行在已有组里线性 `find` + 逐字段 `isEqual`，复杂度 O(行数 × 组数)；预留键在每个组上再 `filter` 一遍，同样 O(组数 × 预留数)。
改为按规范化的组键（逐字段取值、带类型标签，`null` / string / number / boolean / bigint / Date 互不相撞）建 `Map`，拆分与预留归组都是 O(行数)。
组的迭代顺序仍是「首次出现的批内顺序」。

## 变化二：本批新建父行的组不读尾键

**规则**：目标组的任一分组字段是外键，且它的取值等于**本批**要新建的、该外键所指实体的某一行的主键，则该组在库里必然为空，
锚点只取同组预留显式键（没有即 `null`），不发尾键查询。

**为什么成立**：库里已提交的行都满足外键约束，不可能有行指向一条尚不存在的行。全部本地后端都强制外键：SQLite 系客户端
建连即 `PRAGMA foreign_keys = ON`（`Oo1ClientBase` 经 `sqlite-client.utils.ts`、wa-sqlite、electron `node:sqlite`、tauri `engine.rs`），
事务内用 `defer_foreign_keys` 只推迟到提交时校验；PGlite 建表带外键约束。remote-only 与 QueryCache 主端的缺键追加本就被拒（US-028 AC#12），不在此列。

**怎么判**：分组字段取自 `metadata.foreignKeyRelationMap`；该外键所指的实体，用关系的 `mappedNamespace` + `mappedEntity` 与 create 桶各 key 的元数据 `namespace` + `name` 比对
（自引用关系的 `mappedEntity` 在 `transitionMetadata` 里已被改写成本实体的 `name`，所以与自身的 create 桶可直接比对）；桶中存在主键等于该组分组取值的行，即为空组。
匹配不到（外键指向别的实体类型、指向本批未新建的行）一律不触发，回到逐组读尾键——只会慢，不会错。

**接口**：`appendToGroupTails` 的判据参数为**可选**，缺省不触发；`Repository.create` / `update` 两个门面调用点（`Repository.ts`）不传，行为与改前逐字相同。

**不是特例**：它对任何「外键分组 + 同批建父行」都成立（树的自引用 `parentId`，或一批里同时建清单和它的条目），判据只读元数据与本批的 create 桶。

## 性能预算

| 场景（固定种子随机树，复刻 demo 造树方式） | 预算                                            |
| ------------------------------------------ | ----------------------------------------------- |
| 10,000 行、约 4,200 组，全部缺键           | ≤ 同一次运行里「同一批行带显式键」耗时的 1.2 倍 |
| 1,000 行、约 440 组，全部缺键              | 同上                                            |
| 1 行追加到既有组                           | 与现状持平（仍是一次尾键查询）                  |

基准：`benchmarks/sortable-batch-append.bench.ts`（PGlite，node），比值超出即非零退出；sqlite-wasm 的一次性实测见 research.md R3。

## 测试

- 单元：组键规范化（各类型互不相撞、`null` 自成一组）；同批新建父行的组不发尾键查询（计查询次数）；该组有同批预留显式键时从最大预留键之后追加。
- 契约：US-028 两个 runner 的手动排序套件原样通过。
- 新增契约用例（两个 runner）：一批里新建父行与它的子行、另有子行追加到既有父行，键在各组内严格递增、既有组从尾键之后开始。
