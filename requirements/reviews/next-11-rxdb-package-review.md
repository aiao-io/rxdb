# next-11 分支 `packages/rxdb` 包评审 · 剩余项

- **原评审**：2026-09-06，`packages/rxdb`（`@aiao/rxdb` 0.0.25），源码 35,416 行 / 213 文件，测试 60,948 行 / 144 spec
- **本次复核**：2026-09-09，逐条对照 HEAD 源码 + 实跑 `nx test rxdb --coverage`
- **修复**：2026-09-09，第 1 块的「空断言」与「绑私有状态」两节已清空。九条用例改成钉行为：`bulk-sync.spec.ts` 的并发组量 `syncRepository` 的在飞峰值，`HistoryManager.spec.ts` 的跳过分支断言「没开 `switchBranch` 事务 + redo 栈原样保留」，`entity-status.spec.ts` 先证缓存在、再证 `modified` 清了它；`setProxyTarget` 改走生产同一个 `setSafeObjectKey`。每条都用变异测试反证过（改实现必红）
- **修复**：2026-09-09，第 4 块的 `reachability` 泄漏已清空。补了终态 `RxDB.destroy()`（断全部适配器 → `syncState.destroy()` → `reachability.destroy()`），与可逆的 `disconnectAll()` 分成两个出口；`init()` 与 `connect()` 各加终态判据（`connect()` 那道必须排在重入缓存**之前**，否则拆卸窗口内会交出一个正要被断开的适配器）。三绑定与 `dev-rxdb-http-server` 的自有实例拆卸改调 `destroy()`。六个变异各自被对应用例咬红
- **结论**：8 条 🔴 全部已修；🟡 的「无兜底」「资源与生命周期」「协议与语义不一致」三节除下方点名者外均已修完。**剩下四块工作 + 一条规格决策**（第 4 块是修第 1 块时新发现的）。

已修的条目连同其修法说明一并删除 —— 那些判据现在都写在代码注释与 TSDoc 里，报告再留一份副本只会随代码漂移。同时删掉两条误报：`rxdb.transaction.ts:68-69` 的裸 `forEach` 是**有意的** fail-fast 契约（`RxDB.spec.ts` 正面守着它，判据已写进 `emitEvent` 的 TSDoc）；`relation-helper.spec.ts:495` 的 `Reflect.set` 不是「改私有字段」，`children$` 是 `relationHelper` 装上去的**公开访问器**，那行 `Reflect.set` 正是被测对象本身——用例要读它的布尔返回值，写成 `owner.children$ = x` 反而是类型错误。

| 剩余块                    | 状态                                        |
| ------------------------- | ------------------------------------------- |
| 1 测试基建残留            | 🟡 进行中（评审列的七项已完成，下方是余量） |
| 2 公共 API 面收敛         | ⬜ 未开始                                   |
| 3 拆长函数                | ⬜ 未开始                                   |
| 4 够不到的 undo/redo 守卫 | ⬜ 未开始（新增，需决策）                   |
| 5 依赖调度器误报          | 🔒 待规格决策，不改代码                     |

---

## 1. 测试基建残留

### 无专属 spec 的活代码（约 2,000 行）

`undo-redo-apply.ts`、`pull-conflict-utils.ts`、`restore-entity.ts`、`pushable-repository-rules.ts`、`rxdb.plugin-lifecycle.ts`、`migration-runner.ts`、`many-to-many-entity.ts`、`json-safe.ts`、`need_refresh_*.ts`（公开导出）；`history-scope-api.ts` 与 `rxdb.transaction.ts` 各只有 1 份。

### 覆盖率缺口（2026-09-09 实测，`stmts / branch`）

整体 95.95 / 91.44 / 97.76 / 96.83，过门禁；低于 90 的文件：

| 文件                        | stmts | branch | 未覆盖                                        |
| --------------------------- | ----- | ------ | --------------------------------------------- |
| `pull.ts`                   | 64.17 | 62.50  | `:82-124`                                     |
| `query-cache-repository.ts` | 66.00 | 62.16  | `:103-152, 262, 284`                          |
| `merge_remove.ts`           | 80.95 | 64.70  | `:30-51`（`find/findOne/get` 的删除刷新分支） |
| `merge_update.ts`           | 81.05 | 82.60  | `:74-75, 265-282`                             |
| `change-codec.ts`           | 83.72 | 76.33  | 版本不匹配与非法输入的抛错路径                |
| `rxdb-adapter.ts`           | 83.33 | 100    | `:112`                                        |
| `history-manager.utils.ts`  | 84.61 | 66.66  | `:20-24`                                      |
| `...d-at.utils.ts`          | 85.71 | 50     | `:24`                                         |
| `bulk-sync.ts`              | 89.58 | 92.30  | `:242-245`                                    |

