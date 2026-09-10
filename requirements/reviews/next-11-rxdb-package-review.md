# next-11 分支 `packages/rxdb` 包评审 · 剩余项

- **原评审**：2026-09-06，`packages/rxdb`（`@aiao/rxdb` 0.0.25），源码 35,416 行 / 213 文件，测试 60,948 行 / 144 spec
- **复核**：2026-09-09，逐条对照源码 + 实跑 `nx test rxdb --coverage`
- **修复**：2026-09-09，第 1 块的「空断言」与「绑私有状态」两节已清空。九条用例改成钉行为：`bulk-sync.spec.ts` 的并发组量 `syncRepository` 的在飞峰值，`HistoryManager.spec.ts` 的跳过分支断言「没开 `switchBranch` 事务 + redo 栈原样保留」，`entity-status.spec.ts` 先证缓存在、再证 `modified` 清了它；`setProxyTarget` 改走生产同一个 `setSafeObjectKey`。每条都用变异测试反证过（改实现必红）
- **修复**：2026-09-09，第 4 块的 `reachability` 泄漏已清空。补了终态 `RxDB.destroy()`（断全部适配器 → `syncState.destroy()` → `reachability.destroy()`），与可逆的 `disconnectAll()` 分成两个出口；`init()` 与 `connect()` 各加终态判据（`connect()` 那道必须排在重入缓存**之前**，否则拆卸窗口内会交出一个正要被断开的适配器）。三绑定与 `dev-rxdb-http-server` 的自有实例拆卸改调 `destroy()`。六个变异各自被对应用例咬红
- **复核 2**：2026-09-10 @ `6b6d703`。**行号已按 HEAD 全量刷新**，并纠正了三条原报告的误报（各条就地标注 ⚠️）。`packages/rxdb/src` 自 `2cf208f`（09-10 08:24，含 09-09 那批修复的 squash）未再改动，故 09-09 那份覆盖率实测仍然有效，本轮未重跑
- **结论**：8 条 🔴 全部已修；🟡 的「无兜底」「资源与生命周期」「协议与语义不一致」三节除下方点名者外均已修完。

已修的条目连同其修法说明一并删除 —— 那些判据现在都写在代码注释与 TSDoc 里，报告再留一份副本只会随代码漂移。同时删掉两条误报：`rxdb.transaction.ts:68-69` 的裸 `forEach` 是**有意的** fail-fast 契约（`RxDB.spec.ts` 正面守着它，判据已写进 `emitEvent` 的 TSDoc）；`relation-helper.spec.ts:495` 的 `Reflect.set` 不是「改私有字段」，`children$` 是 `relationHelper` 装上去的**公开访问器**，那行 `Reflect.set` 正是被测对象本身——用例要读它的布尔返回值，写成 `owner.children$ = x` 反而是类型错误。

## 剩余工作与优先级

| 顺序 | 块                        | 状态              | 值不值得                                                                        |
| ---- | ------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| ①    | 6 `connect` 的三处 `?.()` | ⬜ 未开始（新增） | **值得**：铁律违反 + 静默跳过系统迁移，是行为缺陷，与「拆长函数」不同性质       |
| ②    | 4 够不到的 undo/redo 守卫 | ⬜ 待决策         | **值得**，但是「定」不是「做」，10 分钟                                         |
| ②    | 5 依赖调度器误报          | 🔒 待规格决策     | **值得**，同上，且不改代码                                                      |
| ③    | 1 测试基建残留            | 🟡 进行中         | **挑着做**：同步主干覆盖 + 拆卸 after-hook 值得；按文件补 spec **不做**（见下） |
| ④    | 2 公共 API 面收敛         | ⬜ 未开始         | **最值得，且有时间窗**（见下方「为什么是现在」）                                |
| ⑤    | 3 拆长函数（余 8 条）     | ⬜ 未开始         | **可无限期推迟**：无 lint 门禁，纯风格债；唯一例外是 pull 那对已分叉的副本      |

理由不重复写在这里，各块自己的「值不值得」小节说。

