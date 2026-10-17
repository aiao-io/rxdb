# US-314 可写检出位的存储方案：分库与库内影子表

挂在 [US-314](US-314-writable-worktrees.md) 下的存储方案对比与结论。结论由读源码确认，标「推断」的没有跑测试复现，人日是粗估。证据写成 `路径:行号`，
路径缩写：`core/` = `packages/rxdb/src/`，`sc/` = `packages/rxdb-adapter-sqlite-core/src/`，`pg/` = `packages/rxdb-adapter-pglite/src/`，
`wt/` = `packages/rxdb-plugin-working-tree/src/`，`hist/` = `packages/rxdb-plugin-history/src/`，`sync/` = `packages/rxdb-plugin-sync/src/`，
`GD/` = GitHub Desktop 源码的 `app/src/`。文中的现状、场景、设计指点都指 [epic-006](../../epics/epic-006-working-tree-commits.md#多检出位v1-之后) 多检出位一节里的编号。

## 前提：可写检出位在这个库里多出来的是「同时」

- 库已经按分支保存未提交改动（现状 3）：切分支就是 GitHub Desktop 的「Leave my changes」，单个标签页里不靠检出位也能在几条线之间来回切。
- 可写检出位多出来的是**同时**：几个标签页各停在一条分支上读写、互不影响（场景一），或者后台写入方写自己的线（场景三）。
  GitHub Desktop 的 worktree 也是这个用处——几个目录同时可用；切换 worktree 就是选中另一个仓库路径，不检查、也不携带未提交改动
  （`GD/lib/stores/app-store.ts:6085-6135`）；选中被别的 worktree 占用的分支，会直接切到那个 worktree（`GD/lib/stores/app-store.ts:4612-4631`）。
- 下面两个方案都按「真能同时」来评。只求单标签页里的界面形态的话，「分支 + 名字」的一张表就够了，但那违反设计指点 1
  （检出位不是贴在分支上的名字），不在比较之列。
- 本文只回答选哪种存储。什么时候动工照 epic-006 的[分期](../../epics/epic-006-working-tree-commits.md#分期与解锁条件)：
  阶段 5 的解锁条件是具名需求，场景一今天是价值待证。

## 两个方案

- **A 分库**：每个可写检出位一个独立库（与主库同一种后端），用一个独立的可写 RxDB 实例打开。在 US-313 只读快照库的基础上改成可写。
- **B 库内影子表**：同一个库里每个检出位一套业务表（主检出位就是现有业务表），变更日志、分支与提交图仍然只有一份。
  一个实例同一时刻挂一个当前检出位，切换就是换表集、清实体缓存、重跑活查询，不搬数据，应用照用原来的实体类。
  （B 的另一种落法——每个检出位一个克隆实体类的实例、共用一条连接——会让应用里的 `Todo.save()` 静默写进主检出位，不取。）

epic-006 [共同前提](../../epics/epic-006-working-tree-commits.md#共同前提不切换也能读到另一条线)一节比较的三种做法里，
「可写，同库同事务，合并在库内完成」的只有库内影子表；A 是把其中的只读快照库改成可写。

## 对比

| 维度                  | A 分库                                                                                                                                                                                                                          | B 库内影子表                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 历史与分支            | 每个库一份：检出位里的提交要靠自建的「推回 + 分支租约 + 变更行重编号」协议回到主库，而六个后端都给不了跨库原子事务                                                                                                              | 一份：提交、合并都在同一个库的同一个事务里完成                                                                                                                     |
| 复用                  | 检出位就是一个普通的完整库：捕获、提交、status、diff、restore、discard 原样复用；US-313 的快照、登记、锁、删库、第二实例整套复用                                                                                                | commit、status、discard、restore 都按 `token.branchId` 走，换掉令牌来源即可复用；US-313 的登记、锁、prune 复用                                                     |
| 核心要改的地方        | 两个可写实例共用系统实体时静态调用直接抛错，要分出主 / 从实例；新库的根分支写死为 main（`core/RxDB.ts:1114-1119`）；推回要往主库的非 active 分支写                                                                              | 两套 SQL 生成栈约 80 处推表名的调用加检出位维度；三条按全部实体重建触发器的路径收窄到按套；`activeKey` 从「是否激活」改成「被哪个检出位持有」；事件带上 `branchId` |
| 主要风险              | 跨库协议的一致性：推回中途崩溃要按 outbox 重放；undo 会改写已推回的变更行；主库合并时检出位里还有没推回的提交                                                                                                                   | 漏改一处表名或一条重建路径，就会静默写错表或把触发器绑错分支                                                                                                       |
| 与已定设计的冲突      | 违背 epic-006「SQL/PGlite 主库是 commit 与工作树元数据的唯一一致性边界」；推回就是阶段 4「写进非 active 线的原语」，US-314 声明不依赖它                                                                                         | 要改 v1 状态模型「业务实体表只保存当前激活分支的物化投影」这条前提；epic-006 多检出位一节开头已写明要动它                                                          |
| 后端                  | 要删得掉库（US-313 不建删不掉的快照库）：PGlite 只有内存与 `idb://` 删得掉，Electron 上的 PGlite、sqlite-wasm 的 `fs-handle`、wa-sqlite 的 `AccessHandlePoolVFS`、tauri、小程序都删不掉；每个检出位多一个 Worker 或 PGlite 实例 | 改动集中在 sqlite-core（矩阵里五个 SQLite 系后端都继承它）与 pglite；PGlite 一个检出位一个 schema 最干净；SQLite 只能加表名前缀，`uq_` 索引与 `ex_` 触发器要防撞名 |
| 多标签页              | 一个检出位只能在一个标签页里打开（沿用 US-313 的排他锁），主库照旧多标签页共用                                                                                                                                                  | 事件带上 `branchId` 后，每个标签页可以各选各的检出位（推断）                                                                                                       |
| 切换检出位            | 两个实例常驻，重挂 Provider 即可（推断）                                                                                                                                                                                        | 换表集、清实体缓存、重跑活查询，不搬数据                                                                                                                           |
| 在检出位里切分支      | 最贵：原分支的未提交状态回写主库、租下新分支、重建检出位库                                                                                                                                                                      | 与今天切分支同一套增量做法，只作用在那一套表上，再重建这套表的触发器                                                                                               |
| 存储与内存            | 每个检出位一份全量业务表、一份提交链副本、自己的变更日志，装搜索的话再加一份 FTS；每个检出位一套实体缓存加一个常驻实例                                                                                                          | 每个检出位一份全量业务表（只复制记变更日志的实体）及其触发器、索引，装搜索的话每套一份 FTS；连接时解析 schema 的耗时随表数增长（推断）                             |
| 同步                  | 只有主库接同步，检出位里的提交推回主库之后才进同步（推断）                                                                                                                                                                      | 一个库一份同步；拉取写进哪个检出位要拍板（设计指点 12）                                                                                                            |
| GitHub Desktop 贴合度 | 界面上够：GitHub Desktop 切换 worktree 也是换一个仓库对象、重新加载；但分支与提交在 worktree 之间共享，切过去直接沿用（`GD/lib/stores/repository-state-cache.ts:255-286`），A 要等推回才看得到别处的提交                        | 最像：git 的多个 worktree 共享一个 `.git`，分支独占由 schema 兜底                                                                                                  |
| 工作量（人日，粗估）  | 50～75；含检出位里切分支、合并、搜索为 62～95                                                                                                                                                                                   | 40～55（含检出位里切分支与合并）                                                                                                                                   |

工作量的参照：只读的 US-313 在 `packages/` 下新增约 9.6 千行（`git log --grep=US-313 --numstat -- packages`），A 约是它的 3～4 倍。
两个方案都另加阶段 A（从提交建分支）5～8 人日。

## A 的关键证据

- **提交搬得动，变更行要重编号**：提交与变更单元行的 id 是 uuid（`wt/commit/write-commit.ts:314,405`），`operationId` 有唯一约束
  （`wt/commit/commit.entity.ts:75-78`），可以幂等地原样搬；变更行的 id 是每个库自己的整数序列（`core/system/change.ts:32-36`），
  搬回主库要重编号，并改写引用它的 `fromChangeId`、`revertChangeId` 与工作树条目的 `sourceChangeId`；undo 还会回写旧的变更行
  （`hist/undo-redo-apply.ts:137-149`）。
- **现有通道用不上**：拉取只写本库的当前分支（`sync/pull-batch.ts:164-165`），以 `remote_sync` 意图写、记成远端来源的单元
  （`sync/pull-batch.ts:346-353`）；整库恢复只接受空库（`sc/backup/restore-sqlite-database.ts:130-133`）。
- **跨库原子做不到**：PGlite 一个实例只连一个库；Electron 的授权器拒绝 ATTACH（`packages/rxdb-adapter-electron/src/node-sqlite-engine.ts:84-94`）；
  浏览器 SQLite 在 OPFS 上跑 WAL（`sc/sqlite-client.utils.ts:149`），而 SQLite 在 WAL 下跨 ATTACH 库的事务只对每个库各自原子
  （[WAL 文档](https://www.sqlite.org/wal.html)的 Disadvantages 一节）。
- **两个可写实例**：共用系统实体时静态调用抛错（`core/entity/entity-manager.ts:765-781`）；React 绑定的查询 hook 调的正是实体类的静态方法
  （`packages/rxdb-react/src/hooks.ts:123`），demo 的 `useFindAll(RxDBBranch)` 会直接撞上。
- **storage 装不进检出位库**（推断）：文件元数据是 `log: false` 的业务表，文件目录按插件配置、不按库划分
  （默认 `files`，`packages/rxdb-plugin-storage/src/storage.service.ts:138-140`）。检出位库装上 storage，要么与主库共用目录、各记一份元数据，
  一边删了文件另一边就成孤儿；要么另用目录，复制过来的元数据指向不存在的文件。

## B 的关键证据

- **表名只从元数据来，没有改写口**：SQLite 拼成 `ns$table`（`sc/sqlite-core.utils.ts:302-323`），PGlite 拼成 `"ns"."table"`
  （`pg/pglite.utils.ts:196-203`）。非测试源码里调用这两个推导函数的，sqlite-core 46 处（25 个文件）、pglite 35 处（20 个文件），
  搜索插件的 FTS 安装器也调（`packages/rxdb-plugin-search/src/core/fts5-installer.ts:74`）；另有直接读 `metadata.tableName` 的，
  sqlite-core 22 处、pglite 37 处，要逐一过。
- **SQLite 的撞名**：`idx_` 索引名与 CRUD 触发器名从物理表名派生（`sc/sqlite-core.utils.ts:357`，`sc/table/trigger_sql.ts:185-227`），
  会随前缀走；`uq_` / `ex_` 约束名取逻辑表名（`core/entity/constraint-name.ts:68`），而它们在 SQLite 里是索引与触发器
  （`sc/table/check-entity-constraints.ts:8-9`），名字全库唯一，要单独改。PGlite 按 schema 分开，不撞。
- **加密不受影响**：信封的 AAD 绑逻辑的 namespace 与 tableName（`sc/sqlite-core.utils.ts:404-410`），只改物理表名、不改元数据，信封可以原样复制。
- **触发器里的分支 id 是字面量**（`sc/table/trigger_sql.ts:113-117`，`pg/table/trigger_sql.ts:184-194`），有三条路径重建它：
  切分支（`sc/version/switch_branch.ts:46-60`）、SQLite 每个默认事务的首尾（`sc/RxDBAdapterSqliteBase.ts:1820-1822`，`transactionLog` 默认开）、
  `withTriggersDisabled`（`sc/version/with_triggers_disabled.ts:93-102`）。三条都按 `config.entities` 全量重建、分支取全库唯一的 active 分支；
  不改成「按套、取这套的分支」，任何一个默认事务都会把触发器绑错分支——这是 B 最危险的一处。
- **活查询按变更日志分发，不按表名**：两个适配器的业务表通知都来自 `rxdb_change`（`sc/handle_rxdb_change.ts:73-110`、`pg/handle_rxdb_change.ts`），
  事件上已有可选的 `branchId`（今天只有远端事件填，`core/rxdb-events.ts:204-205`），补上它就能按检出位路由。
- **实体缓存**按「实体类型 + id」存（`core/entity/entity-manager.ts:103`），两套表里同一个 id 会撞，切换检出位时清缓存。
- **分支独占由 schema 兜底**：`activeKey` 是可空唯一列（`core/system/branch.ts:68-71`），改存「持有这条分支的检出位的键」即可；
  它由约十处生产写点手工共写（`core/system/branch.ts:36-41`），都要跟着改。

## 两个方案都要面对的

- **新检出位新建分支**依赖阶段 A：新检出位从目标分支自己的状态起步、不带未提交改动（设计指点 5），而 `createBranch()` 会复制工作树
  （FR-017，`wt/plugin.ts:185-188`），要改成从 HEAD 提交建分支。
- **合并会带入源分支的未提交改动**：合并源是源分支上全部未回滚的变更行（`hist/merge-branch.ts:49-65`）。源分支正在另一个检出位里编辑时，
  半成品会被一起并进来；git 只合提交。
- **删除检出位时的未提交改动**：B 删掉那套表，改动仍记在分支上（推断）；A 删库即丢，GitHub Desktop 强删 worktree 也会丢
  （`git worktree remove --force`，`GD/lib/git/worktree.ts:145-157`）。
- **同步归属**：谁接收同步、推哪些分支，要单独拍板（设计指点 12）。

## 结论：B 库内影子表

owner 2026-10-17 确认。理由：

1. **历史只有一份**：提交、合并原子完成，不需要 A 那套推回协议——A 的难点正落在六个后端都给不了的跨库原子上。
2. **代价更低、可控**：同等范围（含检出位里切分支与合并）B 40～55 人日、A 62～95 人日。B 的风险是「漏改」，能用机械手段兜住：
   表名解析器作为唯一入口，静态门禁禁止在解析器之外推表名，一致性套件加隔离探针（拉取、QueryCache 写入、普通事务都不能改写别套表、不能把触发器绑错分支）。
3. **常用操作便宜**：切换检出位、在检出位里切分支都不搬整库；A 里后者最贵。
4. **多标签页**：B 可以每个标签页各选各的检出位，A 一个检出位只能在一个标签页里开。
5. **后端覆盖**：B 不依赖删库能力；A 排除了好几种后端配置。

代价：B 改 v1 状态模型的一条前提，动两套 SQL 生成栈与触发器的核心路径；B1 之前要先定「谁接收同步」（设计指点 12）。

## 分期

对应 US-314 的交付阶段 A～C，阶段 B 拆成两期。

| 期  | 交付                                                                                                                           | 人日（粗估） | 交付后能用的东西                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------- |
| A   | 从提交建分支（与存储方案无关）                                                                                                 | 5～8         | 三端 demo 的提交右键「Create branch from commit」 |
| B1  | 底座：表名解析器、按套建表与触发器、三条重建路径收窄、事件路由、`activeKey` 与激活态迁移                                       | 15～22       | 库层可写检出位：能读写、提交；六个后端一致性套件  |
| B2  | 完整语义：检出位里切分支与合并、拒删被占分支、改名与回收、search / QueryCache / workspace / sync 适配、schema 变化后按指纹重建 | 12～18       | 库层功能完整                                      |
| C   | 三端绑定与三端 demo 的 Worktree 下拉、New Worktree…、Rename… / Delete…，e2e 与 a11y                                            | 10～15       | 三端 demo 对齐 GitHub Desktop 3.6 的 worktree     |
