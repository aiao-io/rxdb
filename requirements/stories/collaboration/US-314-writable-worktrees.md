---
id: US-314
title: 可写检出位与从提交建分支：对齐 GitHub Desktop 3.6 的 worktree
status: Done
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-10-17
updated: 2026-10-27
tags: [collaboration, branch, worktree, history, tri-framework]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 建在 US-313 的检出位登记与生命周期之上；不依赖往非 active 线写的原语（阶段 4）
- [x] Negotiable (可协商): 存储方案已定为库内影子表（[对比](US-314-storage-options.md)）；多检出位下只有主检出位同步（owner 2026-10-21 定）
- [x] Valuable (有价值): 今天换一条线就得先清空或带着改动切走当前工作树；历史里的提交建不了分支
- [x] Estimable (可估算): 粗估阶段 A 5～8 人日，阶段 B、C 合计约 40～55 人日（[分期](US-314-storage-options.md#分期)）
- [ ] Small (小): 按交付阶段 A～C 拆
- [x] Testable (可测试): 检出位上的读写与「切过去读写」逐行比对；三端 demo 的流程对照 GitHub Desktop 3.6
-->

# 用户故事：可写检出位与从提交建分支：对齐 GitHub Desktop 3.6 的 worktree

## 作为/我想要/以便

**作为** 在本地优先应用里用分支隔离改动的用户
**我想要** 像 GitHub Desktop 3.6 那样新建一个 worktree、在上面照常改与提交、在工具栏上随时切换，也能从历史里的某个提交新建分支
**以便** 同时推进几条线，不必为了换一条线先处理掉当前工作树的改动

## 症状

由读源码确认：

1. **三端 demo 没有 worktree 入口。** 库里只有只读检出位（[US-313](US-313-read-only-checkout.md)），只能看、不能写。
   GitHub Desktop 3.6 的 worktree 是可写的：工具栏 Repository 与 Branch 之间有 Worktree 下拉（有链接 worktree 时才出现），
   Repository 菜单与仓库下拉的右键里有 New Worktree…，链接 worktree 的右键有 Rename… / Copy Name / Copy Path / Delete…；
   切过去之后 Changes、History、Current Branch 都换到那个 worktree 上。
2. **历史里的提交建不了分支。** [`createBranch(branchId, fromChangeId)`](../../../packages/rxdb-plugin-history/src/VersionManager.ts)
   按变更日志上的位置分叉，而提交（[`rxdb_commit`](../../../packages/rxdb-plugin-working-tree/src/commit/commit.entity.ts) 与
   `rxdb_commit_change_set`）不记它对应日志上的哪一条变更，从提交推不出分叉点。GitHub Desktop 的提交右键有
   Create branch from commit，对话框写明「Your new branch will be based on the commit …」，建完切到新分支。
   阶段 A 让提交记下分叉点、交付了从提交建分支，见技术笔记。

## 范围边界

### In Scope

- **从提交建分支**：新分支的 HEAD 指向那个提交，业务表等于那个提交刚完成时的数据；三端 demo 的提交右键
  「Create branch from commit」与「Create a branch」对话框
- **可写检出位**（epic-006 [分期](../../epics/epic-006-working-tree-commits.md#分期与解锁条件) 阶段 5）：库内影子表
  （[存储方案](US-314-storage-options.md)）、在检出位上写与提交、一条分支至多被一个可写检出位检出（epic-006 设计指点 2）、关闭与回收沿用 US-313 的登记与锁
- **三端绑定与三端 demo**：按 GitHub Desktop 3.6——Worktree 下拉分「Main worktree / Linked worktrees」两组、
  New Worktree…（名字 + 可选分支）、切换、Rename…、Delete…（有未提交改动时先确认）；分支右键「Checkout in new worktree…」

### Out of Scope

- 往非 active 线写的原语与隔离写入方（epic-006 阶段 4）
- 跨设备、进同步（epic-006 设计指点 9）
- Bring my changes：带着未提交改动切到另一条分支（库按分支保存未提交改动，demo 的 Switch branch 只给 Leave my changes）

## 交付阶段

| 阶段 | 交付                                                                                 | 状态 |
| ---- | ------------------------------------------------------------------------------------ | ---- |
| A    | 从提交建分支：库 API、六个后端一致性、三端 demo 的提交右键与建分支对话框             | ✅   |
| B    | 可写检出位：库内影子表的底座（B1）与完整语义（B2）、读写与提交、分支独占、关闭与回收 | ✅   |
| C    | 三端绑定与三端 demo 的 Worktree 下拉、New Worktree…、Rename… / Delete…               | ✅   |

## 验收标准

| #   | 阶段 | 前置条件                                               | 操作                                               | 预期结果                                                                                                             | 状态 |
| --- | ---- | ------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | A    | 当前分支上一个可达提交，工作树有未提交改动             | 从它建分支并切过去                                 | 业务表与「那次 `commit()` 刚完成时读到的数据」逐行一致；新分支的 HEAD 是该提交；原分支的改动还在                     | ✅   |
| 2   | A    | 三端 demo                                              | 历史行右键「Create branch from commit」            | 弹「Create a branch」对话框，写明基于哪个提交；建完切到新分支                                                        | ✅   |
| 3   | B    | 主检出位有未提交改动                                   | 新建可写检出位，在上面写并提交                     | 主检出位的业务表、工作树与 active 分支都不变；提交进那条分支的历史                                                   | ✅   |
| 4   | B    | 一条分支已被一个可写检出位检出                         | 在别处再检出它                                     | 拒绝（git：`already used by worktree`）                                                                              | ✅   |
| 5   | C    | 三端 demo，有一个链接检出位                            | 工具栏 Worktree 下拉选中它                         | 分两组列出；切过去之后 Changes、History、Current Branch 都换到它上                                                   | ✅   |
| 6   | C    | 三端 demo                                              | New Worktree… / Rename… / Delete…                  | 与 GitHub Desktop 3.6 同流程；主检出位不能改名或删除；有未提交改动时删除先确认                                       | ✅   |
| 7   | C    | 三端 demo                                              | a11y 走查                                          | Worktree 下拉与三个对话框 axe 零违规、键盘可达                                                                       | ✅   |
| 8   | B    | 挂在可写检出位上，持有的分支有未提交改动               | 在检出位里切到另一条分支，或合并别的分支           | 切分支：改动留在原分支，读到的与主检出位切过去逐行一致；合并落在这套表里；主检出位一处不动                           | ✅   |
| 9   | B    | 两个标签页共用一个库，一个挂主检出位、一个挂可写检出位 | 各自写入；改两套表里都有的同一行；在检出位里切分支 | 两边的活查询只收到自己那套表上的变更，同 id 的行不被另一边的值改掉                                                   | ✅   |
| 10  | B    | 应用升级改了实体结构，或插件建在表上的附属对象变了     | 挂上升级之前开的可写检出位                         | 一笔事务里按新结构整套重建：未提交改动还在、与切过去逐行一致；重建失败整笔回滚报 `schema_rebuild_failed`，检出位原样 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **系统 schema 7 → 8（破坏性）**：`RxDBChange` 新增 `tableSetSuffix` 列（`packages/rxdb/src/system/migration.ts` 第 8 级），
  事件按表集路由靠它（阶段 B2.3a）。升级过的库，schema 7 及更早的客户端（含已发布的 `0.0.28`）在建连时被拒
  （`UnsupportedRxDBSystemVersionError`）；下一次发布按 7 → 8 的迁移发布走，见
  [release-plan](../../release-plan.md#下一次发布迁移发布schema-78)。
- **从提交建分支（阶段 A）**：提交时在同一事务里记下分叉点（`CommitForkPoint`，`rxdb_commit_fork_point`）：提交所在的分支、
  那一刻它未回滚的最大一条自有变更，以及谱系上不晚于分叉点那一段的回滚条数与最大回滚号。
  `rxdb.workingTree.createBranchFromCommit(branchId, commitId)` 在那里分叉，新分支的 HEAD 就是该提交（与源分支共享之前的历史）、
  工作树为空，切过去由历史插件沿谱系折叠出数据；只建不切。`checkBranchFromCommit(commitId)` 先问建不建得了。
  被拒三种，都走返回值：`unreachable_target`（不在 HEAD 可达父链上）、`fork_point_unknown`（分叉点表出现之前的提交、
  metadata-only 分支首次物化写下的基线）、`history_rewritten`（提交之后的撤销 / 重做改动了要继承的那段日志：撤销领的回滚号
  全局单调，重做把它清空，条数与最大回滚号都没变，回滚状态就与提交那一刻相同）。
  不从提交单元反推分叉点：单元不存来源变更 id，合并、撤销、拉取派生的单元连事务号都没有，推出来的位置会偏；
  也不从 tip 分叉再写反向增量，那是往非 active 线写（阶段 4）。
- **已知限制**（owner 2026-10-18 定，与切分支同口径）：提交之后不进变更日志的写（拉取、过期清理）切换时不会撤掉，
  新分支会带着它们；建完之后在父分支上撤销分叉点之前的变更，新分支的数据跟着变，与任何一条子分支一样（FR-017）。
- **三端 demo（阶段 A）**：History 右键「Create branch from commit」与分支下拉的「New branch」共用 GitHub Desktop 的
  「Create a branch」对话框，打开时先预检，建不了就写明原因、按钮置灰；建完切过去，当前分支有改动时照常弹 Switch branch。
  New branch 从当前分支 HEAD 建：`createBranch(name)` 会把未提交改动复制一份给新分支、两边都留着，与 GitHub Desktop
  「留在原分支 / 带去新分支」两个去处都不同。GitHub Desktop 在非默认分支上还让人挑基于默认分支还是当前分支，
  从提交建分支只认当前分支历史上的提交，这里只基于当前分支。
- **存储方案**：库内影子表（owner 2026-10-17 定）；与分库的对比、证据与分期见 [US-314-storage-options.md](US-314-storage-options.md)。
  阶段 B1 由 owner 2026-10-21 先行解锁，不等具名需求。
- **同步归属**（owner 2026-10-21 定）：多检出位下只有主检出位同步。拉取、推送照旧只作用于主检出位所在的分支，挂在可写检出位上的实例不跑同步；
  检出位上的提交等那条分支回到主检出位、或合并进主线之后才进同步（epic-006 设计指点 12）。
- **表名解析器**（阶段 B1 的底座）：业务实体的物理名只从两个适配器的解析器出，表集（核心的 `WorktreeTableSet`）参数必填。
  - 主表集的名字与引入检出位之前逐字相同，存量库零迁移。
  - 影子表集：SQLite 系给表名加后缀（`<命名空间>$<表名>$<后缀>`），条件唯一索引与区间排他触发器这类库级对象换掉名字末尾的定义哈希，
    违约消息里仍嵌约束的逻辑名；PGlite 换 schema（`<命名空间>$<后缀>`），表名、索引名、约束名不变，变更触发器函数跟着换 schema。
  - 系统表、QueryCache、关掉变更日志的实体没有副本，无论哪一套都落主表集。
  - 公开的表名函数与 SQL 生成函数随之多了必填参数，迁移见文档站的 table-set-parameter；
    `scripts/audit/table-name-resolver.mjs`（CI setup job）守着「解析器之外不推物理名」。
- **分支持有模型**（阶段 B1.2）：`rxdb_branch.activeKey` 有三种值，`NULL` 是没人持有，`'*active*'` 是主检出位持有
  （与 `activated` 同进同出），其余是可写检出位的持有键（形状由 B1.5 的打开流程定，那一行 `activated` 为假）。
  - 唯一索引加上一格只放一个值，检出位与分支一一对应。但主检出位点亮分支时写的是哨兵，正好把持有键覆盖掉，索引撞不上，
    所以主检出位要持有一条分支之前都先过核心的 `WorktreeBranchHeldError.throwIfHeld`：
    两个适配器的 `switchBranch` 在切换事务里、动第一行之前查，被占就抛 `WorktreeBranchHeldError`（git：`already used by worktree`）；
    零 active 时点亮 `main` 的两处（首次启用迁移、`resolve_current_branch`）与系统迁移回填哨兵同样先查，被占就拒，不抢也不换。
  - 系统迁移只清旧哨兵，不再按「非空」清，后者会把持有键一起抹掉。
  - 关触发器的写与省略目标分支的切换不拿下任何分支：B1.3 起它们只重挂触发器、不写分支表（见下）。
  - 验收 4 的主检出位这一半就位；可写检出位那一半（再开一个检出位检出被占的分支）随 B1.5 的打开流程。
  - **跨版本**：带持有键的库一定已迁到系统 schema 8，更旧的客户端在建连时就被 `assertSupportedRxDBSystemVersions()` 拒绝，碰不到持有键。
- **按表集建表与重建触发器**（阶段 B1.3）：
  - 持有键由表集推出（`WorktreeTableSet.holderKey`）：主表集是哨兵，影子表集是 `*worktree:<后缀>*`。分支表这一行同时说清
    「谁持有」与「是哪一套表」，系统迁移跑在插件装好之前也找得回每一套表该挂哪条分支，没有第二份登记会漂移。
  - 两个适配器新增建 / 删表集：只建 / 删成员表与触发器，不写持有键；成员必须记变更日志。B1.5 改成在调用方的事务里做、建时播种，
    见下面的 B1.5。
  - 重建触发器只有一个入口，表集与分支都显式给：sqlite-core 的 `generate_table_set_trigger_sql`（取代 `switch_transaction_id`），
    PGlite 的 `generateBranchTriggerSql(For)`。实体收窄到「记日志、且这套表里有它自己那张表」：不收窄的话非成员落回主表名，
    删 / 重建影子表集的触发器会误伤主表集（QueryCache 实体记日志又从不进影子表集，正中这一条）。
  - 只有真正的切分支写分支表。关触发器的写（拉取、QueryCache）与省略目标分支的切换（撤销 / 重做、重做栈失效）只重挂触发器；
    此前它们每次都捎带一条分支表的恒等 UPDATE，省略目标分支的那条还派出一条「activated 翻转了」的假事件。
  - 系统迁移给每一套现存的影子表集按持有分支重建触发器，成员按物理表认；认不出的持有键整条回滚。
  - 隔离探针：sqlite-core 共享套件 `worktreeTableSetSuite`（五个 SQLite 系后端与 Tauri）与 PGlite 的同名用例。普通事务、关触发器的写、
    撤销 / 重做、主检出位真切分支都不动影子表，也不把影子表的触发器挂到别的分支。
- **实例挂可写检出位**（阶段 B1.4a）：
  - 一个实例同一时刻挂一套表，状态只存在 RxDB 实例上（`rxdb.worktreeTableSet` / `worktreeTableSet$`），适配器的 `tableSet` 转读它。
  - `rxdb.mountWorktreeTableSet(tableSet)` 换挂：在适配器的事务队列里核对这套表持有分支、换上，SQLite 系清行号缓存；
    换完清实体身份缓存（同一个 id 在两套表里是两份数据）、重跑全部活查询，订阅原样保留。没有持有分支的表集挂不上。
  - 「当前分支」统一成「挂的那套表持有的分支」（`WorktreeTableSet.heldBranchWhere`：主表集照旧按 `activated`，影子表集按持有键）。
    核心 `getCurrentBranch`、两个适配器读当前分支（每个记日志事务首尾的重建、`withTriggersDisabled` 都在用）、历史插件的当前分支流、
    撤销 / 重做与可推送计数都走它；影子表集持有的分支不见了就抛，不回退 main。
  - 挂在可写检出位上的实例不能真切分支（熄灭、点亮写的是主检出位那一行；检出位里切分支归 B2），撤销 / 重做照常、只动这套表。
  - 本地实体事件带分支、按分支过滤原排在 B1.4，owner 2026-10-21 定挪到 B2、与多标签页一起做；B1.4b 见下。
- **当前分支贯穿捕获、历史与同步**（阶段 B1.4b）：
  - 事务执行器多了 `tableSet`：发起它的实例挂的那一套。事务里读「当前分支」的代码一律用它的 `heldBranchWhere`。
  - 工作树：`readActiveBranchToken` 挂在可写检出位上按持有键读那一条，主表集照旧过「恰好一个 active」的守卫。
    捕获核对变更行的 `branchId`：记在别的分支名下，说明有写落到了不属于这套表的表里（比如表集漏登记了版本化实体），
    整笔拒绝，不捕获进当前分支的工作树。打开只读检出位时，快照的来源分支与增量起点同样取这套表持有的分支
    （历史插件的 `compute_switch_branch_actions` 多了可选的起点参数）。
  - 核心 `resolve_current_branch` 同口径：挂在检出位上建分支，父分支是持有分支；工作树插件复制的未提交改动、共享的 HEAD
    都从父分支推出，跟着一起对。
  - 历史插件：重做栈失效与 undo 会话恢复只认记在本实例当前分支上的变更（`RxDBChange` 元事件 `patch` 里的 `branchId`）。
    实例刚从检出位挂回主检出位时，检出位上那几笔写的通知可能迟到，不再作废主检出位的重做栈。
  - 同步插件：挂在可写检出位上的实例不同步（上面「同步归属」）。会和远端交换数据、或替同步收拾本地副本的九个入口
    （`syncBranches` / `pull` / `push` / `sync` / `pullRepository` / `pushRepository` / `syncRepository` / `cleanupExpired` /
    `bulkSync`）一进门就抛；写业务表的同步事务（拉取应用、推送的被拒对齐、过期清理）在事务里再核对一次表集，
    挡住同步跑到一半时换挂。QueryCache 出站队列的自动回推等实例挂回主检出位再跑：挂回那一刻判据翻真，补跑一轮。
    只读的状态查询照常；待拉计数照旧按本实例的当前分支累计，与切分支之后同口径。
  - 一致性：工作树插件的检出位套件（六个后端）加「挂在可写检出位上的写」：写捕获进持有分支的工作树、提交进它的历史，
    主检出位的工作树与业务表一处不动；表集漏登记了版本化实体时整笔被拒、一行不落。两份隔离探针加「挂在检出位上建分支」。
    这组用例在 PGlite 上跑出 B1.3 的一个问题：关系外键的约束名拿带 schema 的物理名拼，影子 schema 更长，63 字节截断提前落到
    表名中间，多对多中间表的两条外键截成同一个名字，建不出来。改成沿用主表集那一份（外键约束名只在同一张表内唯一）。
  - 留给 B2：本地实体事件带分支、活查询按检出位过滤。只有多个标签页同时挂不同检出位时才用得上，与多标签页一起设计、验证；
    此前跨标签页网关转发的实体事件不分检出位。`compute_switch_branch_actions` 仍按主检出位读，随检出位里切分支一起改。
    （两项分别在 B2.3a、B2.2 交付，见下。）
- **可写检出位的生命周期**（阶段 B1.5，owner 2026-10-21 定四项）：
  - 公开 API 在 `rxdb.workingTree.checkouts` 上，动词照 GitHub Desktop：`add(branchId, { name?, owner? })` 开、`mount(id)` 挂上、
    `mountMain()` 挂回主检出位、`release(id)` 交出认领、`remove(id)` 删；`list()` / `prune()` 两类检出位都管，登记行的 `mode` 区分。
    只读检出位的 `open()` / `attach()` 不变。三端绑定随阶段 C。
  - 打开是一笔主库受管事务：分支读得出完整数据、提交图完好 → 持有分支 → 建表集并播种 → 写 `ready` 的登记行。DDL 可回滚，
    崩在哪里都不留半套，也就没有只读检出位那样的 `building` 中间态。不推进激活态，主检出位的工作树与 `activationRevision` 不动。
  - 持有分支先看那一行：`activeKey` 的唯一索引只拦两行写同一个键，拦不住覆盖别人的键。被主检出位或另一个可写检出位持有就抛
    `WorktreeBranchHeldError`，验收 4 的可写检出位这一半就位。
  - 播种：成员表照主表集的定义建好（先不挂触发器），主表的行原样复制（库内 `INSERT … SELECT`，加密列的信封逐字节不变，不要密钥环），
    整数自增主键的序列对齐过去（SQLite 抄 `sqlite_sequence`，PGlite `setval`），再叠上「主检出位所在分支 → 这条分支」的增量
    （只留成员；QueryCache 记日志却不进影子表），最后把触发器挂到持有分支。复制与增量都不记变更日志、不派事件。
    适配器槽位因此改成收调用方的执行器：`createWorktreeTableSet(executor, tableSet, seed)` / `dropWorktreeTableSet(executor, tableSet)`，
    核心只加可选槽位声明与 `WorktreeTableSetSeed`；`convertSwitchResultToSql` 的选项多了 `tableSet`。
  - 关闭是一笔事务：删表集 → 放开持有的分支 → 删登记行。删表集按库里的目录找（后缀匹配），建到一半的、成员已从配置里移除的也删得掉；
    SQLite 系先摘掉这套表的全部触发器，再按「引用别人的先删」把行删空，最后逐张 DROP：`foreign_keys` 开着时 DROP 先隐式删行并执行
    外键动作，触发器还挂着的话多对多中间表的级联删除会被记成持有分支上的删除；先 DROP 了被引用的表，再删引用它的表时级联撞上
    已经不在的表，整笔报 `no such table`（一致性套件在五个 SQLite 系后端上跑出来的）。未提交的改动不丢：检出位里的写都记进了那条分支的变更日志。
  - 认领用检出位的 Web Lock（与只读检出位同一把）：`add()` / `mount()` 拿下、`release()` / `remove()` 还掉，别处认领着时报 `in_use`。
    缺省持久归属（owner 定，与 git、GitHub Desktop 一致）。`prune()` 与启动清理还回收持有的分支已经不在了的可写检出位，
    不需要配快照库：启动清理在能力启用的库上总读登记表（同在引导事务里），只读检出位在没配快照库时不算。
  - 登记表 `Worktree` 加 `mode`、`tableSetSuffix`、`name` 三列，`dbName` 改可空（owner 定：随 #122 同一次发布，这张表没发布过，零迁移）。
    表集后缀取检出位 id 的哈希：`uuid()` 是 v7，直接截前 12 位就是毫秒时间戳，同一毫秒开的两个检出位会撞。
  - 一致性（检出位套件，六个后端）：验收 3（主检出位有未提交改动时在检出位里写并提交，主检出位的分支、工作树、业务表不变，
    删掉检出位再切过去历史里有这个提交）、验收 4（再开被占的分支、开主检出位的当前分支、主检出位切过去都被拒，删掉之后放行）、
    播种 / 写过之后与「删掉检出位再切过去」逐行一致、开删不改主表原值也不写变更日志、密钥环上锁照样开得了、会话与持久归属的回收、
    `in_use`。适配器级（sqlite-core 共享套件与 PGlite 同名用例）：播种不记日志、增量越界整笔拒绝、按目录删、自增序列对齐。
  - **已知限制**（B2 之前；B2.1 起去掉了已解决的项）：整数自增主键跨套可能撞 id
    （owner 定：播种时对齐序列，记限制）；远端分支要先在主检出位上物化才能开、才能在检出位里切过去。
- **守卫与修复**（阶段 B2.1，2026-10-21 调研查出 B1 交付里的缺陷，先修再做 B2 的新能力）：
  - 被可写检出位持有的分支删不掉：`remove_branch` 在 `activated` 之外再看 `activeKey`（核心的 `WorktreeBranchHeldError.heldBy`，
    在事务里返回、事务外抛），git 的 `Cannot delete branch … checked out at …`。从前持有分支的 `activated` 为假、照删不误，
    检出位里没提交的改动（这条分支的变更行）跟着一起没了，挂在它上面的实例甚至能删掉自己的当前分支。合并带 `deleteSource`
    遇到被持有的源分支，合并照常、源分支留着，`sourceDeleteError` 是这个错误。
  - 检出位里合并：目标是持有分支，落进挂着的那套影子表、捕获进它的工作树。只合这套表的成员：源分支里记日志却不进影子表的实体
    （QueryCache 同步的实体）按解析器落回主表，照合会改主检出位的表、记在主检出位的分支名下。判定只有一份，在历史插件的
    `table-set-scope.ts`（主表集什么都管，影子表集只管成员），合并、合并预览与可写检出位的播种都用它。
  - QueryCache 只在主表集：SQLite 的关触发器写（`withTriggersDisabled`）多了表集参数，QueryCache 的两处写摘、挂的是主表集——
    从前摘的是挂着那套的触发器，挂在检出位上回填照样记进主分支的日志，挂回主检出位后出站队列当离线写推回远端；
    出站队列四处读分支（`getCurrentBranch` / `findCurrentSyncRecord` 多了可选的表集参数）都按主表集读——从前读成检出位的分支，
    待推集合是空的，对账会删掉离线新建的行。PGlite 的 QueryCache 写从前根本不摘触发器（主检出位上也记日志，修 main），
    改成同一做法，摘掉触发器之后同事务里读回写入前后的行，提交之后补刷实体缓存、补发实体事件（与 sqlite-core 同口径）。
  - 挂在可写检出位上可推送计数为 0：推送一进门就抛，照分支累计只会显示一个推不出去的数。
  - PGlite 播种：增量带来的行可能用了比主表序列大的 id（别的检出位在自己的序列上发的号），叠完增量之后影子表的 `serial`
    序列要是还会发出表里已有的号，就推到列里的最大值之上；SQLite 的 `AUTOINCREMENT` 插入时自己往前推。
  - 图：边表是插件单独登记的实体（`<节点>_edges`），本来就进影子表集（B1 文档写错了「只在主表集」）。改成按边实体自己的
    元数据解析（去掉 sqlite-core 未发布的 `get_companion_table_name`），节点与边一个进影子表、一个不进时图查询直接拒绝，
    边实体随节点继承 `log: false`（与多对多中间表同一条规则）。
  - 一致性：检出位套件（六个后端）加「被持有的分支删不掉」「检出位里合并」；sqlite-core 共享套件与 PGlite 同名用例加
    「挂在检出位上合并只合成员」「挂在检出位上写 QueryCache 不进日志」（PGlite 另验主检出位上也不进）、PGlite「增量后序列不撞号」；
    图插件 `graph-worktree-table-set.spec.ts`；同步的出站队列、历史的删分支 / 合并 / 可推送计数单测。
- **检出位里切分支、激活版本号按表集、改名**（阶段 B2.2，验收 8）：
  - 两个适配器的切分支去掉「挂在检出位上不能切」的守卫，按挂着的表集分两支：可写检出位那一支先放开原来持有的分支、
    再持有目标分支（只写 `activeKey`，`activated` 恒为假；先放后拿，唯一索引不撞），按增量改这套表、按目标分支重挂触发器，
    `RxDBBranch` 事件的反向补丁翻的是持有键。持有检查带上本套的持有键：主检出位的当前分支、别的检出位持有的分支都拒
    （`WorktreeBranchHeldError`），一行不动。历史插件的增量从本实例当前所在的分支算起、只留这套表的成员。
    改动留在原分支（设计指点 4）：检出位里的写都记进了原分支的变更日志。
  - 激活版本号按表集：主检出位沿用 `'default'` 那一行（全局的分支代际也留在那行），每个可写检出位一行（主键取持有键），
    随打开建、随关闭删。检出位里切分支只推进它自己那一行，主检出位与别的检出位手上的提交凭据照样有效；只有一行的话，
    任何一处切分支都让所有人的凭据失效。登记行的 `branchId` 在切换事务里跟着走（持有关系的真相仍在分支表的持有键上）。
  - 本地只有元数据的远端分支在检出位里切不过去（`branch_not_materialized`）：物化的拉页、封口与屏障都按主检出位那套表写。
  - `checkouts.rename(id, name)`：去首尾空白后不能为空（`invalid_name`），可写检出位之间不重名（`name_taken`，登记表的
    `name` 另有唯一索引），主检出位没有登记行、只读检出位都改不了（`not_found`）；`add()` 同样校验，没给名字时取分支 id，
    被占了加 `-2`、`-3`。`WorktreeUnavailableError` 的文案从「检出位打不开」改成「检出位操作被拒」。
  - 一致性（检出位套件，六个后端）：检出位里切分支（改动留在原分支、与主检出位切过去逐行一致、登记行跟着走）、
    切到被占的分支被拒、激活版本号互不干扰（主检出位之前签出的凭据在检出位切过分支之后照样提交得进去）、激活态行随开删、
    `rename()` 的各种结果；适配器级（sqlite-core 共享套件与 PGlite 同名用例）：只动这套表与这两行的持有键、主检出位那一行不动、
    被占的目标一行不动地拒绝。
- **事件按表集路由**（阶段 B2.3a，验收 9）：
  - 本地实体事件多了可选的 `tableSetSuffix`：写在可写检出位影子表上的带那套表的后缀，主表集上的不带（没有检出位的库，
    事件形状与从前逐字相同）。打标三处：变更行派的事件沿用变更行写入时记下的 `RxDBChange.tableSetSuffix`（系统 schema 8 新增的列，
    主表集与旧日志为 `null`；两个适配器的 `handle_rxdb_change.ts`），不依赖分支此刻的持有关系；切分支与撤销派的事件按写入的执行器挂的那套表；实体管理器的 NEW 事件与
    `notifyExternalUpdate` 按实例挂的那套表。QueryCache、不记日志的实体、`RxDBBranch` / `RxDBChange` 这些只在主表集的不打。
  - 收：`WorktreeTableSet#accepts(metadata, suffix)`，按表集判、不按分支判（主检出位上的几个标签页挂的是同一套主表，
    一个切了分支，另一个读到的也是新分支的数据）。有副本的实体只收自己这套表上的，没副本的、不认得的照收。
    查询管理器的增量合并与搜索插件的事件分派用它；历史插件的 `onLocalCreate` 照旧按变更行的分支判（B1.4b）。网关原样转发。
  - 挂载信号挪到清实体缓存之后：`mountWorktreeTableSet` 在事务里换表集，收尾先 `resetForWorktreeTableSet()`、再发
    `worktreeTableSet$`。订阅方（B2.4 的草稿、B2.5 的检索）拿到信号按新那套重填的缓存，不会被随后的清空抹掉。
  - 能串表的只有增量合并：建行事件让活查询整查（读的是收方自己那套表）；改行事件的负载比收方缓存旧时当陈旧事件、同样整查。
    切分支派出的改行事件带的是目标版本当初的 `updatedAt`，切换又把表里的行改成当下的时间，收方缓存多半更新、碰巧挡住——
    目标版本比收方缓存新时才错合。没有路由时，同一行两套表各有一份、一边改它，另一边的活查询与实体缓存会被改成这边的值。
  - 一致性：sqlite-core 共享套件与 PGlite 同名用例（影子表的写带后缀、主表的不带；检出位里切分支派出的事件带后缀；
    挂载信号在清缓存之后）；wa-sqlite `worktree-cross-connection.spec.ts`（两个真实实例共享持久库，A 挂主、B 挂检出位：
    各自建的行只进自己的活查询、同一行两边各改不串、B 在检出位里切分支不扰 A；关掉过滤时后两条变红）；
    核心单测（`accepts`、查询管理器的过滤、网关原样转发）。
  - 测试顺带修：PGlite 表集 spec 改成每条用例一个新库。撤销会话的边界（变更 id）留在实例内存里，`TRUNCATE … RESTART IDENTITY`
    让变更 id 从 1 重新编号，上一条用例的边界会让下一条的写落在边界之内、不可撤销（用例间残留，不是产品缺陷）。
- **SharedWorker 共用连接**（阶段 B2.3b，修 main）：SharedWorker 里只有一个客户端，每个标签页的适配器都连着它，而适配器只串行
  自己的队列。一个标签页的事务开着时，另一个标签页的 `BEGIN` 当场报「事务里不能再开事务」，普通语句落进别人的事务、随它提交或回滚；
  一个标签页断开会把共用的连接关掉（wa-sqlite 的客户端关了还不能再开），别的标签页随后的读写全部失败。修法：
  - 跨标签页串行：基类多了 `sharedClientLockName()`（wa-sqlite / sqlite-wasm 在 SharedWorker 传输下按适配器名与库名给锁名），
    每个排队任务（`query` / `transaction` / 引导事务 / 系统迁移）都在这把 Web Lock 里跑，含事务开始之前读当前分支的那一次。
  - 孤儿事务：标签页死在事务中间，它的语句已经送到连接上，锁随标签页放开；下一个拿到锁的先调客户端的
    `rollbackOrphanTransaction()`（排在已送达的语句之后看 `get_autocommit`，有没结束的事务就回滚）。
  - 断开只交还自己那一份：`init(dbName, options, owner)` 记下持有者，`addEventListener(type, listener, owner)` 按持有者登记监听，
    适配器断开调 `release(owner)`——摘掉它的监听（Comlink 每传一次监听都在 worker 里造一个新代理，按引用摘不掉；摘下的代理一并释放），
    最后一个持有者交还时才关库，关完回到能再 `init` 的状态。不共用的连法照旧 `disconnect()`。
  - 静音（恢复整库用）是客户端全局的，写明即可：SharedWorker 传输不支持备份与恢复。
  - 一致性：wa-sqlite 与 sqlite-wasm 的 `shared-client.spec.ts`（真实 SharedWorker：一个标签页的事务开着时另一个排在后面、
    一端断开另一端照常读写与收事件且新标签页还能连、孤儿事务被下一个拿锁的回滚；客户端的持有者计数、重复交还、孤儿回滚），
    修之前适配器那三条在两个后端上都红；wa-sqlite `worktree-cross-connection.spec.ts` 按 IndexedDB 多连接与 SharedWorker
    共用连接各跑一遍（共用连接时变更事件由 update hook 直接派给两边，路由同样要挡住）。
- **草稿缓存按检出位、换挂之后旧实体对象存不进另一套表**（阶段 B2.4）：
  - 草稿缓存（`@aiao/rxdb-plugin-workspace`）按分区存：分区就是草稿存下去会写进哪套表（NEW 事件的 `tableSetSuffix`），
    主表集的草稿键照旧 `namespace:entity:id`，可写检出位的草稿键前面加表集后缀（`wt_x:namespace:entity:id`）。
    计划里设想的 `v2:` 前缀与迁移没做：主表集的键不改，旧草稿原样认得，四段键靠首段是不是表集后缀区分。
  - 内存里只有本实例此刻挂的那套表读得到的草稿（视图），判定与活查询的事件路由同一个（`WorktreeTableSet.accepts`）：
    进影子表集的实体只认挂着那套表的分区，不进的（QueryCache 同步的这类）只认主表集，查不到的实体照收。
    `list()` / `discard()`、NEW / CREATE / REMOVE 事件、跨标签页的 add / remove（消息多了可选的 `partition`，旧版本不带、按主表集认）都只看视图。
  - 换挂：插件订阅 `worktreeTableSet$`（B2.3a 已挪到清实体缓存之后发），清掉内存视图，先让排着队的写落盘
    （入队时就按草稿的分区算定了键，换挂之后照常落到旧分区上），再按新挂的那套表装载；`ready` 等它装完。
    装载途中又换了挂、断了连，旧的那一轮按视图的代让位。
  - 保存守卫（核心）：`EntityStatus.tableSet` 记下建出、读出实体时本实例挂的那套表；门面 Repository 的 create / update / remove
    与 `EntityManager.mutations` 在发出写之前核对「这个实体的写落在哪套表」，不符抛 `WorktreeTableSetMismatchError`、一条不写。
    换挂清掉了实体身份缓存，可调用方手里还攥着旧对象（表单、草稿），照存会写进另一套表。不进影子表集的实体、
    同一个检出位重新挂上（后缀相同）都不拦；执行器上的写（事务里的内部写）不过这一道。
  - 一致性：工作区插件单测（检出位上的草稿键、只恢复视图里的、换挂先落盘再换视图且挂回原样恢复、别的表集上的 CREATE 不清草稿、
    广播带分区且收方按视图收、discard 删带后缀的键）与浏览器集成用例（真实 `mountWorktreeTableSet` + 真 IndexedDB：
    分区往返、换挂前的实体存被拒、挂回之后恢复出来的草稿照常存）；核心守卫单测（各写入口、批量整批拒、挂回放行、
    同后缀重挂放行、不进影子表的实体放行）；检出位套件（六个后端）加「主检出位上新建还没存的实体，挂到检出位之后存被拒、一行不落，挂回照常存」。
- **全文检索按表集**（阶段 B2.5）：
  - 核心给插件一个建表集钩子：`IRxDBPlugin.worktreeTableSet?.created(executor, tableSet)`（`WorktreeTableSetHooks`），
    `RxDB.notifyWorktreeTableSetCreated` 按 `use()` 的顺序调。工作树插件的 `checkouts.add()` 在 `createWorktreeTableSet` 之后、
    同一笔事务里调它，任一插件抛错整笔回滚：检出位连同插件建在表上的附属对象要么都建好，要么一处不留。
  - 搜索插件的钩子给成员表各建一份全文索引并回填：SQLite 是影子表自己的 FTS5 外部内容虚拟表 `_fts_<物理表名>`（物理表名带 `$<后缀>`）
    与三个触发器；PGlite 是影子 schema 里那张表上的 `_fts` 列、GIN 索引、触发器，以及同一个 schema 里的触发器函数。复用主表集安装的
    建表、回填、触发器三段，不写迁移记录（那是主表集的账本，签名漂移在主表集那次安装就报了）：目录里齐全且与计划一致就跳过，
    缺了、建到一半、或与计划不一致就整套重建。
  - 物理位置只从适配器的表名解析器出：搜索后端多了 `bindPlan(plan, metadata, tableSet)`，FTS5 换 `sqlTableName`、pg-tsvector 换 `schema`
    （PGlite 的 `./fts` 子路径导出 `getSchemaName`，照旧惰性加载）。安装计划的 `namespace` 字段换成 `schema`，主表集的计划也经
    `bindPlan` 绑：从前 pg 后端拿命名空间直接当 schema，影子表上的索引会建到、查到主表集的 schema 里。门禁加 R4，
    抓 `schema: x.namespace` / `schema = x.namespace` 这类写法。
  - 查询按本实例此刻挂着的那套表解析表名（按表集缓存），翻页的结果池也按表集记；换挂之后（`worktreeTableSet$`）已注册的句柄重查。
    挂上一套还没有全文索引的影子表（插件后装、建表集的一方没调钩子）时，头一次查询先在一笔事务里补建、按当下的表内容回填。
  - 删检出位不用另做。SQLite 删表集按目录找到的也有这套表的 FTS5 虚拟表（名字同样以 `$<后缀>` 结尾）：触发器先摘，内容表排在它前面删空，
    虚拟表的 `DELETE FROM` 扫的是空内容表，`DROP TABLE` 连同它的内部表一起删。PGlite 的 `DROP SCHEMA … CASCADE` 连触发器函数一起带走。
    计划里「删表集先 DROP 虚拟表」那一步因此没做，由下面「删表集之后不留」那条用例在三个 FTS5 后端上守着。
  - 一致性：搜索插件的共享套件 `worktree-search.suite.ts`（sqlite-wasm / sqlite / sqliteai 经浏览器 spec，PGlite 经 node spec）——
    建表集的同一笔事务里建出索引、播种过来的行搜得到；挂上检出位只搜到这套表上的、写入即进索引，挂回只搜到主表上的；
    换挂之后已有的句柄自动重查、查的是新挂上的那套表；删表集之后目录里这套表的对象一个不剩、主表的索引照常；
    没调钩子的表集挂上之后头一次搜时补建，搜不到开检出位之后才写进主表的行。核心单测（钩子按 `use()` 的顺序调、没声明钩子的插件跳过、
    抛错中断）；工作树插件单测（`add()` 建完表集之后在同一笔事务里调钩子）。搜索插件与工作树插件互不依赖，真实的 `checkouts.add()`
    流程在本地一次性核对过（PGlite，未入库）：`add()` 前后变更日志行数与主检出位的 `status()` 不变，装不装搜索插件挂上检出位的工作树状态一样
    （回填不记成改动；建索引走事务执行器的 `query`，不经原始写门禁）。
- **按指纹重建与孤儿回收**（阶段 B2.6，验收 10）：
  - 检出位的指纹自成一份：`RxDB.worktreeTableSetFingerprint(tableSet)` = 成员实体的结构指纹（`WorktreeTableSet.schemaFingerprintOf`，
    在备份清单的键上加 `checks` / `exclusions` / `log`）并上各插件建表集钩子的指纹（`WorktreeTableSetHooks.fingerprint`，按插件名排序）。
    备份清单的指纹键不动，否则已有备份全恢复不了；两者共用的规范化编码拆到 `backup/schema-fingerprint-encoding.ts`，不引系统实体，
    表集模块引它不会在模块初始化顺序里撞上还没定义好的系统实体类。搜索插件的指纹是后端与成员上每个安装计划的签名（字段与分词版本）。
  - `add()` 记下这份指纹，`mount()` 不符就在挂载的那笔事务里重建：删表集 → 按「主检出位所在分支 → 持有分支」的增量重新播种 →
    重跑插件的建表集钩子 → 更新登记行（指纹、来源分支与变更号、`lastAccessedAt`）。持有键与激活态行不动，不重新持有分支；
    检出位里的写都记在持有分支的变更日志上，未提交的改动随播种回来。任何一步失败整笔回滚，抛 `WorktreeUnavailableError('schema_rebuild_failed')`、
    `cause` 是原始错误，检出位原样；挂着它时重建了也重挂一次（实体缓存与活查询是旧那套表的）。只读检出位的 `attach()` 照旧 `schema_mismatch`。
  - 重建会失败或失真的情形（写进文档）：列改了名、新加了没默认值的必填列（增量叠不上新结构，整笔回滚）；新加密的列（旧变更行里是明文，
    播种照搬）；主检出位上不记日志的写（关触发器的拉取回填这类）会混进副本——播种从主表的当前内容出发。
  - 孤儿：两个适配器新增可选槽位 `listWorktreeTableSetSuffixes(executor)`，按目录列出现存的表集（SQLite 系认表名末尾的 `$<后缀>`，
    PGlite 认 schema 名末尾），后缀形状由核心的 `WorktreeTableSet.isSuffix` 判，配置里实体的主表名 / 命名空间恰好长成这样时排除；
    解析写在各自的表名解析器里。工作树插件把「持有键、激活态行、目录里的表集三处任一处还在、登记表里却没有」的认作孤儿，
    只认检出位开出来的那种后缀（`wt_` 加 12 位十六进制）。`prune()` 每套一笔事务删表集、放持有键、删激活态行，交回它的后缀；
    连接期的启动判定在同一笔引导事务里一并找孤儿（登记表与持有键各读一次），有就在连上之后回收。
  - 一致性：检出位套件（六个后端）三条——探针插件改了指纹，`mount()` 重建、重跑钩子，未提交改动还在、与切过去逐行一致，登记行记下新指纹；
    钩子在重建时抛错，`schema_rebuild_failed`、`cause` 原样、登记行指纹不动，指纹改回原样再挂读到的与失败之前一致；删掉登记行造出孤儿，
    分支删不掉，`prune()` 清掉表集、持有键与激活态行之后删得掉。适配器级（sqlite-core 共享套件与 PGlite 同名用例）：列出每一套表集的后缀、
    删掉之后不再列出；主表名恰好长成后缀形状的实体不被认成表集（去掉排除即红）。核心单测（`isSuffix`、`schemaFingerprintOf` 比备份指纹多看
    `log` / `checks`、`worktreeTableSetFingerprint` 合并钩子指纹且与 `use()` 顺序无关）；工作树插件单测（重建先删后建、失败带 `cause` 且还锁、
    启动判定认孤儿持有键而不认手工后缀）；搜索插件单测（指纹只看成员、随可搜索字段与排除名单变）。
- **三端绑定**（阶段 C1）：
  - 三端 `useWorktrees()` 接上可写检出位的六个命令（`add` / `mount` / `mountMain` / `release` / `remove` / `rename`），一个命令一格状态，
    共用核心 `createWorktreeCommands`：改了登记表的 `add` / `mount`（写访问时间，重建时还写指纹）/ `remove` / `rename` 落定之后重读，
    `mountMain` / `release` 不读；失败落格、原样抛出；同一格后发的请求胜出。
  - `mounted` 是本实例此刻挂的那套表，三端都从 `worktreeTableSet$` 取（换挂收尾、清实体缓存之后才发），不读 `rxdb.worktreeTableSet`：
    那个字段在换挂事务里先变，读字段的一端会比另外两端早一步。初值经核心的 `readMountedWorktreeTableSet()` 取，流没在订阅当下交出就抛
    （三端同一句报错）。Angular `toSignal(…, { requireSync: true })`，React `useSyncExternalStore`（store 按库建，换库换订阅），
    Vue `shallowRef` + `onScopeDispose`（表集有私有字段，不进深层代理）。
  - 当前分支的口径随之写进文档：`activeKey === mounted.holderKey`，不再用 `activated`；换挂之后 `useWorkingTree()` 不会自己重读，
    要跟着换的组件订阅 `mounted` 再重读（它没有变更流）。
  - 一致性：核心单测（十格键集与初值、各命令的相位与是否重读、失败落格、同格后发胜出、`readMountedWorktreeTableSet`）；三端
    `use-worktrees.spec` 同标题（十格 idle、`mounted` 跟流走含重建同后缀的新实例、退订、流不给当前值即抛、React 换库与 StrictMode、
    清单守卫加 `mounted`）。三端共用 `./testing` 的 `createWorktreeHookStubs()`，桩的形状只放一处。三个绑定包覆盖率 100%。
- **三端 demo**（阶段 C2）：
  - 当前分支（C2.1）：工作树页、分支下拉的 ✓ 与 `aria-current`、侧栏分支选择器都按 `activeKey === mounted.holderKey` 认当前分支，
    三端各一份纯函数 `currentBranchOf`；「被别处持有」用核心的 `WorktreeBranchHeldError.heldBy` 判（`heldElsewhere`），demo 不另写规则。
    被别的检出位持有的分支照样是合并来源与 History 的对比对象；分支右键的 `Delete…` 只给没人持有的分支（`activeKey` 为空）。
    侧栏选择器补上 `aria-label="当前分支"` 与 `app-branch-select`。React 端单测的模块解析对齐构建（`tsconfigPaths` 与 `@aiao/source` 条件，
    Vue 端本来如此），否则解析不到 package.json 里没声明的绑定包。
  - 一致性：三端同标题的纯函数、分支下拉与侧栏选择器单测（挂在检出位上认那套表持有的分支，挂回主检出位认主检出位停着的那条）。
  - 检出位管理（C2.2）：三端工具栏都分 Main / Linked 两组，当前项用 `aria-current`；主检出位显示它自己持有的分支。
    New Worktree 的分支留空时，以检出位名从当前分支新建分支；显式选择时使用未被持有的现有分支，分支右键可直接进入该流程。
    新建或挂载失败保留对话框，重试复用已建好的分支与检出位；Rename / Delete 失败同样保留输入和错误。
    删除前确认并说明未提交改动仍保留在分支；主检出位不提供改名、删除入口。
  - 换挂时清除旧对比、选中变更与提交详情，重新读取状态与历史；页面写命令与换挂互斥，避免异步凭据读取期间切走表集。
    对话框共用焦点陷阱、恢复焦点与输入法守卫。浏览器验收位于三端 `worktree-management.spec.ts`，覆盖完整流程及明暗主题 axe、Tab / Escape / IME；三端工具栏保留原列宽，窄屏自动换行，菜单打开时缩窗仍保持在视口内。
- **GitHub Desktop 参照**（`desktop/desktop`）：`app/src/ui/branches/branch-list-item-context-menu.tsx`（Checkout in new worktree…）、
  `app/src/ui/history/commit-list.tsx`（Create branch from commit）、`app/src/ui/create-branch/create-branch-dialog.tsx`。

## 实现文件

- `packages/rxdb-plugin-working-tree/src/commit/commit-fork-point.entity.ts`、`commit/commit-fork-point.ts`、`commit/write-commit.ts`
  — 分叉点表、提交时记下与读回核对
- `packages/rxdb-plugin-working-tree/src/working-tree/branch-from-commit.ts`、`working-tree/working-tree-facade.ts`、
  `commit/branch-commit-rows.ts` — 判定、门面方法与「HEAD 指向点名提交」那一支
- `packages/rxdb-plugin-history/src/create-branch.ts` — 在调用方事务里写分支行、远端查重；`packages/rxdb/src/rxdb-plugin-system.ts`
  — 建分支上下文的 `fromCommitId`
- `packages/rxdb-plugin-working-tree/src/working-tree/testing/worktree.suite.ts` — 六个后端的从提交建分支用例
- `packages/rxdb-plugin-working-tree-{angular,react,vue}/` — 三端绑定（`checkBranchFromCommit` / `createBranchFromCommit`）
- `apps/dev-rxdb-{angular,react,vue}` 与对应 `-e2e` — 「Create a branch」对话框、History 右键；三端 Worktree 下拉、New/Rename/Delete 对话框、键盘与 a11y 交互（C2.2）
- `apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.worktrees.ts`、`apps/dev-rxdb-react/src/app/pages/working-tree/utils/worktrees.ts`、
  `apps/dev-rxdb-vue/src/pages/working-tree/utils/worktrees.ts`（`currentBranchOf` / `heldElsewhere`），三端工作树页、分支下拉与侧栏分支选择器
  — demo 认当前分支（C2.1），并把可写检出位绑定到三端工作树页（C2.2）
- `packages/rxdb/src/system/worktree-table-set.ts`、`packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts`、
  `packages/rxdb-adapter-pglite/src/table-name-resolver.ts` — 表集与两个适配器的表名解析器；`scripts/audit/table-name-resolver.mjs` — 门禁
- `packages/rxdb-adapter-sqlite-core/src/table/trigger_sql.ts`（`generate_table_set_trigger_sql`）、两个适配器的
  `createWorktreeTableSet` / `dropWorktreeTableSet` 与系统迁移、`version/switch_branch.ts`、`with_triggers_disabled.ts` /
  `execute_switch_actions.ts` — 按表集建表与重建触发器；`packages/rxdb-adapter-sqlite-core/src/__tests__/shared-worktree-table-set.suite.ts`、
  `packages/rxdb-adapter-pglite/src/__tests__/worktree-table-set.spec.ts` — 隔离探针
- `packages/rxdb/src/RxDB.ts`（`mountWorktreeTableSet` / `worktreeTableSet$`）、`system/worktree-table-set.ts`（`heldBranchWhere`）、
  `system/system-repositories.ts`、`entity/entity-manager.ts`（`resetForWorktreeTableSet`）、两个适配器的 `version/read_current_branch_id.ts`、
  `packages/rxdb-plugin-history/src/HistoryManager.ts` / `undo-redo-apply.ts` — 实例挂可写检出位；挂载用例在上面两份隔离探针里
- `packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts`（`add` / `mount` / `mountMain` / `release` / `remove` / `prune`）、
  `checkout/worktree-writable.ts`、`checkout/worktree.entity.ts`、`checkout/worktree-startup-reclaim.ts`、`plugin.ts`；
  `packages/rxdb-adapter-sqlite-core/src/worktree/worktree-table-set.ts`、`packages/rxdb-adapter-pglite/src/worktree/worktree-table-set.ts`、
  两个适配器的 `version/switch-result.utils.ts` 与 `table-name-resolver.ts`；`packages/rxdb/src/rxdb-adapter.ts`（可选槽位）、
  `system/worktree-table-set.ts`（`WorktreeTableSetSeed`） — 可写检出位的生命周期；六个后端的用例在 `working-tree/testing/worktree.suite.ts`
- `packages/rxdb/src/transaction/transaction-executor.interface.ts`（`tableSet`）与两个适配器的事务执行器、
  `packages/rxdb/src/system/system-repositories.ts`（`resolve_current_branch`）、
  `packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts` / `capture-hook.ts`、`checkout/worktree-snapshot.ts`、
  `packages/rxdb-plugin-history/src/VersionManager.ts`、`packages/rxdb-plugin-sync/src/sync-manager.utils.ts`
  （`assertSyncOnMainCheckout`）/ `SyncManager.ts` / `sync-listeners.ts` 与四处写事务 — 当前分支贯穿捕获、历史与同步；
  六个后端的用例在 `working-tree/testing/worktree.suite.ts`
- `packages/rxdb-plugin-history/src/remove-branch.ts`、`merge-branch.ts`、`branch-compare.ts`、`table-set-scope.ts`、`undo-redo-apply.ts`；
  `packages/rxdb-plugin-sync/src/query-cache-outbox.ts`；`packages/rxdb-adapter-sqlite-core/src/version/with_triggers_disabled.ts`；
  `packages/rxdb-adapter-pglite/src/version/with_triggers_disabled.ts`、`query-cache/query_cache_events.ts`、`worktree/worktree-table-set.ts`；
  `packages/rxdb-plugin-graph/src/sqlite/graph_edge_table.ts`、`graph_edge_entity.ts` — 守卫与修复（B2.1）
- 两个适配器的 `version/switch_branch.ts`（`switchCheckoutBranch`）、`packages/rxdb-plugin-history/src/VersionManager.ts` /
  `switch-branch-actions.ts`、`packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts`（`activationStateIdOf`）/
  `activation-cas.ts` / `materialize-branch.ts`、`checkout/worktree-writable.ts`（登记行跟随、激活态行、名字）/
  `worktree-manager.ts`（`rename`）/ `worktree.entity.ts`、`plugin.ts` — 检出位里切分支、激活版本号按表集、改名（B2.2）
- `packages/rxdb/src/rxdb-events.ts`（`tableSetSuffix`）、`system/worktree-table-set.ts`（`accepts` / `ownerSuffixOf` / `eventTagOf`）、
  `RxDB.ts`（挂载信号）、`entity/entity-manager.ts`、`repository/QueryManager.ts`、`system/change.ts`（`tableSetSuffix` 列）、
  `system/migration.ts`（系统 schema 8）；两个适配器的 `handle_rxdb_change.ts`、`version/execute_switch_actions.ts`；`packages/rxdb-plugin-search/src/plugin.ts`；
  `packages/rxdb-adapter-wa-sqlite/src/__tests__/worktree-cross-connection.spec.ts` — 事件按表集路由（B2.3a）
- `packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts`（`sharedClientLockName` / `clientOwner`）、`sqlite-core.types.ts`
  （`release` / `rollbackOrphanTransaction`）、`handle_rxdb_change.ts`；`packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts`、
  `packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts` 与两个包的 `create_sqlite_client.ts` / `RxDBAdapterSqlite.ts`；
  两个包的 `__tests__/shared-client.spec.ts` 与 SharedWorker 夹具 — SharedWorker 共用连接（B2.3b）
- `packages/rxdb-plugin-workspace/src/workspace-entry.ts`（`workspaceStorageKeyOf` / `splitWorkspaceStorageKey`）、`RxDBPluginWorkspace.ts`；
  `packages/rxdb/src/system/worktree-table-set.ts`（`WorktreeTableSetMismatchError`）、`entity/entity-status.ts`（`tableSet`）、
  `entity/worktree-table-set-guard.ts`、`repository/Repository.ts`、`entity/entity-manager.ts` — 草稿缓存按检出位与保存守卫（B2.4）
- `packages/rxdb/src/rxdb-plugin.ts`（`WorktreeTableSetHooks`）、`RxDB.ts`（`notifyWorktreeTableSetCreated`）；
  `packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts`；`packages/rxdb-plugin-search/src/plugin.ts`、
  `backend/search-backend.ts`（`bindPlan` / `installForTableSet`）、`backend/fts5-backend.ts`、`core/fts5-runtime.ts`
  （`installFtsForTableSet`）、`core/fts5-installer.ts`、`backend/pg/pg-backend.ts`、`pg-runtime.ts`（`installPgFtsForTableSet`）、
  `pg-fts-contract.ts`；`packages/rxdb-adapter-pglite/src/fts/index.ts`（`getSchemaName`）；`scripts/audit/table-name-resolver.mjs`（R4）；
  `packages/rxdb-plugin-search/src/__tests__/worktree-search.suite.ts` — 全文检索按表集（B2.5）
- `packages/rxdb/src/backup/schema-fingerprint-encoding.ts`、`backup/schema-fingerprint.ts`、`system/worktree-table-set.ts`
  （`isSuffix` / `schemaFingerprintOf`）、`rxdb-plugin.ts`（`WorktreeTableSetHooks.fingerprint`）、`RxDB.ts`（`worktreeTableSetFingerprint`）、
  `rxdb-adapter.ts`（`listWorktreeTableSetSuffixes`）；两个适配器的 `table-name-resolver.ts` 与 `worktree/worktree-table-set.ts`（`listTableSetSuffixes`）；
  `packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts`（`mount` 重建、`prune` 收孤儿）、`worktree-startup-reclaim.ts`
  （`findOrphanTableSets`）、`worktree-writable.ts`（`isCheckoutTableSetSuffix`）、`worktree-errors.ts`（`schema_rebuild_failed`）、`plugin.ts`；
  `packages/rxdb-plugin-search/src/plugin.ts`（`fingerprint`） — 按指纹重建与孤儿回收（B2.6）
- `packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts`（六个命令、`readMountedWorktreeTableSet`）、
  `working-tree/testing/use-worktrees-fixtures.ts`（`createWorktreeHookStubs`）；`packages/rxdb-plugin-working-tree-{angular,react,vue}/src/use-worktrees.ts`
  — 三端绑定（C1）
- `packages/rxdb/src/system/active-branch-guard.ts`（`WorktreeBranchHeldError`）、`system/system-repositories.ts`、
  两个适配器的 `version/switch_branch.ts` 与系统迁移（sqlite-core `RxDBAdapterSqliteBase.ts`、PGlite `system/migrate_system_schema.ts`）
  — 分支持有模型

## References

- [PR #122](https://github.com/aiao-io/rxdb/pull/122)（squash `b109ba33`）— 交付
- [GitHub Desktop 3.6: Worktrees and deeper Copilot integration](https://github.blog/changelog/2026-06-26-github-desktop-3-6-worktrees-and-deeper-copilot-integration/)
- [Managing worktrees in GitHub Desktop](https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-worktrees-in-github-desktop)