前两个是同步主干，缺口不小；`change-codec.ts` 漏的恰是最该测的抛错路径。

### 拆卸

`test-db-setup.ts` 的 `cleanup` 已补 `disconnectAll()`，但 18 个文件里的 `new RxDB(` 仍无 after-hook，今天不炸只因 browser mode `isolate:true`。

---

## 2. 公共 API 面收敛（46 条 `export *` 撑出 427 个导出）

- **`any` 泄出**：`proxy.ts:25` 泛型返回类型写成构造器类型，连锁到 `dist/entity/entity-manager.d.ts:59` `createEntityRef(...): any`，`QueryManager.ts:290` 因此要写 `!`。
- **公开签名引用未导出类型**：`EventListener` / `RxDBConfig` / `MergeQueryTaskOptions`（`rxdb.types.ts`）、`QueryManager`（`Repository.queryManager`）、`EntityStatus`、`BulkSyncOptions/Result`、`RepositorySyncStatus`、`DependencyGraph`、`SyncRepositoryOptions/Result`；`VersionManager` / `TreeRepository` 类本身不可具名。
- **死代码进公共面**：`system/types.local.ts` / `types.remote.ts` 整文件零引用（`types.local.ts:105` 「仓库接口继承适配器基类」，`:147` `export declare class` 在运行时模块里导出不存在的类）；`RxDB.ts:1194` 与 `system/types.ts:476` 两处 `declare module '@aiao/rxdb'` 幻影增强，`rxdb.RxDBChange` 类型是类、运行时 `undefined`；`system/types.ts:65,79,216,228` 手写规则联合混入他表字段，`RxDBSync.find({ where: { field: 'parentId' } })` 编译通过运行时撞不存在的列；`version.utils.ts`、`dependency-graph.ts` / `topological-sort.ts` 多个导出只有测试引用。
- **内部实现漏出**：`cleanupExpired(vm,…)` / `syncBranches(vm)` 经 `export *` 公开，而 `index.ts:88-89` 以同样理由拒绝导出 `checkRepositoryUpdates`；`setSafeObjectKey` 系列、`fillDefaultValue`、`getEntityMutations`（参数字段 `need_save_entities` 是 snake_case）全部公开；`QueryTask` 含 `serialize/onClean/depEntityTypeMap` 内部管线整体导出，且已被 `rxdb-plugin-graph` 依赖。
- **命名**：`merge_create.ts` / `need_refresh_*.ts` / `entity_type_dependencies.ts` 与 `merge-update-tree.ts` 两套文件名风格；`query_need_refresh_*` 在 barrel 处改名；`isRuleGroup` 公开的是宽松版，`QueryTask.ts:24` 另有严格私有副本。
- **TSDoc 缺口**：699 个导出声明中 113 个无 TSDoc，集中在 `rxdb-events.ts`（25 个事件常量 + 7 个 `*EventData`）、`rxdb-adapter.ts`（`IRxDBAdapter` 全部成员）、`system/migration.ts`、`property-types.interface.ts`；`entity-base.ts:81-97` 类 TSDoc 写在装饰器之后被挂错位。
- **文档漂移**：`change-codec.ts:270-288` 说「字符串 ID 走原始通道」，代码对所有 id 包信封；`:372` 把 identity 版本塞进 `UnsupportedRxDBChangeVersionError` 的 codec 参数；`VersionManager.ts:640` 示例用不存在的 `pull?.pulled`；`QueryCacheRepository.ts:288` 示例用不存在的 `operator: 'eq'`；`scope-selection.ts:118-119` 指向 private 的 `historyManager`。

**做法**：`index.ts` 改具名导出并补齐上述缺失类型；删 `types.local/remote` 与幻影模块增强；修 `proxy.ts:25` 泛型消掉 `createEntityRef: any`；补 TSDoc。注意这一块会动 `requirements/api-baseline/rxdb.json`，属破坏性变更，须在 PR 说明里逐条列出。

---

## 3. 拆长函数（AGENTS.md 要求嵌套 < 3 层）

