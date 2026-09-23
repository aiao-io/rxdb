# next-11 分支 `packages/rxdb` 包评审 · 剩余项

- **原评审**：2026-09-06，`packages/rxdb`（`@aiao/rxdb` 0.0.25），源码 35,416 行 / 213 文件，测试 60,948 行 / 144 spec
- **复核**：2026-09-09，逐条对照源码 + 实跑 `nx test rxdb --coverage`
- **修复**：2026-09-09，第 1 块的「空断言」与「绑私有状态」两节已清空。九条用例改成钉行为：`bulk-sync.spec.ts` 的并发组量 `syncRepository` 的在飞峰值，`HistoryManager.spec.ts` 的跳过分支断言「没开 `switchBranch` 事务 + redo 栈原样保留」，`entity-status.spec.ts` 先证缓存在、再证 `modified` 清了它；`setProxyTarget` 改走生产同一个 `setSafeObjectKey`。每条都用变异测试反证过（改实现必红）
- **修复**：2026-09-09，第 4 块的 `reachability` 泄漏已清空。补了终态 `RxDB.destroy()`（断全部适配器 → `syncState.destroy()` → `reachability.destroy()`），与可逆的 `disconnectAll()` 分成两个出口；`init()` 与 `connect()` 各加终态判据（`connect()` 那道必须排在重入缓存**之前**，否则拆卸窗口内会交出一个正要被断开的适配器）。三绑定与 `dev-rxdb-http-server` 的自有实例拆卸改调 `destroy()`。六个变异各自被对应用例咬红
- **复核 2**：2026-09-10 @ `6b6d703`。**行号已按 HEAD 全量刷新**，原报告的三条误报经复核后已连同条目删除。`packages/rxdb/src` 自 `2cf208f`（09-10 08:24，含 09-09 那批修复的 squash）未再改动，故 09-09 那份覆盖率实测仍然有效，本轮未重跑
- **复核 3**：2026-09-18 @ `fc30f1da`。**块 6 已修并按约定删除**——无校验 cast 换成 `assertLocalAdapterCapabilities`（`rxdb.private.ts:115-124`，缺失即抛带适配器名与成员名的错误），`migrateSystemSchema()` / `completeBootstrap()` 改直调；剩 `reconcileEntityIndexes?.()` 一处已契约化：`rxdb-adapter.ts:319` 把它声明为 `RxDBAdapterLocalBase` 的可选成员，TSDoc 写明「缺席是契约允许的形态」，不再是静默兜底。**块 2 部分落地**（已修项见块内删除后的余文）：`proxy.ts` 泛型、幻影类 `RxDBSyncRepository`、一批类型具名导出、四处文档漂移、`entity-base` 类 TSDoc 位置。其余条目逐条对照源码复核，锚点按拆包后位置刷新，判定不变
- **结论**：本文件只留尚未处理的条目。已修的、以及复核后判定为误报或不值得做的条目连同说明一并删除——判据现在都写在代码注释与 TSDoc 里，报告再留一份副本只会随代码漂移。

## 剩余工作与优先级

| 顺序 | 块                        | 状态                  | 值不值得                                                                               |
| ---- | ------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| ①    | 4 够不到的 undo/redo 守卫 | ⬜ 待决策             | **值得**，但是「定」不是「做」，10 分钟                                                |
| ①    | 5 依赖调度器误报          | 🔒 待规格决策         | **值得**，同上，且不改代码                                                             |
| ②    | 1 测试基建残留            | 🟡 进行中             | **挑着做**：核心侧覆盖缺口 + 拆卸 after-hook                                           |
| ③    | 2 公共 API 面收敛         | 🟡 进行中（部分已修） | **最值得，且有时间窗**（见下方「为什么是现在」）；头号项 `createEntityRef: any` 仍未动 |
| ④    | 3 拆长函数（余 9 条）     | ⬜ 未开始             | **可无限期推迟**：无 lint 门禁，纯风格债；唯一例外是 pull 那对已分叉的副本             |

理由不重复写在这里，各块自己的「值不值得」小节说。

---

## 1. 测试基建残留

### 覆盖率缺口（2026-09-09 实测，`stmts / branch`）

