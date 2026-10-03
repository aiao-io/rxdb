---
id: RV-026
title: US-028 分支全量代码评审
status: Open
created: 2026-10-03
updated: 2026-10-03
pr:
---

# Review：US-028 分支相对 main 的全量代码评审

## 结论

**🟡凑合，当前不建议合并。** 功能方向 ✅值得做：排序能力从树解耦、三框架使用共享排序意图与列表门禁，结构合理。但事务内 SQL 读取不等于拿到了持久化实体快照，批次和失败重试也没有守住自动键分配边界。已有测试全绿，不能替代这些边界测试。

本次确认 **6 条未解决问题：1 条 P1、5 条 P2**，其中 5 条为功能缺陷、1 条为新增 lint 门禁失败。真实 PGlite 的 6 条新增边界测试全部失败；Angular Todo 的 2 条新增边界测试也失败。没有修改业务实现，没有把既有 lint 警告或未执行的 E2E 当作新增业务缺陷。

| 编号 | 优先级 | 问题 | 证据等级 |
| --- | --- | --- | --- |
| [R01](#r01-p1重排使用脏身份缓存误判零写并丢失未提交编辑) | P1 | 重排使用脏身份缓存，误判零写并丢失未提交编辑 | 真实 PGlite，3 条失败测试 |
| [R02](#r02-p2混合批量写入没有预留同批显式键自动生成重复键) | P2 | 显式键与缺键行混合批写，自动生成重复键 | 真实 PGlite，1 条失败测试 |
| [R03](#r03-p2失败事务留下自动键修正数据后重试绕过追加) | P2 | 失败事务留下自动键，重试绕过追加并生成重复键 | 真实 PGlite，1 条失败测试 |
| [R04](#r04-p2多字段分组更新用未提交字段计算目标组) | P2 | 多字段分组更新使用未提交字段计算目标组 | 真实 PGlite，1 条失败测试 |
| [R05](#r05-p2todo-拖拽只保存下标列表变化会移动其他行或泄漏异常) | P2 | Todo 拖拽中列表变化，移动另一条记录或泄漏异常 | Angular controller 2 条失败测试；React/Vue 同路径静态确认 |
| [R06](#r06-p2本分支新增-11-条-eslint-警告零警告门禁失败) | P2 | 新增 11 条 ESLint 警告，零警告门禁失败 | affected lint + main 原文件对照 |

优先级口径：P1 是未提交编辑丢失，应优先修复；P2 是在明确边界条件下影响排序正确性、交互或合并门禁的缺陷。

## 1. 基线、范围与方法

- 日期：**2026-10-03**，Asia/Shanghai。
- 分支：`us-028`。
- 被评审 HEAD：`738dfe3976b7f048fa34aced96cdac204efff2ff`。
- 本地 `main`：`2e820521187cbfcd1fe76fb705659fea0a548f0e`，同时也是本次 merge-base。
- 范围：`git diff main...HEAD`，**145 个文件，+9,152 / -456 行**。不是只看最后一个提交，也不是只看排序核心。
- 方法：逐项检查变更及调用链，核对 US-028 验收语义、三端组件公开接口、持久化与身份缓存边界；串行复跑相关 Nx 任务，再补最小复现验证疑点。
- 开始评审和清理复现后，工作区均干净。临时测试已移除，本次只保留报告和目录索引；附录保留原始 145 个变更文件清单。

| 评审区域 | 文件数 | 新增 / 删除行 | 检查重点 |
| --- | ---: | ---: | --- |
| 排序核心 | 17 | +2,489 / -18 | 元数据、默认排序、Repository、EntityManager、批量分组、重排错误与测试 |
| PGlite / SQLite-WASM 适配器 | 5 | +262 / -4 | collation、游标/区间语义、真实适配器共享套件 |
| 共享模型及 Angular/React/Vue 模型 | 31 | +2,141 / -114 | VTable 行移动、回滚、只读与单排序域门禁、公开接口 |
| utils | 5 | +444 / -1 | 分数索引键校验、等高行拖拽、取消与事件生命周期 |
| tree 类型 | 2 | +71 / -2 | 排序类型唯一来源、依赖方向、可空性兼容 |
| rxdb-test | 18 | +946 / -8 | Task、夹具、跨适配器套件、发布契约与覆盖率入口 |
| 三端 demo 与 Todo 模块 | 36 | +654 / -135 | 拖拽意图、完成状态改组、码点比较、查询和工作树展示 |
| Electron / Tauri 实体注册 | 5 | +10 / -10 | 新 Task 的初始化/注册一致性 |
| 三端 E2E | 10 | +1,346 / -13 | 实体列表、Todo、失败归档、工作树与幂等重试 |
| 文档、API 基线、审计脚本 | 16 | +789 / -151 | 导出契约、验收边界、US-031 拆分、状态派生视图 |
| **合计** | **145** | **+9,152 / -456** | 完整文件清单见附录 |

## 2. 未解决问题

### R01 [P1]：重排使用脏身份缓存，误判零写并丢失未提交编辑

**位置与证据**

- [`findById` / `readNeighbor` / `placeBetweenNeighbors` / `reorderRow`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/sortable/sortable.utils.ts)：排序算法经 `repository.find()` 读取返回的实体，而非独立的持久化行快照。零写判断使用实体的当前值：

  ```ts
  if (Object.keys(patch).length === 0 && isAlreadyBetween(row.sortOrder, lowerKey, upperKey)) return null;
  ```

- [`Repository.reorder`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/repository/Repository.ts)：虽然使用事务执行器仓库，读取仍进入相同实例的实体缓存。
- 支撑调用链是既有的 [`PGliteRepositoryBase.addQueryCache`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-adapter-pglite/src/repository/PGliteRepositoryBase.ts) 与 [`EntityStatus.applyExternal` / `mergeExternal`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/entity/entity-status.ts)：查询命中缓存后合并外部值，但随后仍执行 `state.modified = false`。第一次读取可能保留 dirty 值供算法误用，后续回填又可能按非 dirty 路径覆盖编辑。

**真实复现**

每条用例独立建空 PGlite 内存库，使用 [`SortableItem`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/src/sortable/fixtures.ts)，持久化三行 `a:a0, b:a1, c:a2`。随后执行：

```ts
await repository.reorder(c.id, { prevId: a.id, nextId: b.id });
```

| 未提交的本地编辑 | 期望 | 实测 |
| --- | --- | --- |
| `c.sortOrder = 'a0V'` | 按库中 `c:a2` 判断并真正移动，库中顺序变为 `a,c,b` | 调用成功，但库中仍为 `a:a0,b:a1,c:a2`，误判为已就位 |
| `b.sortOrder = 'a9'` | 使用库中邻居键 `b:a1`，库中顺序变为 `a,c,b` | 调用成功，但库中仍为 `a:a0,b:a1,c:a2` |
| `c.title = 'c-edited'` | 仅写排序字段，保留本地 title 编辑供之后保存 | `reorder()` 返回后 `c.title === 'c'`，未提交编辑丢失 |

以上三条均由真实适配器复现，查询持久化顺序使用 SQL `ORDER BY "sortOrder" COLLATE "C"`，不拿同一份缓存实体作为数据库正确性的断言依据。

**影响与根因**

新的重排 API 承诺“不连带保存实例上其他未提交的改动”，但它同时把 dirty proxy 当作计算锚点，并触发整行回填。导致成功返回却没有完成移动，最严重的是用户仍在编辑的内容被静默覆盖。本条报告的是**本分支新增排序入口与既有水合行为的错误组合**，不是把既有适配器水合问题冒充独立的新变更。

**修复方向与缺失测试**

排序计算、相邻校验、目标组和零写判定应使用事务内持久化行快照，不能借用带本地编辑的 proxy。提交后的写回只推进实际写入字段的基线，并保留其他 dirty 字段。不能用“强制 replace 实体”消除脏键误判，否则会加重编辑丢失。将上述 3 条真实适配器回归保留，并断言 title 之后仍可 `save()` 落库。

### R02 [P2]：混合批量写入没有预留同批显式键，自动生成重复键

**位置与证据**

- [`appendRowsOf`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/sortable/sortable-mutations.ts)：仅收集缺键创建及需要自动改组的更新，排除了本批显式键。
- [`appendToGroup`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/sortable/sortable.utils.ts)：先读尚未写入本批数据的数据库尾键，再生成自动键。

  ```ts
  const tail = await readTailRow(repository, rules);
  const keys = generateKeysBetween((tail?.sortOrder as SortOrderKey | undefined) ?? null, null, rows.length);
  ```

**真实复现：空库、同一实体类型、同一排序域**

```ts
const explicit = new SortableItem({ title: 'explicit', sortOrder: 'a0' });
const missing = new SortableItem({ title: 'missing' });
await db.entityManager.saveMany([explicit, missing]);
```

持久化结果：

```text
explicit  a0
missing   a0
```

缺键行应追加到本批写入后的组尾；实际引擎自动生成了与同批显式键相同的键。用户没有显式传入两个重复键，不能归因于调用方脏数据。

**影响与根因**

自动写入破坏 [`US-028“排序键不变量”`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/stories/core/US-028-sortable-entity.md) 中的域内严格递增约定。重复键可暂由 id 打破显示顺序平局，但不能恢复键的严格递增；把重复键行用作两个邻居时，`placeBetweenNeighbors` 会报 `corruptAnchor`。

现有混合批次测试只让显式键位于旧尾键之前，未覆盖空库或同批显式键与自动键碰撞。真实共享套件覆盖了显式创建和缺键批写，但没有把二者放进同一批。

**修复方向与缺失测试**

在生成自动键前，把同一事务中本批即将写入目标域的显式创建/更新纳入排序快照或键预留；显式键仍原样保留，自动键须在最终目标组尾之后且不碰撞。补空组/非空组、显式创建+缺键创建、显式改组+自动改组、跨组混排的真实适配器用例。

### R03 [P2]：失败事务留下自动键，修正数据后重试绕过追加

**位置与证据**

- [`appendToGroup`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/sortable/sortable.utils.ts)：在数据库写入成功前原地赋键。

  ```ts
  rows.forEach(({ row }, index) => {
    row.sortOrder = keys[index];
  });
  ```

- [`Repository.#createAppended`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/repository/Repository.ts)：先改调用方实体，再执行 `repository.create(entity)`。失败时没有恢复自动赋键前的值与属性存在性。
- [`appendBatchSortOrders`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/sortable/sortable-mutations.ts) 也使用相同的原地赋键机制；**本次动态复现的是单条 create**，批量失败的对称回归仍应补齐。

**真实复现**

```ts
const retry = new SortableItem(); // title 是必填字段，此次创建失败
await expect(repository.create(retry)).rejects.toThrow();
// 实测 retry.sortOrder 已变为 'a0'，但库中创建已回滚
const other = new SortableItem({ title: 'other' });
await repository.create(other);
retry.title = 'retry';
await repository.create(retry);
```

最终持久化结果：

```text
other  a0
retry  a0
```

**影响与根因**

SQL 事务回滚不等于调用方实体状态回滚。重试时引擎生成的残留键被当成用户显式键，从而跳过追加分配。在失败和重试之间有其他成功写入时，正常的修正后重试会污染序列。

**修复方向与缺失测试**

把自动键的发布与事务提交绑定，或在失败时恢复赋键前的属性存在性和值；不能清掉调用方真正传入的显式键。补单条/批量创建失败、跨组更新失败、失败期间其他事务成功后重试、用户显式键不被错误恢复的测试。

### R04 [P2]：多字段分组更新用未提交字段计算目标组

**位置与证据**

- [`regroupRow`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/sortable/sortable.utils.ts)：patch 没有提供的分组字段取实体当前值。

  ```ts
  field in patch ? fieldValue(patch, field) : fieldValue(entity, field)
  ```

- [`Repository.#updateRegrouped`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/repository/Repository.ts)：实际只写调用方 patch 与新键，未写那些本地 dirty 字段。

  ```ts
  return repository.update(entity, { ...patch, [SORT_ORDER_FIELD]: moving.row.sortOrder });
  ```

**真实复现**

定义普通字符串标量字段 `team`、`phase`，实体声明 `manualOrder: { groupBy: ['team', 'phase'] }`。独立 PGlite 库的初始数据：

| title | team | phase | sortOrder |
| --- | --- | --- | --- |
| moving | x | open | a0 |
| target | y | open | a5 |
| other | y | closed | a0 |

```ts
moving.phase = 'closed'; // 未保存，也不在本次 patch 中
await repository.update(moving, { team: 'y' });
```

实测库中 `moving` 为 **`team=y, phase=open, sortOrder=a1`**。`phase` 没被连带保存是正确的，但新键从 `(y,closed)` 的尾键 `a0` 算出；实际落库的 `(y,open)` 组尾是 `a5`，因此 moving 没有追加到实际目标组尾。

**影响与根因**

排序计算的目标组和实际 UPDATE 的目标组不一致。与 R01 不同，本条针对显式 `update(entity, patch)` 的 patch 合成入口，修复不能只调整 `reorder()`。

**修复方向与缺失测试**

以事务内持久化行合并**本次 patch**构造目标组，不读取 patch 外的未提交字段参与分配。补多字段组、只修改一个组字段且另一个有未提交编辑的真实适配器回归，同时断言未指定字段没有落库、新键确实大于实际目标组尾键。

### R05 [P2]：Todo 拖拽只保存下标，列表变化会移动其他行或泄漏异常

**位置与证据**

- [`FixedRowDrag.start` / `#onUp`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/utils/src/@browser/fixed-row-drag.ts)：会话保存开始时的 `fromIndex`、`overIndex` 和 `rowCount`，释放时只回传下标；没有绑定业务主键。
- 三端均把会话中的旧下标应用到**释放时的新列表**：
  - Angular [`TodoPage.start_drag` / `drop_todo`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/modules/angular-todo/todo-page/todo.page.ts)。
  - React [`dropTodo` / `dropTodoRef`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/pages/todo.tsx)。
  - Vue [`startDrag` / `dropTodo`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/pages/TodoPage.vue)。

  Angular 的关键路径为：

  ```ts
  const ids = this.todo_resource.value().map(todo => todo.id);
  const target = reorderTargetForMove(ids, from, to);
  ```

  上述换算在 `try/catch` 之前，而事件回调使用 `void this.drop_todo(from, to)`。React/Vue 也采用相同顺序。

**复现 A：活列表插入后移动了错误行**

1. 初始列表 `[a,b,c]`，从下标 1 按下拖拽手柄，用户拖的是 b。
2. 拖拽尚未结束时，resource 更新成 `[x,a,b,c]`。
3. 释放到下标 2。
4. 真实 `FixedRowDrag` + Angular 页面 controller 实测调用为：

   ```text
   reorder("a", { prevId: "b", nextId: "c" })
   ```

移动了 a，不是 b。邻居相邻校验不能修复此问题，因为传入的“移动 a 到 b/c 之间”本身可以是合法意图。

**复现 B：列表缩短后的落点入口抛出异常**

从 `[a,b,c]` 下标 2 起拖，将 resource 更新为 `[a,b]`，再调用 `drop_todo(2,0)`，Promise 实测拒绝：

```text
RangeError: 拖放下标越界：from=2 to=0 length=2
```

换算发生在错误显示的 catch 之外。正常事件回调又丢弃 Promise，因此异常能够传播为未处理拒绝，而不是页面内的“排序保存失败”。

**验证边界与根因**

两条动态回归在 Angular 执行，原有 13 条页面测试仍通过；React/Vue 的同类风险依据上述相同状态/回调路径静态确认，**没有声称在另外两端浏览器动态复现**。本次第二条用例直接验证落点入口的 Promise 拒绝，未把它描述成已经采集到的浏览器 `unhandledrejection` 事件。

只在开始拖拽时检查可拖条件，不会自动取消已开始的会话；卸载时 dispose 也不能处理活查询插入/删除、组切换或排序变化。

**修复方向与缺失测试**

三端统一绑定拖拽会话的移动 id 与排序域，或在 id 序列/组/查询发生变化时调用共享的 `cancel()`。过期落点必须明确结束会话且不写库；不要用钳制下标或换成当前下标对应行的 fallback 掩盖问题。把落点换算纳入受控的错误生命周期，并补插入、删除、切 tab、加载重查、排序域变化的三端回归。

### R06 [P2]：本分支新增 11 条 ESLint 警告，零警告门禁失败

**证据与范围**

执行 `nx affected -t lint --base=main --head=HEAD --max-warnings=0`，**71 个项目中 67 个通过、4 个失败**：

| 失败 target | 本分支新增 | 既有问题的区分 |
| --- | --- | --- |
| `rxdb-model-vue:lint` | 2 条 `vue/attributes-order` | `EntityList.vue` 的 `reorderError` 告警和 `queryTableRef` 新属性；该包其他 260 条警告不计为本分支发现 |
| `dev-rxdb-angular-e2e:lint` | 3 条 | 新 Todo 排序测试文件，2 条 `playwright/expect-expect`、1 条 `playwright/no-conditional-in-test` |
| `dev-rxdb-react-e2e:lint` | 3 条 | 同上 |
| `dev-rxdb-vue-e2e:lint` | 3 条 | 同上；另有未改动的 `shared-page-tests.ts` 中 2 条既有重复标题警告，不计为新增 |

代码锚点：

- [`EntityList.vue` 的 `reorderError` 模板与 `queryTableRef`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-vue/src/entity-list/EntityList.vue)：`v-if` 放在 `class` 之后，`ref` 放在事件属性之后。
- [`todo-sort.spec.ts` 的“完成的行…”、“全选…”、“贴着视口下沿…”测试](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-angular-e2e/src/todo-sort.spec.ts)：Angular 警告在 107、127、149 行；[React](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react-e2e/src/todo-sort.spec.ts) / [Vue](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue-e2e/src/todo-sort.spec.ts) 在 106、126、148 行。

对修改过的 Vue 文件，另用当前未改动的 ESLint 配置对 `git show main:<文件>` 的原文本执行 `ESLint.lintText`：`EntityList` 54 → 56 条，`EntityTable` 5 → 5 条，`QueryTable` 2 → 2 条；结合 diff 确认新旧归属。进程级 `NO_COLOR/FORCE_COLOR` 提示不计为 ESLint 发现。

**修复方向**

调整新模板属性顺序；让 E2E 的断言辅助函数被规则正确识别或保留明确的就地断言，把条件式轮询逻辑整理进职责明确的辅助函数。**两条 `expect-expect` 告警不意味着测试事实上没有断言**，现有 `expectOrder()` 本身含断言，问题是当前 lint 规则未识别调用。不要禁用规则或忽略警告。新增警告修完后仍需单独处理或明确跟踪既有警告，不能宣称本分支已达到零警告门禁。

## 3. 三框架对称与其他审查结论

以下为本次新增功能的接口核对，不等于全仓三端导出完全相同，也不等于浏览器 E2E 已通过。

| 功能/接口 | Angular | React | Vue | 结论 |
| --- | --- | --- | --- | --- |
| EntityTable 行拖开关 | `rowDragEnabled` | `rowDragEnabled` | `rowDragEnabled` | 三端具备 |
| EntityTable 行移动事件 | `rowMoved` | `onRowMoved` | `rowMoved` | 命名符合各框架约定，语义一致 |
| QueryTable 转发行移动 | `rowMoved` | `onRowMoved` | `rowMoved` | 三端具备 |
| EntityTable / QueryTable 恢复记录 | `restoreRecords` | `restoreRecords` | `restoreRecords` | 三端公开入口具备 |
| EntityList 门禁、默认排序、保存/恢复 | 共享 helpers | 共享 helpers | 共享 helpers | 未发现单端漏实现 |
| Todo 按 completed 分组拖拽 | Task + FixedRowDrag | Task + FixedRowDrag | Task + FixedRowDrag | 同功能，但共同存在 R05 |

接口证据：三个模型包的公开 index 和 EntityTable/QueryTable 组件均已检查；共享事件与恢复原语来自 [`table-row-move.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts)，列表门禁与提交编排来自 [`canReorderEntityList` / `defaultListOrderBy` / `commitRowMove`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model/src/entity-list/manual-order-list.ts)。组件文件链接见附录。

同时核对了以下边界，没有足够证据把它们列成额外缺陷：

- **显式 opt-in 与查询兼容**：[`normalizeManualOrderBy`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/sortable/sortable.utils.ts) 尊重调用方显式 orderBy；只启用手动排序的实体获得默认顺序。没有把恰好存在 sortOrder 字段的普通实体自动迁入。
- **PGlite 码点序**：[`manual_order_collate` / `build_order_by` / `get_field_sql`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-adapter-pglite/src/query/query_sql.ts) 与新增 SQL/共享契约测试覆盖排序、比较条件和游标路径。本次跑了相关适配器测试，未额外建立非默认 locale 的数据库，不能声称所有 locale 组合已验证。
- **树类型兼容**：[`ISortableTreeEntity`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts) 使用核心 SortOrderKey，仍保留可空形状；[`sortable-type-source.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-plugin-tree/src/__tests__/contracts/sortable-type-source.spec.ts) 守住唯一来源与依赖方向。树运行时迁移被明确拆给 [US-031](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/stories/core/US-031-tree-sortable-migration.md)，不是本分支漏加 manualOrder。
- **Task/Todo 切换**：[`Task`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/entities/Task.ts) 是 US-028 的专用模型；[US-028](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/stories/core/US-028-sortable-entity.md) 明确保留旧 Todo 以免改变远端契约。桌面注册、工作树表名与失败归档断言已随 Task 对齐。未把该已声明的模型切换伪装成意外迁移 bug。
- **发布契约**：[`rxdb-test/package.json`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/package.json)、[`verify-public-contract.mjs`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/scripts/verify-public-contract.mjs) 与 consumer/baseline 添加 sortable 子路径；相关构建依赖任务成功。但没有单独执行全仓 API surface 审计，静态看过基线不等于该审计已绿。
- **模型根导出差异**：Angular/Vue 既有的共享模型再导出路径与 React 不完全相同，本次新增功能的运行入口已对齐。没有仅凭各框架 index 文本不同就制造一个新增缺失发现。

## 4. 验证记录

环境：Node **26.7.0**、pnpm **10.33.0**、Nx **23.2.1**、Vitest **4.1.11**。相关任务串行执行；使用 `--skipRemoteCache` 避免 Nx Cloud 额度限制影响本地结果。

### 4.1 分支已有测试：通过

在仓库根目录执行：

```bash
NX_DAEMON=false pnpm nx run-many -t test \
  -p rxdb rxdb-model rxdb-test utils rxdb-adapter-pglite \
     rxdb-adapter-sqlite-wasm rxdb-model-angular rxdb-model-react \
     rxdb-model-vue angular-todo dev-rxdb-angular dev-rxdb-react dev-rxdb-vue \
  --run --parallel=1 --skipRemoteCache --skipNxCache
```

**退出码 0：13 个 test 项目及其 79 个依赖任务，共 92 个 Nx 任务成功**，耗时约 7 分 46 秒。依赖任务包含相应 build/typecheck、PGlite test-node 和 Angular spec-typecheck；这不是“所有受影响项目所有 target 全通过”。成功任务的详细用例数未全部输出，因此不编造总用例数。

补跑：

```bash
NX_DAEMON=false pnpm nx run rxdb-plugin-tree:test \
  --run --skipRemoteCache --skipNxCache --outputStyle=static
NX_DAEMON=false pnpm nx run rxdb-test:coverage-acceptance \
  --skipRemoteCache --skipNxCache --outputStyle=static
```

- tree：**2 个测试文件、7 条测试通过**，target 及 3 个依赖任务成功。
- rxdb-test 覆盖率验收：合并报告 **29 个文件、304 条测试通过**；target 及 4 个依赖任务成功。
- rxdb-test canonical 覆盖率：statements **94.94%**、branches **93.78%**、functions **87.57%**、lines **96.16%**。数字只属于 rxdb-test，不外推为所有核心包覆盖率。

### 4.2 审查新增边界复现：失败，已清理临时测试

真实 PGlite 的临时用例复用了公开 SortableItem 夹具，另定义双字段分组实体，内存建库、每例断连；持久化数据直接通过 rawQuery 读取。执行命令：

```bash
RXDB_PGLITE_TEST_FILE=src/__tests__/review-us028-repro.spec.ts \
NX_DAEMON=false pnpm nx run rxdb-adapter-pglite:test \
  --run src/__tests__/review-us028-repro.spec.ts --browser.enabled=false \
  --skipRemoteCache --excludeTaskDependencies --outputStyle=static
```

**6 / 6 失败**，分别对应 R01 的 3 条、R02/R03/R04 各 1 条。失败是上文列出的断言不满足，不是连接、SQL namespace、编译或 Nx Cloud 错误。早期复现中修正过夹具 schema 引用，此处只记录正确 schema 版本重跑的结果。

在现有 Angular Todo spec 中临时追加列表变化回归，执行：

```bash
NX_DAEMON=false pnpm nx run angular-todo:test \
  --run todo-page/todo.page.spec.ts --coverage=false \
  --skipRemoteCache --excludeTaskDependencies --outputStyle=static
```

**原有 13 条通过，新增 2 条失败**，对应 R05。该验证采用真实 FixedRowDrag 和页面 controller，resource/repository 为现有测试 harness 的 mock；不是端到端真实数据库验证。

临时 PGlite 测试文件已删除，Angular spec 已完整恢复。上文的输入、关键操作及实测输出是长期复验依据；本次没有把修复或新增业务测试混入评审报告交付。

### 4.3 零警告 lint：失败

```bash
NX_DAEMON=false pnpm nx affected -t lint --base=main --head=HEAD \
  --parallel=1 --skipRemoteCache --skipNxCache --max-warnings=0 \
  --outputStyle=static
```

**退出码 1：71 个项目，4 个失败**，详见 R06。总共 273 条 ESLint 警告，其中 11 条可归因于本分支，262 条属于既有问题；没有 ESLint error。新增和既有问题都能让当前零警告门禁失败，但不能混为同一批新增发现。

### 4.4 未执行与非业务失败的说明

- 未执行完整 `pnpm test-all`，未执行三端 Playwright E2E，也未做 Electron/Tauri 的运行时验证。
- 未执行全仓独立 API surface 审计；发布契约脚本随相关 build 被执行，与全仓 API 审计不是同一件事。
- 没有额外跑三端模型的独立覆盖率门禁，不能宣称全部核心包 ≥90%。
- 早期仅选排序子集运行时，rxdb 的全包默认 90% 覆盖率阈值导致该次退出非零；测试子集稀释全包覆盖率，不作为新增业务缺陷，也不拿它代替后续完整 rxdb:test 的成功结果。
- 本报告基于上面固定的 HEAD；后续修复或 main 推进后需要重新验证，不能沿用此处通过标记。

## 5. 修复验收清单

先写红测试，再修实现；不要靠 fallback、吞异常、禁用 lint 规则或者降低门禁掩盖缺陷。

- [ ] **R01**：真实适配器下重排读取持久化锚点；移动行和邻居有未提交排序键仍正确移动；其他未提交字段保留且之后可保存。
- [ ] **R02**：同一批显式/自动键混合时不碰撞；新自动键追加到实际目标域尾，显式键原样保留。
- [ ] **R03**：失败回滚恢复自动键分配状态；其他写入完成后的重试重新分配；单条与批量对称。
- [ ] **R04**：多字段分组以持久化快照 + 本次 patch 计算目标组；patch 外本地编辑不被使用或落库。
- [ ] **R05**：三端在拖拽中插入/删除/切组/重查时，保持移动主键或取消会话；过期落点零写且无未处理拒绝。
- [ ] **R06**：新增 11 条警告全部消除，既有警告另行处理或跟踪；达到零警告后才记录 lint 通过。
- [ ] 串行复跑相关真实适配器和三端单测，再执行三端 E2E 及完整 affected 门禁；假失败先单目标串行复跑。

## 解决记录

- [ ] 开 PR 修复；`pr` 字段记录修复链接。
- [ ] 逐条复验以上问题，删除已解决条目；全部清空后按 reviews 目录约定清理报告并更新索引。

## 附录：原始变更文件清单

下面只记录被评审 HEAD 相对 main 的 145 个变更文件，不含本报告新增文件。A/M 为新增/修改；行数来自 `git diff --numstat main...HEAD`。文件按评审区域分组，测试、配置、文档和 API 基线也包含在内。

### 排序核心（17 个文件）

| 文件 | 变更 | 新增 / 删除 |
| --- | --- | ---: |
| [`packages/rxdb/src/__tests__/sortable/fixtures/sortable-test-utils.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/__tests__/sortable/fixtures/sortable-test-utils.ts) | A | +58 / -0 |
| [`packages/rxdb/src/__tests__/sortable/manual-order-group-metadata.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/__tests__/sortable/manual-order-group-metadata.spec.ts) | A | +151 / -0 |
| [`packages/rxdb/src/__tests__/sortable/manual-order-group.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/__tests__/sortable/manual-order-group.spec.ts) | A | +443 / -0 |
| [`packages/rxdb/src/__tests__/sortable/manual-order-metadata.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/__tests__/sortable/manual-order-metadata.spec.ts) | A | +118 / -0 |
| [`packages/rxdb/src/__tests__/sortable/manual-order-move.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/__tests__/sortable/manual-order-move.spec.ts) | A | +36 / -0 |
| [`packages/rxdb/src/__tests__/sortable/manual-order-primary.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/__tests__/sortable/manual-order-primary.spec.ts) | A | +197 / -0 |
| [`packages/rxdb/src/__tests__/sortable/manual-order-repository.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/__tests__/sortable/manual-order-repository.spec.ts) | A | +407 / -0 |
| [`packages/rxdb/src/entity/entity-manager.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/entity/entity-manager.ts) | M | +46 / -8 |
| [`packages/rxdb/src/entity/entity-options.interface.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/entity/entity-options.interface.ts) | M | +37 / -0 |
| [`packages/rxdb/src/entity/metadata-transition.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/entity/metadata-transition.ts) | M | +4 / -1 |
| [`packages/rxdb/src/entity/metadata-validate.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/entity/metadata-validate.ts) | M | +109 / -2 |
| [`packages/rxdb/src/index.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/index.ts) | M | +15 / -0 |
| [`packages/rxdb/src/repository/Repository.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/repository/Repository.ts) | M | +137 / -7 |
| [`packages/rxdb/src/sortable/sortable-error.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/sortable/sortable-error.ts) | A | +56 / -0 |
| [`packages/rxdb/src/sortable/sortable-mutations.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/sortable/sortable-mutations.ts) | A | +89 / -0 |
| [`packages/rxdb/src/sortable/sortable.interface.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/sortable/sortable.interface.ts) | A | +99 / -0 |
| [`packages/rxdb/src/sortable/sortable.utils.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb/src/sortable/sortable.utils.ts) | A | +487 / -0 |

### 适配器（5 个文件）

| 文件 | 变更 | 新增 / 删除 |
| --- | --- | ---: |
| [`packages/rxdb-adapter-pglite/src/__tests__/manual-order-contract.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-adapter-pglite/src/__tests__/manual-order-contract.spec.ts) | A | +34 / -0 |
| [`packages/rxdb-adapter-pglite/src/__tests__/query/manual-order-collate.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-adapter-pglite/src/__tests__/query/manual-order-collate.spec.ts) | A | +157 / -0 |
| [`packages/rxdb-adapter-pglite/src/query/query_sql.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-adapter-pglite/src/query/query_sql.ts) | M | +32 / -4 |
| [`packages/rxdb-adapter-pglite/vite.config.mts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-adapter-pglite/vite.config.mts) | M | +1 / -0 |
| [`packages/rxdb-adapter-sqlite-wasm/src/__tests__/manual-order-contract.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-adapter-sqlite-wasm/src/__tests__/manual-order-contract.spec.ts) | A | +38 / -0 |

### 模型四包（31 个文件）

| 文件 | 变更 | 新增 / 删除 |
| --- | --- | ---: |
| [`packages/rxdb-model-angular/src/__tests__/entity-list/entity-list.real.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-angular/src/__tests__/entity-list/entity-list.real.spec.ts) | M | +227 / -7 |
| [`packages/rxdb-model-angular/src/__tests__/entity-table/entity-table/entity-table.component.real.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-angular/src/__tests__/entity-table/entity-table/entity-table.component.real.spec.ts) | M | +92 / -5 |
| [`packages/rxdb-model-angular/src/__tests__/entity-table/query-table/query-table.component.real.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-angular/src/__tests__/entity-table/query-table/query-table.component.real.spec.ts) | M | +26 / -8 |
| [`packages/rxdb-model-angular/src/__tests__/testing/fake-vtable.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-angular/src/__tests__/testing/fake-vtable.ts) | M | +30 / -0 |
| [`packages/rxdb-model-angular/src/entity-list/entity-list.component.html`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-angular/src/entity-list/entity-list.component.html) | M | +6 / -0 |
| [`packages/rxdb-model-angular/src/entity-list/entity-list.component.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-angular/src/entity-list/entity-list.component.ts) | M | +72 / -10 |
| [`packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-angular/src/entity-table/entity-table/entity-table.component.ts) | M | +43 / -3 |
| [`packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.html`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.html) | M | +2 / -0 |
| [`packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-angular/src/entity-table/query-table/query-table.component.ts) | M | +10 / -1 |
| [`packages/rxdb-model-react/src/__tests__/entity-list/entity-list.real.spec.tsx`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-react/src/__tests__/entity-list/entity-list.real.spec.tsx) | M | +210 / -6 |
| [`packages/rxdb-model-react/src/__tests__/entity-table/entity-table.real.spec.tsx`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-react/src/__tests__/entity-table/entity-table.real.spec.tsx) | M | +87 / -6 |
| [`packages/rxdb-model-react/src/__tests__/entity-table/query-table.real.spec.tsx`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-react/src/__tests__/entity-table/query-table.real.spec.tsx) | M | +23 / -8 |
| [`packages/rxdb-model-react/src/__tests__/testing/fake-vtable.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-react/src/__tests__/testing/fake-vtable.ts) | M | +25 / -0 |
| [`packages/rxdb-model-react/src/entity-list/entity-list.tsx`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-react/src/entity-list/entity-list.tsx) | M | +93 / -14 |
| [`packages/rxdb-model-react/src/entity-table/entity-table.tsx`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-react/src/entity-table/entity-table.tsx) | M | +48 / -5 |
| [`packages/rxdb-model-react/src/entity-table/query-table.tsx`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-react/src/entity-table/query-table.tsx) | M | +14 / -1 |
| [`packages/rxdb-model-vue/src/__tests__/entity-list/entity-list.real.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-vue/src/__tests__/entity-list/entity-list.real.spec.ts) | M | +216 / -6 |
| [`packages/rxdb-model-vue/src/__tests__/entity-table/entity-table.real.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-vue/src/__tests__/entity-table/entity-table.real.spec.ts) | M | +86 / -5 |
| [`packages/rxdb-model-vue/src/__tests__/entity-table/query-table.real.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-vue/src/__tests__/entity-table/query-table.real.spec.ts) | M | +19 / -8 |
| [`packages/rxdb-model-vue/src/__tests__/testing/fake-vtable.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-vue/src/__tests__/testing/fake-vtable.ts) | M | +30 / -0 |
| [`packages/rxdb-model-vue/src/entity-list/EntityList.vue`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-vue/src/entity-list/EntityList.vue) | M | +84 / -12 |
| [`packages/rxdb-model-vue/src/entity-table/EntityTable.vue`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-vue/src/entity-table/EntityTable.vue) | M | +44 / -5 |
| [`packages/rxdb-model-vue/src/entity-table/QueryTable.vue`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model-vue/src/entity-table/QueryTable.vue) | M | +16 / -3 |
| [`packages/rxdb-model/src/__tests__/entity-list/manual-order-list.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model/src/__tests__/entity-list/manual-order-list.spec.ts) | A | +183 / -0 |
| [`packages/rxdb-model/src/__tests__/entity-table/vtable/table-operations.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model/src/__tests__/entity-table/vtable/table-operations.spec.ts) | M | +26 / -0 |
| [`packages/rxdb-model/src/__tests__/entity-table/vtable/table-row-move.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model/src/__tests__/entity-table/vtable/table-row-move.spec.ts) | A | +97 / -0 |
| [`packages/rxdb-model/src/entity-list/manual-order-list.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model/src/entity-list/manual-order-list.ts) | A | +159 / -0 |
| [`packages/rxdb-model/src/entity-table/index.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model/src/entity-table/index.ts) | M | +7 / -1 |
| [`packages/rxdb-model/src/entity-table/vtable/table-operations.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model/src/entity-table/vtable/table-operations.ts) | M | +40 / -0 |
| [`packages/rxdb-model/src/entity-table/vtable/table-row-move.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model/src/entity-table/vtable/table-row-move.ts) | A | +122 / -0 |
| [`packages/rxdb-model/src/index.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-model/src/index.ts) | M | +4 / -0 |

### utils（5 个文件）

| 文件 | 变更 | 新增 / 删除 |
| --- | --- | ---: |
| [`packages/utils/src/@browser/fixed-row-drag.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/utils/src/@browser/fixed-row-drag.ts) | A | +155 / -0 |
| [`packages/utils/src/@browser/index.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/utils/src/@browser/index.ts) | M | +5 / -0 |
| [`packages/utils/src/__tests__/@browser/fixed-row-drag.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/utils/src/__tests__/@browser/fixed-row-drag.spec.ts) | A | +141 / -0 |
| [`packages/utils/src/__tests__/indexing/fractional-indexing.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/utils/src/__tests__/indexing/fractional-indexing.spec.ts) | M | +97 / -1 |
| [`packages/utils/src/indexing/fractional-indexing.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/utils/src/indexing/fractional-indexing.ts) | M | +46 / -0 |

### tree 类型（2 个文件）

| 文件 | 变更 | 新增 / 删除 |
| --- | --- | ---: |
| [`packages/rxdb-plugin-tree/src/__tests__/contracts/sortable-type-source.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-plugin-tree/src/__tests__/contracts/sortable-type-source.spec.ts) | A | +65 / -0 |
| [`packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts) | M | +6 / -2 |

### rxdb-test（18 个文件）

| 文件 | 变更 | 新增 / 删除 |
| --- | --- | ---: |
| [`packages/rxdb-test/entities/Task.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/entities/Task.ts) | A | +22 / -0 |
| [`packages/rxdb-test/entities/index.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/entities/index.ts) | M | +3 / -0 |
| [`packages/rxdb-test/package.json`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/package.json) | M | +5 / -0 |
| [`packages/rxdb-test/public-contract/baseline.json`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/public-contract/baseline.json) | M | +8 / -0 |
| [`packages/rxdb-test/public-contract/consumer.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/public-contract/consumer.ts) | M | +40 / -1 |
| [`packages/rxdb-test/scripts/verify-public-contract.mjs`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/scripts/verify-public-contract.mjs) | M | +1 / -0 |
| [`packages/rxdb-test/src/__tests__/index.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/src/__tests__/index.spec.ts) | M | +7 / -0 |
| [`packages/rxdb-test/src/__tests__/published-model-invariants.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/src/__tests__/published-model-invariants.spec.ts) | M | +1 / -1 |
| [`packages/rxdb-test/src/__tests__/task-model.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/src/__tests__/task-model.spec.ts) | A | +37 / -0 |
| [`packages/rxdb-test/src/sortable/fixtures.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/src/sortable/fixtures.ts) | A | +97 / -0 |
| [`packages/rxdb-test/src/sortable/index.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/src/sortable/index.ts) | A | +20 / -0 |
| [`packages/rxdb-test/src/sortable/manual-order-group.suite.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/src/sortable/manual-order-group.suite.ts) | A | +335 / -0 |
| [`packages/rxdb-test/src/sortable/manual-order.suite.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/src/sortable/manual-order.suite.ts) | A | +281 / -0 |
| [`packages/rxdb-test/src/sortable/transaction-barrier.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/src/sortable/transaction-barrier.ts) | A | +36 / -0 |
| [`packages/rxdb-test/src/sortable/types.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/src/sortable/types.ts) | A | +35 / -0 |
| [`packages/rxdb-test/vite.config.mts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/vite.config.mts) | M | +2 / -1 |
| [`packages/rxdb-test/vitest.coverage-acceptance.merge.config.mts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/vitest.coverage-acceptance.merge.config.mts) | M | +4 / -0 |
| [`packages/rxdb-test/vitest.coverage-acceptance.pglite.config.mts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/packages/rxdb-test/vitest.coverage-acceptance.pglite.config.mts) | M | +12 / -5 |

### demo 与 Todo（36 个文件）

| 文件 | 变更 | 新增 / 删除 |
| --- | --- | ---: |
| [`apps/dev-rxdb-angular/src/app/pages/entity/entity-list.page.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-angular/src/app/pages/entity/entity-list.page.ts) | M | +24 / -1 |
| [`apps/dev-rxdb-angular/src/app/pages/entity/entity-pages-construction.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-angular/src/app/pages/entity/entity-pages-construction.spec.ts) | M | +7 / -1 |
| [`apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.gd.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.gd.spec.ts) | M | +1 / -0 |
| [`apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.gd.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.gd.ts) | M | +2 / -1 |
| [`apps/dev-rxdb-react/src/app/hooks/useFileManagerLazyStore.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/hooks/useFileManagerLazyStore.spec.ts) | M | +2 / -1 |
| [`apps/dev-rxdb-react/src/app/hooks/useFileManagerLazyStore.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/hooks/useFileManagerLazyStore.ts) | M | +5 / -4 |
| [`apps/dev-rxdb-react/src/app/hooks/useFileManagerStore.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/hooks/useFileManagerStore.ts) | M | +3 / -10 |
| [`apps/dev-rxdb-react/src/app/hooks/useTreeMenuLazyStore.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/hooks/useTreeMenuLazyStore.spec.ts) | M | +2 / -1 |
| [`apps/dev-rxdb-react/src/app/hooks/useTreeMenuStore.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/hooks/useTreeMenuStore.ts) | M | +2 / -1 |
| [`apps/dev-rxdb-react/src/app/pages/entities/entity-list-page.tsx`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/pages/entities/entity-list-page.tsx) | M | +14 / -2 |
| [`apps/dev-rxdb-react/src/app/pages/entities/entity-pages-construction.spec.tsx`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/pages/entities/entity-pages-construction.spec.tsx) | M | +17 / -0 |
| [`apps/dev-rxdb-react/src/app/pages/menu/tree-menu-simple.tsx`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/pages/menu/tree-menu-simple.tsx) | M | +2 / -3 |
| [`apps/dev-rxdb-react/src/app/pages/menu/tree-menu-virtual.tsx`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/pages/menu/tree-menu-virtual.tsx) | M | +2 / -3 |
| [`apps/dev-rxdb-react/src/app/pages/todo.tsx`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/pages/todo.tsx) | M | +107 / -18 |
| [`apps/dev-rxdb-react/src/app/pages/working-tree/utils/gd.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/pages/working-tree/utils/gd.spec.ts) | M | +1 / -0 |
| [`apps/dev-rxdb-react/src/app/pages/working-tree/utils/gd.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/pages/working-tree/utils/gd.ts) | M | +2 / -1 |
| [`apps/dev-rxdb-react/src/app/utils/sort-order.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/utils/sort-order.spec.ts) | A | +25 / -0 |
| [`apps/dev-rxdb-react/src/app/utils/sort-order.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react/src/app/utils/sort-order.ts) | A | +19 / -0 |
| [`apps/dev-rxdb-vue/src/app/composables/useFileManagerLazyStore.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/app/composables/useFileManagerLazyStore.ts) | M | +5 / -4 |
| [`apps/dev-rxdb-vue/src/app/composables/useFileManagerStore.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/app/composables/useFileManagerStore.ts) | M | +3 / -10 |
| [`apps/dev-rxdb-vue/src/app/composables/useTreeMenuLazyStore.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/app/composables/useTreeMenuLazyStore.ts) | M | +2 / -3 |
| [`apps/dev-rxdb-vue/src/app/composables/useTreeMenuStore.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/app/composables/useTreeMenuStore.ts) | M | +3 / -10 |
| [`apps/dev-rxdb-vue/src/app/utils/sort-order.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/app/utils/sort-order.spec.ts) | A | +25 / -0 |
| [`apps/dev-rxdb-vue/src/app/utils/sort-order.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/app/utils/sort-order.ts) | A | +19 / -0 |
| [`apps/dev-rxdb-vue/src/app/utils/tree-menu.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/app/utils/tree-menu.ts) | M | +2 / -1 |
| [`apps/dev-rxdb-vue/src/pages/TodoPage.vue`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/pages/TodoPage.vue) | M | +100 / -16 |
| [`apps/dev-rxdb-vue/src/pages/entities/EntityListPage.vue`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/pages/entities/EntityListPage.vue) | M | +15 / -0 |
| [`apps/dev-rxdb-vue/src/pages/entities/entity-pages-construction.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/pages/entities/entity-pages-construction.spec.ts) | M | +20 / -4 |
| [`apps/dev-rxdb-vue/src/pages/menu/TreeMenuSimplePage.vue`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/pages/menu/TreeMenuSimplePage.vue) | M | +2 / -3 |
| [`apps/dev-rxdb-vue/src/pages/menu/TreeMenuVirtualPage.vue`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/pages/menu/TreeMenuVirtualPage.vue) | M | +2 / -3 |
| [`apps/dev-rxdb-vue/src/pages/working-tree/utils/gd.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/pages/working-tree/utils/gd.spec.ts) | M | +1 / -0 |
| [`apps/dev-rxdb-vue/src/pages/working-tree/utils/gd.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue/src/pages/working-tree/utils/gd.ts) | M | +2 / -1 |
| [`modules/angular-todo/todo-page/todo.page.html`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/modules/angular-todo/todo-page/todo.page.html) | M | +31 / -2 |
| [`modules/angular-todo/todo-page/todo.page.scss`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/modules/angular-todo/todo-page/todo.page.scss) | M | +13 / -0 |
| [`modules/angular-todo/todo-page/todo.page.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/modules/angular-todo/todo-page/todo.page.spec.ts) | M | +86 / -11 |
| [`modules/angular-todo/todo-page/todo.page.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/modules/angular-todo/todo-page/todo.page.ts) | M | +86 / -20 |

### 桌面注册（5 个文件）

| 文件 | 变更 | 新增 / 删除 |
| --- | --- | ---: |
| [`apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts) | M | +2 / -2 |
| [`apps/dev-rxdb-electron/src/app/setup_rxdb_desktop_pglite.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-electron/src/app/setup_rxdb_desktop_pglite.ts) | M | +2 / -2 |
| [`apps/dev-rxdb-electron/src/app/setup_rxdb_wa-sqlite.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-electron/src/app/setup_rxdb_wa-sqlite.ts) | M | +2 / -2 |
| [`apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-tauri/src/app/setup_rxdb_desktop.ts) | M | +2 / -2 |
| [`apps/dev-rxdb-tauri/src/app/setup_rxdb_wa-sqlite.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-tauri/src/app/setup_rxdb_wa-sqlite.ts) | M | +2 / -2 |

### 三端 E2E（10 个文件）

| 文件 | 变更 | 新增 / 删除 |
| --- | --- | ---: |
| [`apps/dev-rxdb-angular-e2e/src/entity-list-sort.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-angular-e2e/src/entity-list-sort.spec.ts) | A | +257 / -0 |
| [`apps/dev-rxdb-angular-e2e/src/failure-archive.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-angular-e2e/src/failure-archive.spec.ts) | M | +6 / -4 |
| [`apps/dev-rxdb-angular-e2e/src/todo-sort.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-angular-e2e/src/todo-sort.spec.ts) | A | +188 / -0 |
| [`apps/dev-rxdb-angular-e2e/src/working-tree.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-angular-e2e/src/working-tree.spec.ts) | M | +3 / -3 |
| [`apps/dev-rxdb-react-e2e/src/entity-list-sort.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react-e2e/src/entity-list-sort.spec.ts) | A | +256 / -0 |
| [`apps/dev-rxdb-react-e2e/src/todo-sort.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react-e2e/src/todo-sort.spec.ts) | A | +187 / -0 |
| [`apps/dev-rxdb-react-e2e/src/working-tree.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-react-e2e/src/working-tree.spec.ts) | M | +3 / -3 |
| [`apps/dev-rxdb-vue-e2e/src/entity-list-sort.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue-e2e/src/entity-list-sort.spec.ts) | A | +256 / -0 |
| [`apps/dev-rxdb-vue-e2e/src/todo-sort.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue-e2e/src/todo-sort.spec.ts) | A | +187 / -0 |
| [`apps/dev-rxdb-vue-e2e/src/working-tree.spec.ts`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/apps/dev-rxdb-vue-e2e/src/working-tree.spec.ts) | M | +3 / -3 |

### 文档、API 与审计（16 个文件）

| 文件 | 变更 | 新增 / 删除 |
| --- | --- | ---: |
| [`README.md`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/README.md) | M | +1 / -1 |
| [`requirements/api-baseline/rxdb-model-angular.json`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/api-baseline/rxdb-model-angular.json) | M | +64 / -0 |
| [`requirements/api-baseline/rxdb-model-react.json`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/api-baseline/rxdb-model-react.json) | M | +64 / -0 |
| [`requirements/api-baseline/rxdb-model-vue.json`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/api-baseline/rxdb-model-vue.json) | M | +64 / -0 |
| [`requirements/api-baseline/rxdb-model.json`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/api-baseline/rxdb-model.json) | M | +64 / -0 |
| [`requirements/api-baseline/rxdb.json`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/api-baseline/rxdb.json) | M | +56 / -0 |
| [`requirements/api-baseline/utils.json`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/api-baseline/utils.json) | M | +16 / -0 |
| [`requirements/epics/epic-004-future-features.md`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/epics/epic-004-future-features.md) | M | +4 / -2 |
| [`requirements/reviews/README.md`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/reviews/README.md) | M | +4 / -0 |
| [`requirements/roadmap.md`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/roadmap.md) | M | +11 / -11 |
| [`requirements/status-overview.md`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/status-overview.md) | M | +9 / -10 |
| [`requirements/stories/core/US-018-generator-default-serialization.md`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/stories/core/US-018-generator-default-serialization.md) | M | +1 / -1 |
| [`requirements/stories/core/US-027-entity-permission-model.md`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/stories/core/US-027-entity-permission-model.md) | M | +2 / -2 |
| [`requirements/stories/core/US-028-sortable-entity.md`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/stories/core/US-028-sortable-entity.md) | M | +310 / -123 |
| [`requirements/stories/core/US-031-tree-sortable-migration.md`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/requirements/stories/core/US-031-tree-sortable-migration.md) | A | +96 / -0 |
| [`scripts/audit/api-surface.mjs`](/Users/jimmy/Documents/aiao/rxdb_ai_doc/scripts/audit/api-surface.mjs) | M | +23 / -1 |
