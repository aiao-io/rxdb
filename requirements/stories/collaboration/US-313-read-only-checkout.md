---
id: US-313
title: 只读检出位：不切换分支就打开另一条分支或一个可达提交的完整数据
status: In Progress
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-10-16
updated: 2026-10-16
tags: [collaboration, branch, checkout, history, tri-framework]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只依赖阶段 2（US-312）放开起点的增量计算；不依赖可写检出位与隔离写入方
- [x] Negotiable (可协商): 快照库存储、API 落点、第二实例的实体类、首批后端由 owner 2026-10-16 确认（见「设计决定」）
- [x] Valuable (有价值): 看另一条线的完整数据，今天只能切分支或 restore，两条路都要先清空工作树
- [x] Estimable (可估算): 按交付阶段 A～D 估
- [x] Small (小): 只读、不实时；可写检出位与往非 active 线写不在本故事
- [x] Testable (可测试): 快照与「切过去读到的数据」逐行比对
-->

# 用户故事：只读检出位：不切换分支就打开另一条分支或一个可达提交的完整数据

## 作为/我想要/以便

**作为** 在本地优先应用里用分支隔离改动的用户
**我想要** 不切换当前分支、不动工作树，以只读方式打开另一条分支或当前线上某个可达提交的完整数据，用平常的查询与列表浏览它
**以便** 看清另一条线的全貌，而不只是差异；在另一个标签页里看着另一条分支，当前标签页的工作照常进行

## 症状