整体 95.95 / 91.44 / 97.76 / 96.83，过门禁；低于 90 的文件按**拆包后位置**复核如下（09-09 的数值不可复验，门禁随文件转移）：

| 文件（现位置）                                                                   | 原 stmts | 原 branch | 原未覆盖范围                               |
| -------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------ |
| `rxdb-plugin-sync/src/pull.ts`                                                   | 64.17    | 62.50     | `:82-124`（`pullFilterRepositories` 循环） |
| `rxdb-plugin-querycache/src/QueryCacheEngine.ts`（原 query-cache-repository.ts） | 66.00    | 62.16     | `:103-152, 262, 284`                       |
| `rxdb-plugin-sync/src/bulk-sync.ts`                                              | 89.58    | 92.30     | `:242-245`                                 |
| 核心 `query/merge_remove.ts`                                                     | 80.95    | 64.70     | `:30-51`（find/findOne/get 删除刷新分支）  |
| 核心 `query/merge_update.ts`                                                     | 81.05    | 82.60     | `:74-75, 265-282`                          |
| 核心 `system/change-codec.ts`                                                    | 83.72    | 76.33     | 版本不匹配与非法输入的抛错路径             |
| 核心 `rxdb-adapter.ts`                                                           | 83.33    | 100       | `:112`                                     |
| 核心 `repository/updated-at.utils.ts`                                            | 85.71    | 50        | `:24`                                      |

原表里的 `history-manager.utils.ts` 已随拆包拆分（后继为 `sync-contract/VersionManager.utils.ts` 与 `rxdb-plugin-history/src/version-manager.utils.ts`）。

**值得做**：核心侧 `change-codec.ts` 的抛错路径、`merge_remove` / `merge_update` 的删除刷新分支——恰是最难在生产现场复盘的一段。搬去插件包的三个文件（pull / querycache / bulk-sync）按各自包的新位置跟进，不按旧行号排。

### 拆卸

`test-db-setup.ts` 的 `cleanup` 已补 `disconnectAll()`，但 `packages/rxdb/src/__tests__` 下含 `new RxDB(` 的 35 个 spec 里仍有 **19 个无 after-hook**（09-09 实数为 32/20），今天不炸只因 browser mode `isolate:true`。

**值得做**：这是定时炸弹，一旦切 `isolate:false` 或换 runner 就集体挂，且现场极难读（泄漏的实例互相串事件）。成本低，优先级排在覆盖率之前。

---

## 2. 公共 API 面收敛（`export *` 现 53 条）

### 为什么是现在

- **已发布产物在漏类型**：`dist/entity/entity-manager.d.ts:59` 实测就是 `createEntityRef(...): any`（2026-09-18 复核仍如此），用户拿到的就是这个。
- **成本单调上升**：26 个内部包 + 三框架绑定 + 4 个 demo app 依赖 `@aiao/rxdb`。0.0.25 是最便宜的时刻。
- **正好卡在 bridge 窗口里**：[release-plan.md](../release-plan.md) 的硬前提 1 要求 `kind=bridge` 发布**不得抬升** `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION`。API 收敛一个字节都不碰这两个常量，是少数能塞进这个窗口的重活。
- **改动可审**：`pnpm audit:api-surface` 已进 CI（`ci-template.yml:205`），baseline 逐条 diff。

⚠️ **发版提醒**：按硬前提 2 的 conventional commits 映射，`refactor:` / `types:` 都算 `none` bump，单独落这块**发不出版本**。消 `any` 泄漏、删幻影类如实写成 `fix:` 是准确的，也顺带解决 bump 量。

### 条目（2026-09-18 复核后剩余）