---

## 1. 测试基建残留

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

**值得做**：前两个是同步主干（`pull.ts:82-124` 是 `pullFilterRepositories` 的整条 filter 型仓库循环，含失败聚合与 `RxDBPartialSyncError` 的进度累加分支——恰是最难在生产现场复盘的一段）；`change-codec.ts` 漏的是抛错路径。这三个按风险排，其余五个顺手。

### 拆卸

`test-db-setup.ts` 的 `cleanup` 已补 `disconnectAll()`，但**32 个 `new RxDB(` 的 spec 里有 20 个无 after-hook**（原报告写 18，实测 20），今天不炸只因 browser mode `isolate:true`。

**值得做**：这是定时炸弹，一旦切 `isolate:false` 或换 runner 就集体挂，且现场极难读（泄漏的实例互相串事件）。成本低，优先级排在覆盖率之前。

### 无专属 spec 的活代码（约 2,000 行）—— ⛔ 不按文件补

`undo-redo-apply.ts`、`pull-conflict-utils.ts`、`restore-entity.ts`、`pushable-repository-rules.ts`、`rxdb.plugin-lifecycle.ts`、`migration-runner.ts`、`many-to-many-entity.ts`、`json-safe.ts`、`need_refresh_*.ts`（公开导出）；`history-scope-api.ts` 与 `rxdb.transaction.ts` 各只有 1 份。

**不值得按这个清单做**：整体 95.95 / 91.44 已过门禁，说明这些文件是被其他 spec 间接覆盖的。按文件名逐个补专属 spec 是指标驱动而非风险驱动，产出多半正是本块开头刚清完的那种「空断言」。**保留这份清单只作为一件事的输入**：将来改到其中某个文件时，先看它有没有专属 spec，没有就先补再改。

---

## 2. 公共 API 面收敛（46 条 `export *` 撑出 427 个导出）

### 为什么是现在

- **已发布产物在漏类型**：`dist/entity/entity-manager.d.ts:59` 实测就是 `createEntityRef(...): any`，用户拿到的就是这个。
- **成本单调上升**：26 个内部包 + 三框架绑定 + 4 个 demo app 依赖 `@aiao/rxdb`。0.0.25 是最便宜的时刻。
- **正好卡在 bridge 窗口里**：[release-plan.md](../release-plan.md) 的硬前提 1 要求 `kind=bridge` 发布**不得抬升** `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION`。API 收敛一个字节都不碰这两个常量，是少数能塞进这个窗口的重活。
- **改动可审**：`pnpm audit:api-surface` 已进 CI（`ci-template.yml:205`），baseline 逐条 diff。

⚠️ **发版提醒**：按硬前提 2 的 conventional commits 映射，`refactor:` / `types:` 都算 `none` bump，单独落这块**发不出版本**。消 `any` 泄漏、删幻影类如实写成 `fix:` 是准确的，也顺带解决 bump 量。

### 条目