epic-006 多检出位[场景二](../../epics/epic-006-working-tree-commits.md#场景二不切换就预览或对比)在
[US-312](US-312-branch-compare-merge-preview.md)（对比与合并预览）之后仍成立的部分，由读源码确认：

1. **看另一条分支只能切过去。** active 分支全库唯一（epic-006 现状 1），切换会带走所有标签页的活查询；
   三端 demo 的切换带 `requireClean`，工作树不空就被拒。
2. **看历史提交只有 `restore()` 一条路。** [`restoreWorkingTree()`](../../../packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts)
   在 dirty 工作树上直接拒绝（`reason: 'dirty_working_tree'`）；恢复出来的内容成为未提交变更，看完只能 `discard()` 整棵工作树。
3. **差异替代不了完整数据。** `compareBranches()` 只给有差异的实体；排序、分页、聚合、树形展开都要整张表。

## 范围边界

### In Scope

- **检出位登记**：本地、不进同步（设计指点 9）。每个检出位有自己的 HEAD（一条分支，或一个提交）、建立时刻的源点、归属
  （标签页会话 / 持久）与最后访问时间（设计指点 1、8）
- **只读快照库**：把业务表复制进一个独立库，叠上从源点走到目标点的增量，用第二个 RxDB 实例只读打开
  （epic-006 [共同前提](../../epics/epic-006-working-tree-commits.md#共同前提不切换也能读到另一条线)的「只读快照库」）
  - 分支视图：增量取 `compute_branch_transition_actions`（当前 active 分支 tip → 目标分支 tip）。目标分支的未提交变更就是它的变更行，一并可见
  - 提交视图：当前分支的快照，沿 restore 的可达路径从 HEAD 往回逐个反向应用提交的变更单元（见技术笔记「提交视图」）
- **只读**：三层防线——核心 `readOnly` 让公开写入口抛 `RxDBReadOnlyError`；只读捕获钩子拦适配器层的批量写与 raw 写；
  引擎封印（SQLite `PRAGMA query_only`、PGlite 只读事务）兜住直接打到适配器的写。快照库与主库都不变
- **不污染主实例**：只读实例不进主实例的实体缓存、不派发 NEW，草稿缓存不收它的实体（设计指点 10）
- **加密与权限照旧**：加密字段按 envelope 原样复制、不解密，建快照不调用密钥环；快照实例与主实例共用同一个密钥环
  （信封的 AAD 绑定库名，快照库自己的库名解不开）；系统实体权限不放宽（设计指点 11）
- **生命周期与回收**：显式关闭即删快照库与登记；标签页会话归属的检出位在会话消失后可回收；启动时清理孤儿（设计指点 8，对应 `git worktree prune`）。
  删库能力（`dropStorage`）在首批六个后端都新增：仓库里今天没有任何删库 API
- **三端绑定**：Angular / React / Vue 同名同 API（设计指点 13）
- **demo**：分支行与历史行菜单「Open read-only」打开只读视图；视图里有只读横幅，storage 的文件标注「不随版本」

### Out of Scope

- 可写检出位（epic-006 分期阶段 5）与往非 active 线写的原语（阶段 4）
- 实时：快照是建立时刻的数据，`refresh()` 即重建
- 跨设备、进同步
- DevTools 连接只读实例：DevTools 只连一个实例（epic-006 现状 9）
- 不可达提交：restore 拒绝的那一类，这里同样拒绝
- 全文搜索：搜索插件要往快照库写 FTS 索引，只读实例不装它
- QueryCache 实体：它们的表要 querycache、sync、远端插件一起才连得上，不进快照

## 交付阶段

| 阶段 | 交付                                                                                                                                                                                                                | 状态 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A    | 核心前置（克隆实体类不再泄漏多对多中间表、`cloneEntityClasses` 公开、`readOnly` 与 `RxDBReadOnlyError`、生成类清单、快照原语声明）；PGlite 与 SQLite 系的快照原语；登记表；分支视图与只读实例；一致性套件接六个后端 | ✅   |
| B    | 提交视图                                                                                                                                                                                                            | ⬜   |
| C    | 生命周期与回收：六个后端的 `dropStorage`、Web Locks、`prune()`、启动清理、`attach()`                                                                                                                                | ⬜   |
| D    | 三端绑定、三端 demo、文档                                                                                                                                                                                           | ⬜   |

## 验收标准

| #   | 阶段 | 前置条件                                       | 操作                                               | 预期结果                                                                                         | 状态 |
| --- | ---- | ---------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| 1   | A    | 两条分支各有提交与未提交变更                   | 打开另一条分支的只读检出位                         | 每张业务表与「切过去读到的数据」逐行一致；当前 active 分支、工作树、业务表都不变                 | ✅   |
| 2   | A    | 只读检出位已打开                               | 在它上面 save / remove / reorder / 批量写 / raw 写 | 公开写入口抛 `RxDBReadOnlyError`；适配器层的写被只读钩子与引擎封印拒绝；快照库与主库都不变       | ✅   |
| 3   | A    | 主实例装了 workspace 插件                      | 在只读实例上查询并实例化实体                       | 主实例实体缓存里没有这些实体；草稿缓存不新增条目                                                 | ⚠️   |
| 4   | A    | 有加密字段的实体                               | 打开只读检出位                                     | 快照库里每个密文都是主库已有信封的逐字节拷贝；建快照不调用密钥环                                 | ✅   |
| 5   | A    | 只读检出位已打开，主库随后又写入               | 读只读检出位；再 `refresh()`                       | 先读到的仍是建立时刻的数据；`refresh()` 后与新状态一致                                           | ✅   |
| 6   | B    | 当前分支上一个可达的历史提交                   | 打开提交视图                                       | 已跟踪实体的数据与「那次 `commit()` 刚完成时读到的数据」逐行一致                                 | ⬜   |
| 7   | B    | 不可达的提交                                   | 打开提交视图                                       | 拒绝，原因与 restore 的 `unreachable_target` 同口径                                              | ⬜   |
| 8   | C    | 只读检出位已打开                               | `close()`                                          | 快照库与登记都删除                                                                               | ⬜   |
| 9   | C    | 标签页会话归属的检出位，所在标签页已关闭或崩溃 | 任一标签页启动，或调 `prune()`                     | 该检出位被回收；其它标签页仍在用的不受影响                                                       | ⬜   |
| 10  | C    | 持久归属的检出位                               | 刷新页面                                           | 仍在登记里，可直接打开                                                                           | ⬜   |
| 11  | D    | 三端 demo                                      | 分支行 / 历史行菜单「Open read-only」              | 打开只读视图，能按实体浏览列表与详情；有只读横幅，写入口不可用；storage 文件标注「不随版本」     | ⬜   |
| 12  | D    | 三端绑定                                       | 对照三端 API                                       | 同名同 API（`tri-framework-check`）                                                              | ⬜   |
| 13  | D    | 三端 demo                                      | a11y 走查                                          | 只读视图 axe 零违规、键盘可达                                                                    | ⬜   |
| 14  | —    | 门禁                                           | 收尾                                               | 首批后端的真库比对、三端单测与 e2e、`audit:api-surface`（基线随提交）、`audit:requirements` 全绿 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

AC1～AC5 由 `worktreeConformanceSuite` 在六个后端上验（PGlite / sqlite-wasm / wa-sqlite / sqlite / sqliteai / Electron）。
AC3 的保留：主实例实体缓存的隔离已验；workspace 草稿缓存这一半等阶段 D 的 demo（主实例装着 workspace）补 e2e，
结构上它只收主实例 `EntityManager` 的实体，快照实例不装 workspace。

## 设计决定

owner 2026-10-16 确认，与 US-312 同在 PR #122 交付：

1. **快照库**：与主库同类后端、独立库名。大库不吃内存，关闭即删，持久归属刷新后还在。
2. **API 落点**：工作树插件，`rxdb.workingTree.checkouts`。检出位登记是它的第 11 张系统表，三端绑定沿用
   `rxdb-plugin-working-tree-{angular,react,vue}`。
3. **第二实例的实体类**：同一个实体类不能注册到两个实例（[`entity-manager.ts`](../../../packages/rxdb/src/entity/entity-manager.ts)：
   `is registered with multiple RxDB instances`）。用 `cloneEntityClasses()`，已从 `@aiao/rxdb/testing` 提为主入口公开 API，
   不放宽注册限制。
4. **首批后端**：PGlite 与 SQLite 系（pglite / sqlite / sqlite-wasm / wa-sqlite / sqliteai / electron），与捕获、提交两套 conformance 同口径。
5. **范围修正**：只读视图不含全文搜索与 QueryCache 实体；AC4 判据为「密文是主库已有信封的逐字节拷贝、建快照不调用密钥环」；
   AC6 判据为「那次提交刚完成时读到的已跟踪实体数据」——v1 的 restore 从不重写业务表，拿它当判据证明不了什么。
6. **只读三层防线**：核心 `readOnly`、只读捕获钩子、引擎封印。
7. **删库能力**：首批六个后端都新增 `dropStorage`。

## 技术笔记

以下由读源码确认，标「推断」的除外。

- **命名**：运行时导出用 epic-006 术语表的 `Worktree*` 前缀。工作树插件的 commit 套件已有一道守卫：包入口的运行时导出与
  `WorkingTreeManager` 原型上的方法都不许匹配 `/checkout|detach/i`；`rxdb.workingTree.checkouts` 是实例字段，不受它限制。
- **快照实例的适配器显式配置**：主实例的适配器工厂没有取用口（`RxDB.#adapters` 私有），而且照搬不安全——demo 的 SharedWorker
  按外层库名或常量命名，Worker 里的 `SqliteClient.init()` 已初始化就直接返回，第二个实例会悄悄连到主库上。
  插件选项 `worktrees: { adapter: db => …, plugins?: [...] }` 提供工厂，工厂按 `db.config.dbName` 定存储位置（先例：
  `rxdb-plugin-replay` 的 `createRecordingDb`）；`open()` 校验快照适配器与主适配器同名。快照库的逻辑库名为
  `wt-` 加 24 位十六进制（主库库名与检出位 id 的 SHA-256 前缀）：wa-sqlite 的 VFS 把库名限在 49 字节以内（含版本后缀），
  Electron 宿主只认 `[A-Za-z0-9._@-]`，主库库名原样拼进去两边都会被拒。登记行记着库名，回收按登记行找库。
- **快照实例**：克隆实体类（`log: false`，快照库不建变更日志触发器），`syncOverrides` 全部本地、`SyncType.None`，
  `multiInstance: false`，`readOnly: true`，外加一条只在快照库上登记的标记迁移，误打开主库时立即失败。只装读侧插件
  （tree、graph），不装 history / sync / workspace / working-tree / storage / search。实体缓存、NEW 事件天然按实例隔离。
- **复制哪些实体**：主实例 `config.entities` 去掉系统表、QueryCache 实体、主适配器是远端的实体，以及 `SchemaManager`
  生成的类（多对多中间表、图的边）——快照实例的 `SchemaManager` 会自己再生成，数据按命名空间与名字对上复制。
  `log: false` 的实体照常复制（如 `StorageFileMeta`），增量不碰它们，与真实切换一致。
- **建快照**：主库一个读事务里同时读出业务表的存储形态（加密列保持信封）与 `branch_tip_point` /
  `compute_branch_transition_actions`（当前 active tip → 目标点）；快照库一个写事务原样插入行、再应用增量。
  不能用 `mergeChanges`：它先解密再加密、要密钥已解锁、按变更日志编码再编码一次，还会读回每一行进实体缓存并派发事件。
  新增适配器原语（PGlite 与 SQLite 系各实现一份）：
  - `readWorktreeSnapshotPage(executor, Entity, after, limit)`：SQLite 按 rowid 分页读 `SQLiteCompatibleType` 原值；
    PGlite 经 `to_jsonb(t)::text` 读、`jsonb_populate_recordset` 写，避免时间戳丢微秒
  - `importWorktreeSnapshot(batches)`：一个事务；增量复用 `convertSwitchResultToSql` / `applySwitchActions`，加「信封直通」开关
    （不解密、信封原样写，加密列遇到明文直接抛）；不派发事件、不进缓存；装了捕获钩子就拒绝（不进受信写矩阵）
  - `adoptWorktreeEncryption(source)`：快照适配器沿用主适配器的密钥环——信封的 AAD 含 `databaseNamespace`（即库名），
    快照库自己的库名解不开；同一基类的实例之间可直接交接
  - `sealWorktreeReadOnly()`：SQLite `PRAGMA query_only = 1`；PGlite `SET default_transaction_read_only = on`
  - `dropStorage()`（阶段 C）：PGlite 的 idb / opfs-ahp / memory，SQLite 系各 VFS 的库文件与 journal / WAL，Electron 经宿主 IPC
- **比对口径**：快照与「切过去读到的数据」逐行比对时去掉 `ENTITY_BOOKKEEPING_FIELDS`：切换写回的行 `updatedAt` 取写入时刻。
- **只读三层**：(1) 核心：`RxDBOptions.readOnly`、`RxDB.readOnly`，`Repository.create/update/remove/reorder`、
  `EntityManager` 的 save / saveMany / removeMany 与 `notifyExternalUpdate` 在权限判定之前抛 `RxDBReadOnlyError`；
  (2) 建完后给快照适配器装只读捕获钩子：`mergeChanges` / `switchBranch` / `upsertMany` / `deleteByIds` / 外部通知一律拒，
  raw 写沿用 `raw-write-judgment.ts` 的写语句判定、SELECT 放行；(3) 引擎封印兜住直接打到适配器的写（如图的边）。
  SQLite 系封印之后开事务改用延迟的 `BEGIN`：Electron 宿主默认的 `BEGIN IMMEDIATE` 要拿写锁，`query_only` 下连读事务都开不了。
- **多对多中间表**：生成的中间表元数据不带 `log`，默认记日志；两端都是 `log: false` 时中间表也不记
  （快照实例的实体全是 `log: false` 的克隆，否则封印后 SQLite 带日志的事务要重建它的触发器，会被拒）。
  一致性套件接多对多时还暴露了一个既有缺陷，已一并修掉：解绑后保存，中间行留在根实体的待删集合里，切走再切回来
  那一行被切换插回，下一次哪怕只改一个标量的 `save()` 都会把它再删一遍。
- **登记表**：`Worktree`（命名空间 `rxdb`，表 `rxdb_worktree`，`log: false`，系统权限，无外键）。字段：`id`、`kind`、`branchId`、
  `commitId`、`sourceBranchId`、`sourceChangeId`、`targetChangeId`、`dbName`、`owner`（`session` / `persistent`）、
  `state`（`building` / `ready`）、`schemaFingerprint`、`createdAt`、`lastAccessedAt`。既有库连接时由 `RxDB.#ensureSystemTables`
  补建缺的贡献表，不需要迁移、不动 `RXDB_SYSTEM_SCHEMA_VERSION`。顺序不变量：先写登记行再建库，先删库再删登记行。
- **提交视图**：`selectRestoreReplayPath()` 取可达路径（取不到即 `unreachable_target`，与 restore 同口径），
  `findFirstReplayIncompatibility(path)` 预检，`assertCommitGraphIntact`。算法：先把 active 分支的 `WorkingTreeEntry` 反向，
  回到 HEAD 的投影；再从 HEAD 沿路径往回，逐个提交反向应用它的变更单元；用 `get_switch_version_actions` 折叠后叠到当前分支的
  快照上。有进行中或冲突的 restore 会话时拒绝（`restoring_working_tree`）。**推断**（阶段 B 先核实）：`inversePatch` 保留的是
  每个字段第一次捕获的旧值；解码后的变更单元与 `RxDBChange` 解码同形。
- **生命周期**：每个持有检出位的标签页拿共享 Web Lock `rxdb-worktree:${主库 config.dbName}:${id}`（建库期间也持有）；
  `prune()` 以 `ifAvailable` 试排他锁，拿到且归属为 `session` 或仍是 `building` 的就删库、删登记行；`persistent` 且 `ready` 的保留。
  `close()` 关本标签页的视图、放共享锁，排他锁空闲才删库与登记行。每个连接纪元第一次拿到本地适配器后在后台跑一次 `prune()`。
  Node 里没有 Web Locks：`owner: 'session'` 抛类型化错误，不自动 prune。PGlite 的持久快照不能多标签页同开：`attach()` 要排他，
  否则返回 `in_use`。
- **三端绑定**：插件核心出 `createWorktreeCommands` 与异步状态（后发请求胜出，与 `working-tree-commands.ts` 同形），
  三端各一个 `useWorktrees()`；打开的视图把 `view.rxdb` 交给各端现成的 Provider（React `RxDBProvider`、Vue `provideRxDB`、
  Angular 组件级 `{ provide: RxDB }`），现有查询 hook 与 rxdb-model 的实体列表照用；`deriveEntityCapabilities` 认 `rxdb.readOnly`，
  只读时不出写控件。demo 的快照适配器走主线程 IDB VFS（先例：`replay-recording.ts`）。

## 实现文件

- `packages/rxdb/src/entity/clone-entity-classes.ts` — 公开的实体类克隆（关系表单独一份）
- `packages/rxdb/src/RxDB.ts`、`rxdb.interface.ts`、`RxDBError.ts`、`repository/Repository.ts`、`entity/entity-manager.ts` — `readOnly` 与 `RxDBReadOnlyError`
- `packages/rxdb/src/schema/SchemaManager.ts` — 生成类清单
- `packages/rxdb/src/entity/many-to-many-entity.ts` — 两端都不记日志时中间表也不记
- `packages/rxdb/src/entity/relation-cache.ts`、`entity-status.ts`、`entity-manager.ts` — 保存删掉的中间行不再待删
- `packages/rxdb/src/rxdb-adapter.ts`、`worktree-snapshot.interface.ts` — 快照原语声明（`Worktree*` 类型）
- `packages/rxdb-adapter-sqlite-core/src/worktree/`、`packages/rxdb-adapter-pglite/src/worktree/` 与两个适配器类 — 快照原语、
  引擎封印；两边的 `convertSwitchResultToSql` 与写入值转换加信封直通开关；`dropStorage`（阶段 C，含 Electron 宿主）
- `packages/rxdb-plugin-history/src/switch-branch-actions.ts` — 任意两点之间的增量计算（复用）
- `packages/rxdb-plugin-working-tree/src/checkout/` — 登记表、建快照、只读钩子、提交视图、生命周期、`WorktreeManager`
- `packages/rxdb-plugin-working-tree/src/working-tree/testing/` — 检出位一致性套件 `worktreeConformanceSuite`，接六个后端
  （各后端 `src/__tests__/worktree-conformance.spec.ts`；快照库的适配器由各自测试工厂的 `create*WorktreeAdapter` 造）
- `scripts/audit/working-tree-suite-callsites.mjs` — 调用点门禁从 6 × 2 扩到 6 × 3
- `packages/rxdb-plugin-working-tree-{angular,react,vue}` — `useWorktrees()`
- `apps/dev-rxdb-{angular,react,vue}` 与对应 `-e2e` — 只读视图与用例

## References

- [epic-006 场景二：不切换就预览或对比](../../epics/epic-006-working-tree-commits.md#场景二不切换就预览或对比)
- [epic-006 共同前提：不切换也能读到另一条线](../../epics/epic-006-working-tree-commits.md#共同前提不切换也能读到另一条线)
- [epic-006 设计指点](../../epics/epic-006-working-tree-commits.md#设计指点)
- [epic-006 分期与解锁条件](../../epics/epic-006-working-tree-commits.md#分期与解锁条件)
- [US-312 不切换分支就对比两条分支、预览一次合并](US-312-branch-compare-merge-preview.md)