- **`any` 泄出**：`createEntityProxy` 的返回类型已修（`proxy.ts:38` 现为 `EntityInstanceType<T>`），但连锁的 `createEntityRef` 推断返回类型仍塌成 `any`：`entity-manager.ts:245` 无显式返回类型，`dist/entity/entity-manager.d.ts:59` 实测 `createEntityRef(...): any`，`repository/QueryManager.ts:315` 因此要写 `!`。**这是本块的头号项，单独修也有价值。**
- **公开签名引用未导出类型（已修一批）**：`EventListener` / `RxDBConfig` / `MergeQueryTaskOptions`（`index.ts:104`）、`QueryManager` / `EntityStatus`（type 级具名）、`SyncRepositoryOptions/Result`（在 barrel 内）均已可具名；`BulkSyncOptions/Result`、`RepositorySyncStatus`、`DependencyGraph`、`VersionManager` 已随拆包移入 plugin-sync / plugin-history 并具名导出（原口径对核心 MOOT）。**仍不可具名**：`TreeRepository` 类本身（`repository/TreeRepository.ts:40`，barrel 只导出 `tree-repository.interface.js` 与 `tree-level.utils.js`）。
- **死代码**：
  - [`RxDB.ts:1846-1853`](../../packages/rxdb/src/RxDB.ts#L1846) 与 [`system/types.ts:450-472`](../../packages/rxdb/src/system/types.ts#L450) 是**同一个模块增强的两个副本**（都给 `interface RxDB` 挂 `RxDBChange/RxDBBranch/RxDBMigration/RxDBSync` 四个同名字段）。删一处留一处还是两处都删，要一起定；`rxdb.RxDBChange` 类型是类、运行时 `undefined` 的问题两处同源。
  - `system/types.ts:56/65/79, 207/216/228`（另有第三份 `334/349/362`）手写规则联合混入他表字段，`RxDBSync.find({ where: { field: 'parentId' } })` 编译通过运行时撞不存在的列 —— `types.ts` **确在 barrel 里**（`index.ts:162`），这条成立且直面用户。
  - `version.utils.ts`（现 `rxdb-plugin-sync/src/version.utils.ts`）唯一导出 `remote_change_to_local` 只有测试引用、不在 barrel。`dependency-graph.ts` / `topological-sort.ts` 已随拆包成为 plugin-sync 的内部实现（被 bulk-sync / push / pull 大量消费），**不再是死代码**。
- **内部实现漏出**：`cleanupExpired` / `syncBranches` 现于 plugin-sync，barrel 仍 `export * from './cleanup-expired.js'` / `'./sync-branches.js'`（签名改为收 `SyncManager`）；`setSafeObjectKey` 系列、`fillDefaultValue`、`getEntityMutations`（参数字段 `need_save_entities` 仍是 snake_case）仍经核心 `index.ts:24` 的 `export *` 公开；`QueryTask` 含 `serialize/onClean/depEntityTypeMap` 内部管线整体导出（`index.ts:87`）——**原阻挡前提已退**：`rxdb-plugin-graph` 的生产代码现在只 import 类型，`serialize` 仅出现在其测试里，可以按替代面直接收。
- **命名**：`merge_create.ts` / `need_refresh_*.ts` / `entity_type_dependencies.ts` 与 `merge-update-tree.ts` 两套文件名风格；`query_need_refresh_*` 在 barrel 处改名（`index.ts:59-61`）；`isRuleGroup` 公开的是宽松版（`query-matching.utils.ts:40`，只判 `combinator` 存在），`QueryTask.ts:26-35` 另有严格私有副本（校验 combinator ∈ {and,or} 且 rules 逐项合法）。
- **TSDoc 缺口**：仍集中在 `rxdb-events.ts`（25 个事件常量 + 9 个 `*EventData` 无 TSDoc）、`rxdb-adapter.ts`（`IRxDBAdapter` 大部分成员）、`system/migration.ts`（4 个 watermark 常量与 `RxDBSystemVersionState`）、`entity/property-types.interface.ts`（`UUIDProperty` / `StringProperty` / `EnumProperty` / `NumberArrayProperty` 等）。`entity-base.ts:84-97` 的类 TSDoc 已移到 `@Entity(...)` 装饰器之前（已修）。
- **文档漂移（剩余 1 处）**：`scope-selection.ts` 现居 `rxdb-plugin-history/src/scope-selection.ts`，:116 的 TSDoc 仍写「`historyManager` 是私有字段，够不到」。已修的四处：`change-codec.ts` 的「字符串 ID 走原始通道」（`encodeRxDBChangeEntityId` TSDoc :340 已澄清归属 `getRxDBChangeEntityIdQueryValues`）；identity 版本与信封版本已拆成两个错误类（`UnsupportedRxDBEntityIdentityVersionError`）；`VersionManager.ts` 的不存在示例 `pull?.pulled`（示例已随拆包消失）；`QueryCacheRepository.ts` 的 `operator: 'eq'`（文件已不存在，继承者 `QueryCacheEngine.ts:211` 示例用 `'='`）。

**做法**：`index.ts` 改具名导出并补齐缺失类型；删重复的模块增强；给 `createEntityRef` 补显式返回类型消掉 `: any`；补 TSDoc。这一块会动 `requirements/api-baseline/rxdb.json`，属破坏性变更，须在 PR 说明里逐条列出。

---

## 3. 拆长函数（AGENTS.md 要求嵌套 < 3 层）

⚠️ **定性先说清楚**：根 eslint 配置里**没有** `max-depth` / `complexity` / `max-lines-per-function`，AGENTS.md 那条 `<3层` 没有任何自动门禁。除下方 `pull` 那对之外，本块全是**风格债，可无限期推迟**——等有人真要改到某个函数时顺手拆，比专门排一轮划算。原属本块的 `RxDB.connect` 的 `?.()` 已拎出单列为缺陷，**已修**（见头部「复核 3」）。

| 函数（现位置）                                                                    | 行数 | 备注                                                  |
| --------------------------------------------------------------------------------- | ---- | ----------------------------------------------------- |
| `rxdb-plugin-sync/src/pull-batch.ts:148 pullBatchOnce`                            | ~272 | 与下者重复，**见下方专条**                            |
| `rxdb-plugin-sync/src/pull-repository.ts:472 pullSingleRepository`                | ~238 |                                                       |
| `rxdb-plugin-history/src/find-switch-branch-step.ts:140 find_switch_branch_step`  | ~174 |                                                       |
| `rxdb-plugin-history/src/HistoryManager.ts:164 constructor`                       | ~167 |                                                       |
| `rxdb-plugin-sync/src/push-repository.ts:675 planRepositoryPush`                  | ~153 |                                                       |
| 核心 `entity/metadata-transition.ts:101 transitionMetadata`                       | ~232 | 4 层                                                  |
| 核心 `schema/SchemaManager.ts:78 init`                                            | ~139 | 4 层，且直接 `push` 进调用方的 `rxdb.config.entities` |
| `rxdb-plugin-history/src/switch-branch-actions.ts:116 get_switch_version_actions` | ~101 | `if→for→switch→case→if→if` 6 层                       |
| 核心 `query/entity_type_dependencies.ts:159 processRules`                         | ~81  | 7 层，同一段「加 mappedEntity + 中间表」复制三份      |

### ⚠️ 唯一值得现在做的一条：pull 的两份副本已经分叉

原报告写「`:570-647` / `:297-395` 是同一段逻辑两份手抄」，措辞容易读成同一文件——**是跨文件的**：`pull-repository.ts` 与 `pull-batch.ts`，同一段「回填自推变更的 remoteId → 压缩 otherChanges → `resolveConflictsAndBuildActions` → 应用 → 推 `lastPullRemoteChangeId`」写了两遍。逐行比对后确认重复属实，且**两份已经分叉**（2026-09-18 复核，锚点已漂到拆包后位置）：

- `pull-batch.ts:330` 的回填查询带 `{ field: 'remoteId', operator: '=', value: null }`，`pull-repository.ts:596-603` 改成了 JS 层的 `local.remoteId == null` 守卫（会重写已映射记录的 `remoteId`）——结构仍不同；
- `pull-repository.ts:627/652` 从 `resolveConflictsAndBuildActions` 多解一个 `localChangeSupersessions`（`deferLocalChangeSupersession: true`），`pull-batch` 没解；
- **事务化差异已收敛**：两侧现在都在 `localAdapter.transaction` 里（`pull-batch.ts:291`、`pull-repository.ts:583`，后者注释「对齐 pull-batch 的既有事务化处理」）。

**先定后改**：分叉 ①②哪些是有意的、哪些是改一处漏一处，要先判定再抽 `applyRepoRound`——直接合并会把某一侧的行为悄悄改掉。判定完再动手，这条就从「风格债」升级为「防回归」。

---

## 4. `invalidateRedoStack` 开头那道守卫从任何公开入口都够不到

- **文件**：`packages/rxdb-plugin-history/src/HistoryManager.ts:506-508`（已随拆包移出核心）
- **现象**：`invalidateRedoStack()` 开头查 `isUndoRedoInProgress || isInvalidatingRedo` 就返回。但这两个标志只由 `applyUndoRedoHistories` / `invalidateRedoStack` 自己在**同一个序列化任务内部**置起再复位，而三个入口（`history-scope-api.ts` 的 undo/redo、`HistoryManager.ts` 的 invalidateRedoStack）全都排进 `#runSerialized`，任务之间不重叠 —— 于是这条分支永远走不到。「持着 undo 不放再去 invalidate」也不成立：后者只会排在 undo 后面，轮到它时标志已复位。
- **判据**：真正生效的那道守卫在调用方 `VersionManager.ts` 的 `if (!this.historyManager.isExecutingUndoRedo())`，它连 `syncDepth` 一起看，已由 `HistoryManager.scopes-and-undo.spec.ts` 经公开的 `syncing()` 与真实 undo 覆盖。
- **为什么当时没动**：够不到的防御分支按铁律算「无兜底」违反，该删；但删生产代码是行为变更，超出「测试基建残留」这条的范围，得单独定。当时的处理是**让它至少有断言盯着**——`HistoryManager.spec.ts:288-300, 882-937` 的两条用例注入标志进到这条分支，断言的是行为（不开 `switchBranch` 事务、redo 栈原样保留），推导过程写在那个注入 helper 的 TSDoc 里。
- **两条出路**：① 删掉这道守卫与随之而来的两条注入用例，只留 `VersionManager` 那道；② 判定它是「将来放开序列化时的保险」而保留，那就把这个理由写进 `HistoryManager.ts` 的注释，别让下一个人再推一遍。
- **倾向 ①**：`VersionManager` 那道覆盖更严（连 `syncDepth` 一起看），够不到的分支留着还要养两条注入用例，是负资产。选 ② 则必须同时写下「放开序列化」这件事什么条件下会发生，否则理由本身也会漂。

---

## 5. 🔒 依赖调度器的误报（待规格决策，不改代码）

- **文件**：`packages/rxdb/src/rxdb.plugin-lifecycle.ts:45-48` 的 `reportUnsatisfiedPlugins`（闸门 = `bootstrappingConnects === 0 && connectedAdapters.size > 0`）→ `packages/rxdb/src/plugin/dependency-scheduler.ts:271-279` 的 `reportUnsatisfied`（warn-once）。
- **现象**：顺序 `await connect('local'); await connect('remote')` 会报「依赖未满足」，误报已实测复现；[`RxDB.ts:936-942`](../../packages/rxdb/src/RxDB.ts#L936) 的 `#bootstrapping_connects` 计数只挡**并行** connect 的情形。
- **为什么不改**：「每次 connect 落地就结算一次未满足依赖」正是 US-015 AC#11 点名的契约（仍标 ✅），改判据等于反转一条已 ✅ 的验收。
- **两条出路**：① 放宽 AC#11（改成「全部已注册适配器都连上才结算」）；② 保留误报，在文档里写明顺序 connect 会有这条噪声。**这是规格问题，不是实现问题**，需要先定，再动代码。

---

## 执行顺序

1. **块 4 / 块 5** 两条决策（各 10 分钟，只定不改；块 4 定完顺手删代码与两条注入用例）
2. **块 1** 的拆卸 after-hook（19 个文件）+ 核心侧覆盖（`change-codec.ts` 抛错路径、`merge_remove` / `merge_update` 删除刷新分支；搬去插件包的三个文件按新位置跟进）
3. **块 2** 继续做，赶在 bridge 发布之前；头号项 `createEntityRef: any` 可以先单独落地；`QueryTask` 收口已无障碍（plugin-graph 生产依赖只剩类型）
4. **块 3** 先判定 pull 两份副本的分叉 ①②，其余挂着不排期