- **`any` 泄出**：`proxy.ts:38`（⚠️ 原报告写 `:25`）`createEntityProxy<T extends EntityType>(entity: InstanceType<T>): T` —— 返回的是**构造器类型 `T`**，应为 `InstanceType<T>`。连锁到 `entity-manager.ts:249` `createEntityRef` 的推断返回类型塌成 `any`，落进 `dist/entity/entity-manager.d.ts:59`，`repository/QueryManager.ts:287` 因此要写 `!`（⚠️ 原报告写 `:290`）。**这是本块的头号项，单独修也有价值。**
- **公开签名引用未导出类型**：`EventListener` / `RxDBConfig` / `MergeQueryTaskOptions`（`rxdb.types.ts`）、`QueryManager`（`Repository.queryManager`）、`EntityStatus`、`BulkSyncOptions/Result`、`RepositorySyncStatus`、`DependencyGraph`、`SyncRepositoryOptions/Result`；`VersionManager` / `TreeRepository` 类本身不可具名。
- **死代码**：
  - ⚠️ **原报告「`system/types.local.ts` / `types.remote.ts` 整文件零引用」是误报，按其「做法」删会直接编译失败。** 实测两文件被 `VersionManager.ts:22-23`、`create-branch.ts`、`remove-branch.ts`、`resolve-current-branch.ts`、`switch-branch-actions.ts` 及一份 spec 引用；且 `index.ts` **没有** `export * from './system/types.local.js'`，它们既不是死代码也不在公共面上。
  - 真正死的只有 `types.local.ts:147` 的 `export declare class RxDBSyncRepository` —— 全仓零引用，且 `export declare class` 在运行时模块里声明一个不存在的类。删它。
  - `RxDB.ts:1251` 与 `system/types.ts:476` 两处 `declare module '@aiao/rxdb'` —— ⚠️ 原报告并列成两条，实测是**同一个增强的两个副本**（都给 `interface RxDB` 挂 `RxDBChange/RxDBBranch/RxDBMigration/RxDBSync` 四个同名字段）。删一处留一处还是两处都删，要一起定；`rxdb.RxDBChange` 类型是类、运行时 `undefined` 的问题两处同源。
  - `system/types.ts:65,79,216,228` 手写规则联合混入他表字段，`RxDBSync.find({ where: { field: 'parentId' } })` 编译通过运行时撞不存在的列 —— `types.ts` **确在 barrel 里**（`index.ts:86`），这条成立且直面用户。
  - `version.utils.ts`、`dependency-graph.ts` / `topological-sort.ts` 多个导出只有测试引用。
- **内部实现漏出**：`cleanupExpired(vm,…)` / `syncBranches(vm)` 经 `export *` 公开，而 `index.ts:88-90` 以同样理由拒绝导出 `checkRepositoryUpdates`；`setSafeObjectKey` 系列、`fillDefaultValue`、`getEntityMutations`（参数字段 `need_save_entities` 是 snake_case）全部公开；`QueryTask` 含 `serialize/onClean/depEntityTypeMap` 内部管线整体导出，且已被 `rxdb-plugin-graph` 依赖 —— 这条要先和 plugin-graph 对齐替代面，不能直接收。
- **命名**：`merge_create.ts` / `need_refresh_*.ts` / `entity_type_dependencies.ts` 与 `merge-update-tree.ts` 两套文件名风格；`query_need_refresh_*` 在 barrel 处改名；`isRuleGroup` 公开的是宽松版，`QueryTask.ts:24` 另有严格私有副本。
- **TSDoc 缺口**：699 个导出声明中 113 个无 TSDoc，集中在 `rxdb-events.ts`（25 个事件常量 + 7 个 `*EventData`）、`rxdb-adapter.ts`（`IRxDBAdapter` 全部成员）、`system/migration.ts`、`property-types.interface.ts`；`entity-base.ts:81-97` 的类 TSDoc 写在 `@Entity(...)` 装饰器（`:80`）**之后**，挂错位置（实测确认）。
- **文档漂移**：`change-codec.ts:270-288` 说「字符串 ID 走原始通道」，代码对所有 id 包信封；`:372` 把 identity 版本塞进 `UnsupportedRxDBChangeVersionError` 的 codec 参数；`VersionManager.ts:640` 示例用不存在的 `pull?.pulled`；`QueryCacheRepository.ts:288` 示例用不存在的 `operator: 'eq'`；`scope-selection.ts:118-119` 指向 private 的 `historyManager`。

**做法**：`index.ts` 改具名导出并补齐缺失类型；删 `RxDBSyncRepository` 与重复的模块增强（**不要动 `types.local/remote` 两个文件本身**）；修 `proxy.ts:38` 泛型消掉 `createEntityRef: any`；补 TSDoc。这一块会动 `requirements/api-baseline/rxdb.json`，属破坏性变更，须在 PR 说明里逐条列出。

---

## 3. 拆长函数（AGENTS.md 要求嵌套 < 3 层）