| 函数                                                      | 行数 | 备注                                                                                                            |
| --------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------- |
| `pull-batch.ts:141 pullBatchOnce`                         | 265  | 事务回调 100 行                                                                                                 |
| `pull-repository.ts:458 pullSingleRepository`             | 230  | 与上者 `:570-647` / `:297-395` 是同一段逻辑两份手抄                                                             |
| `find-switch-branch-step.ts:61`                           | 205  |                                                                                                                 |
| `HistoryManager.ts:145 constructor`                       | 161  |                                                                                                                 |
| `push-repository.ts:573 planRepositoryPush`               | 145  |                                                                                                                 |
| `metadata-transition.ts:101 transitionMetadata`           | 220  | 4 层                                                                                                            |
| `SchemaManager.ts:58 init`                                | 120  | 4 层，且直接 `push` 进调用方的 `rxdb.config.entities`                                                           |
| `switch-branch-actions.ts:122 get_switch_version_actions` | 100  | `if→for→switch→case→if→if` 6 层                                                                                 |
| `entity_type_dependencies.ts:159 processRules`            | 81   | 7 层，同一段「加 mappedEntity + 中间表」复制三份                                                                |
| `RxDB.ts:593 connect`                                     | 105  | 4 层；`adapter as unknown as RxDBAdapterLocalBase` 后用 `?.()` 对具体方法可选调用，非基类适配器静默跳过系统迁移 |

**做法**：`pullBatchOnce` / `pullSingleRepository` 抽共用 `applyRepoRound`；`get_switch_version_actions` 按 case 拆 `applyForward{Insert,Update,Delete}`；`transitionMetadata` / `SchemaManager.init` / `RxDB.connect` 各拆三段。`RxDB.connect` 的那个 `?.()` 顺带一起处理——它是「非基类适配器静默跳过系统迁移」的兜底，属铁律违反。

---

## 4. `invalidateRedoStack` 开头那道守卫从任何公开入口都够不到

- **文件**：`packages/rxdb/src/version/HistoryManager.ts:486-487`
- **现象**：`invalidateRedoStack()` 开头查 `isUndoRedoInProgress || isInvalidatingRedo` 就返回。但这两个标志只由 `applyUndoRedoHistories` / `invalidateRedoStack` 自己在**同一个序列化任务内部**置起再复位，而三个入口（`history-scope-api.ts:157,176` 的 undo/redo、`HistoryManager.ts:486` 的 invalidateRedoStack）全都排进 `#runSerialized`，任务之间不重叠 —— 于是这条分支永远走不到。「持着 undo 不放再去 invalidate」也不成立：后者只会排在 undo 后面，轮到它时标志已复位。
- **判据**：真正生效的那道守卫在调用方 `VersionManager.ts:174` 的 `if (!this.historyManager.isExecutingUndoRedo())`，它连 `syncDepth` 一起看，已由 `HistoryManager.scopes-and-undo.spec.ts:574-590, 725-780` 经公开的 `syncing()` 与真实 undo 覆盖。
- **为什么本轮没动**：够不到的防御分支按铁律算「无兜底」违反，该删；但删生产代码是行为变更，超出「测试基建残留」这条的范围，得单独定。本轮的处理是**让它至少有断言盯着**——`HistoryManager.spec.ts` 的两条用例注入标志进到这条分支，断言的是行为（不开 `switchBranch` 事务、redo 栈原样保留），推导过程写在那个注入 helper 的 TSDoc 里。
- **两条出路**：① 删掉这道守卫与随之而来的两条注入用例，只留 `VersionManager` 那道；② 判定它是「将来放开序列化时的保险」而保留，那就把这个理由写进 `HistoryManager.ts` 的注释，别让下一个人再推一遍。

---

## 5. 🔒 依赖调度器的误报（待规格决策，不改代码）

- **文件**：`packages/rxdb/src/rxdb.plugin-lifecycle.ts` 侧的 `dependency-scheduler.ts:244-252`
- **现象**：顺序 `await connect('local'); await connect('remote')` 会报「依赖未满足」，误报已实测复现。
- **为什么不改**：「每次 connect 落地就结算一次未满足依赖」正是 US AC#11 点名的契约，改判据等于反转一条已 ✅ 的验收。
- **两条出路**：① 放宽 AC#11（改成「全部已注册适配器都连上才结算」）；② 保留误报，在文档里写明顺序 connect 会有这条噪声。**这是规格问题，不是实现问题**，需要先定，再动代码。