⚠️ **定性先说清楚**：根 eslint 配置里**没有** `max-depth` / `complexity` / `max-lines-per-function`，AGENTS.md 那条 `<3层` 没有任何自动门禁。除下方 `pull` 那对之外，本块全是**风格债，可无限期推迟**——等有人真要改到某个函数时顺手拆，比专门排一轮划算。原属本块的 `RxDB.connect` 的 `?.()` 已拎出为[第 6 块](#6-connect-的三处--静默跳过系统迁移)，它是缺陷不是风格。

| 函数                                                      | 行数 | 备注                                                  |
| --------------------------------------------------------- | ---- | ----------------------------------------------------- |
| `pull-batch.ts:141 pullBatchOnce`                         | 265  | 与下者重复，**见下方专条**                            |
| `pull-repository.ts:463 pullSingleRepository`             | 230  | ⚠️ 原报告写 `:458`                                    |
| `find-switch-branch-step.ts:76 find_switch_branch_step`   | 205  | ⚠️ 原报告写 `:61`                                     |
| `HistoryManager.ts:145 constructor`                       | 161  |                                                       |
| `push-repository.ts:664 planRepositoryPush`               | 145  | ⚠️ 原报告写 `:573`                                    |
| `metadata-transition.ts:101 transitionMetadata`           | 220  | 4 层                                                  |
| `SchemaManager.ts:58 init`                                | 120  | 4 层，且直接 `push` 进调用方的 `rxdb.config.entities` |
| `switch-branch-actions.ts:122 get_switch_version_actions` | 100  | `if→for→switch→case→if→if` 6 层                       |
| `entity_type_dependencies.ts:159 processRules`            | 81   | 7 层，同一段「加 mappedEntity + 中间表」复制三份      |

### ⚠️ 唯一值得现在做的一条：pull 的两份副本已经分叉

原报告写「`:570-647` / `:297-395` 是同一段逻辑两份手抄」，措辞容易读成同一文件——**是跨文件的**：`pull-repository.ts:582-649` 与 `pull-batch.ts:314-381`，同一段「回填自推变更的 remoteId → 压缩 otherChanges → `resolveConflictsAndBuildActions` → 应用 → 推 `lastPullRemoteChangeId`」写了两遍。逐行比对后确认重复属实，且**两份已经分叉**：

- `pull-batch.ts:317-325` 的回填查询带 `{ field: 'remoteId', operator: '=', value: null }`，`pull-repository.ts:585-590` 的**没有**（会重写已映射记录的 `remoteId`）；
- `pull-repository.ts:618` 从 `resolveConflictsAndBuildActions` 多解一个 `localChangeSupersessions`，`pull-batch.ts:357` 没解；
- `pull-repository` 那份整体包在 `localAdapter.transaction` 里并经 executor 取仓库，`pull-batch` 那份在事务外。

**先定后改**：这三处分叉哪些是有意的（事务化差异看注释像是有意）、哪些是改一处漏一处，要先判定再抽 `applyRepoRound`——直接合并会把某一侧的行为悄悄改掉。判定完再动手，这条就从「风格债」升级为「防回归」。

---

## 4. `invalidateRedoStack` 开头那道守卫从任何公开入口都够不到

- **文件**：`packages/rxdb/src/version/HistoryManager.ts:486-487`
- **现象**：`invalidateRedoStack()` 开头查 `isUndoRedoInProgress || isInvalidatingRedo` 就返回。但这两个标志只由 `applyUndoRedoHistories` / `invalidateRedoStack` 自己在**同一个序列化任务内部**置起再复位，而三个入口（`history-scope-api.ts:157,176` 的 undo/redo、`HistoryManager.ts:486` 的 invalidateRedoStack）全都排进 `#runSerialized`，任务之间不重叠 —— 于是这条分支永远走不到。「持着 undo 不放再去 invalidate」也不成立：后者只会排在 undo 后面，轮到它时标志已复位。
- **判据**：真正生效的那道守卫在调用方 `VersionManager.ts:174` 的 `if (!this.historyManager.isExecutingUndoRedo())`，它连 `syncDepth` 一起看，已由 `HistoryManager.scopes-and-undo.spec.ts:574-590, 725-780` 经公开的 `syncing()` 与真实 undo 覆盖。
- **为什么本轮没动**：够不到的防御分支按铁律算「无兜底」违反，该删；但删生产代码是行为变更，超出「测试基建残留」这条的范围，得单独定。本轮的处理是**让它至少有断言盯着**——`HistoryManager.spec.ts` 的两条用例注入标志进到这条分支，断言的是行为（不开 `switchBranch` 事务、redo 栈原样保留），推导过程写在那个注入 helper 的 TSDoc 里。
- **两条出路**：① 删掉这道守卫与随之而来的两条注入用例，只留 `VersionManager` 那道；② 判定它是「将来放开序列化时的保险」而保留，那就把这个理由写进 `HistoryManager.ts` 的注释，别让下一个人再推一遍。
- **倾向 ①**：`VersionManager` 那道覆盖更严（连 `syncDepth` 一起看），够不到的分支留着还要养两条注入用例，是负资产。选 ② 则必须同时写下「放开序列化」这件事什么条件下会发生，否则理由本身也会漂。

---

## 5. 🔒 依赖调度器的误报（待规格决策，不改代码）

- **文件**：`packages/rxdb/src/rxdb.plugin-lifecycle.ts` 侧的 `dependency-scheduler.ts:244-252`
- **现象**：顺序 `await connect('local'); await connect('remote')` 会报「依赖未满足」，误报已实测复现。
- **为什么不改**：「每次 connect 落地就结算一次未满足依赖」正是 US AC#11 点名的契约，改判据等于反转一条已 ✅ 的验收。
- **两条出路**：① 放宽 AC#11（改成「全部已注册适配器都连上才结算」）；② 保留误报，在文档里写明顺序 connect 会有这条噪声。**这是规格问题，不是实现问题**，需要先定，再动代码。

---

## 6. `connect` 的三处 `?.()` 静默跳过系统迁移

> 新增（从原第 3 块拆出）。原报告把它挂在「拆长函数」的 `RxDB.ts:593 connect` 备注里，分类错了：这不是行数问题，是行为缺陷。

- **文件**：`packages/rxdb/src/RxDB.ts:698-718`（⚠️ 原报告写 `:593`，那是 `connect` 重载签名附近）
- **现象**：`const localAdapter = adapter as unknown as RxDBAdapterLocalBase` 之后，`migrateSystemSchema?.()`、`completeBootstrap?.()`、`reconcileEntityIndexes?.()` 三处对具体方法可选调用。cast 是无校验的，`?.` 于是成了兜底：**非基类适配器静默跳过系统迁移与索引对账**，不报错、不告警，问题推迟到第一次读写才以「列不存在」之类的面目出现。
- **判据**：铁律「删 fallback 暴露问题」。`?.()` 在这里不是「可选能力」的表达——同一分支里 `createTables` / `isTableExisted` 都是直调，说明这条路径本就假定适配器实现了基类。
- **做法**：把 cast 换成一次显式判定（不满足就抛，错误里带适配器名与缺失的方法名），三处 `?.()` 改直调。范围小、无 API 变更、可单独发。
- **顺带**：修这条时会读完整个 local 分支，`SchemaManager.init` 直接 `push` 进 `rxdb.config.entities` 那条（第 3 块）就在同一条调用链上，可一并处理。

---

## 执行顺序

1. **块 6** 的显式判定（缺陷，范围小，`fix:` 可单独发）
2. **块 4 / 块 5** 两条决策（各 10 分钟，只定不改；块 4 定完顺手删代码与两条注入用例）
3. **块 1** 的拆卸 after-hook（20 个文件）+ 同步主干三处覆盖（`pull.ts` / `query-cache-repository.ts` / `change-codec.ts` 抛错路径）
4. **块 2** 完整做，赶在 bridge 发布之前；`proxy.ts:38` 那条可以先单独落地
5. **块 3** 先判定 pull 两份副本的三处分叉，其余 8 条挂着不排期
