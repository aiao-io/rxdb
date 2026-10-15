---
id: epic-010-worktree-contexts
status: In Progress
startDate: 2026-10-13
targetDate: TBD
owner: jimmy
---

# 多检出位（git worktree 能力）

## 愿景

让一个库能**同时打开多条工作线**：不动全库唯一的 active 分支，也能在另一个**检出位**上查看、对比或写入另一条分支
（或某个历史提交），写完经合并回到主线。对照 git，就是一个仓库挂多个 worktree，每个各有自己的 HEAD 与未提交改动。

驱动它的是[三类场景](#三类场景)。三类都卡在同一个前提上：**不切换 active 分支也能读到另一条线**
（见[共同前提](#共同前提不切换也能读到另一条线)）。这是存储层的能力，也是本 Epic 的主体；「给分支起个名字」不是。

## 为什么单列一个 Epic

[epic-006](epic-006-working-tree-commits.md) 交付的是**一个**检出位上的工作树、提交、恢复与分支隔离。本 Epic 要动的是
「业务表 = 唯一检出位」这条存储前提，牵动变更日志、写捕获、合并、同步，以及 storage 与 workspace 两个插件，
不是对 epic-006 某条 FR 的补漏。

## 术语（读本 Epic 前先对齐）

gitglossary（git 2.54，`man gitglossary`）对两个词的定义：

- **working tree**：「The tree of actual checked out files. The working tree normally contains the contents of
  the HEAD commit's tree, plus any local changes that you have made but not yet committed.」
- **worktree**：「A repository can have zero (i.e. bare repository) or one or more worktrees attached to it.
  One "worktree" consists of a "working tree" and repository metadata, most of which are shared among other
  worktrees of a single repository, and some of which are maintained separately per worktree
  (e.g. the index, HEAD …).」

沿用 [epic-006 的前缀归属](epic-006-working-tree-commits.md#术语与既有-workspace-插件的命名冲突处置)，补上检出位一行：

| git 概念            | 中文     | 导出前缀       | 归属                                          |
| ------------------- | -------- | -------------- | --------------------------------------------- |
| working tree        | 工作树   | `WorkingTree*` | epic-006；包 `@aiao/rxdb-plugin-working-tree` |
| worktree            | 检出位   | `Worktree*`    | 本 Epic                                       |
| 编辑器未保存 buffer | 草稿缓存 | `Workspace*`   | `@aiao/rxdb-plugin-workspace`                 |

- **插件包名是 `@aiao/rxdb-plugin-working-tree`**，公开名是 `WorkingTree*`、`db.workingTree`、`useWorkingTree()`。
  它交付的是工作树、提交与历史，按 git 术语正是 working tree。`Worktree*` 只留给检出位，两者不混用。
  本分支上的改名见[本分支现存实现的处置](#本分支现存实现的处置)。
- **今天一个库只有一个检出位**，即**主检出位**：业务表就是它的数据视图。下文的「检出位」都指本 Epic 新增的那种。

## 现状：一个库只有一个检出位

以下各条由读源码确认，复验方式即所附符号与原文；标「推断」的没有跑测试复现。

1. **active 分支全库唯一，由 schema 兜底。** [`active-branch-guard.ts`](../../packages/rxdb/src/system/active-branch-guard.ts)
   文件头：「这一半由 `RxDBBranch.activeKey` 的可空唯一列承担」。同一段注释点名了「两个 Tab 各自 `switchBranch` 的竞态」：
   各标签页、各桌面窗口连的是同一个库文件，共用这一条 active 分支。

2. **分支是变更日志上的一条线，业务表只装 active 分支的数据。** 每条分支由父分支链、分叉点 `fromChangeId`
   和自己的 `rxdb_change` 行组成；变更日志触发器把 active 分支 id 当字面量写死，切换时重建
   （[`switch_branch.ts`](../../packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts)）。
   切分支由 [`compute_switch_branch_actions`](../../packages/rxdb-plugin-history/src/switch-branch-actions.ts)
   沿「当前分支 → 共同祖先 → 目标分支」的变更区间折叠出增删改，再在一个事务里应用；起点写死为当前 active 分支
   （`rules: [{ field: 'activated', operator: '=', value: true }]`）。成本与两条线之间的变更行数成正比（推断），
   不是整表重建。只在远端存在、本地从没物化过的分支
   （[`classifyBranchMaterialization`](../../packages/rxdb-plugin-worktree/src/working-tree/branch-materialization.ts)
   判为 `metadata_only`）首次切换时才拉整份快照。

3. **未提交改动按分支保存，切走再切回原样还在。** 未提交的编辑本身就是那条分支上的 `rxdb_change` 行：
   切走时按 inversePatch 撤掉，切回时重放。[`WorkingTreeState`](../../packages/rxdb-plugin-worktree/src/working-tree/working-tree-state.entity.ts)
   一条分支一行（主键 = `branchId`），切换不碰它。效果相当于 git 每次切分支都自动 stash。

4. **写入只能落在 active 分支上。** 三层锚定：触发器里写死的分支 id；捕获在写事务内读 active 分支令牌；
   令牌与库里的 active 分支不符时 [`write-entry.ts`](../../packages/rxdb-plugin-worktree/src/working-tree/write-entry.ts)
   抛 `StaleActiveBranchError`。除了 `createBranch()` 复制工作树条目、`removeBranch()` 清理，没有任何路径往非 active 分支写。

5. **没有任何 API 能不切换就读到另一条线或某个提交的完整数据。** 最近的积木是上面的 `compute_switch_branch_actions`：
   只读、能在任意事务里跑，算出「当前业务表 → 目标分支」的增量；它从 `@aiao/rxdb-plugin-history` 的桶里作为内部符号导出，
   [`index.ts`](../../packages/rxdb-plugin-history/src/index.ts) 写明「应用代码不该引用它们」。基线提交不带变更单元
   （[`branch-commit-rows.ts`](../../packages/rxdb-plugin-worktree/src/commit/branch-commit-rows.ts)：`units: []`），
   提交图本身拼不出快照。

6. **合并只能合进 active 分支，而且是单向覆盖。** [`VersionManager`](../../packages/rxdb-plugin-history/src/VersionManager.ts)
   的 `mergeBranch()`：`const targetBranchId = currentBranch.id;`。[`merge_branch`](../../packages/rxdb-plugin-history/src/merge-branch.ts)
   把源分支分叉以来的变更（squash 或逐条）写进目标分支，结果是未提交变更，近似 `git merge --squash --no-commit`。
   它不做三方合并：目标分支分叉以来改过的字段会被源分支的值覆盖，插入走 `useReplace: true`
   （[`switch-result.utils.ts`](../../packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts)），没有内容冲突检测。
   US-308 的「冲突」指并发 CAS，不是合并内容冲突。

7. **远端同步写进当前工作树。** [`pull-batch.ts`](../../packages/rxdb-plugin-sync/src/pull-batch.ts) 的 `pullBatchOnce`
   以 `remote_sync` 意图、关掉触发器写业务表，捕获照样记成 `origin = 'remote_sync'` 的未提交单元。epic-006
   [明示接受](epic-006-working-tree-commits.md#工作树包含远端来源的净变化已裁决)「一次后台同步就会让 `status()` 出现未提交变化」，
   并写明「若产品后续不接受"同步即变脏"，另起讨论」，本 Epic 的场景三就是那个讨论的落点。另外，在 feature 分支上拉取时，
   [`pullAncestorBranchChanges`](../../packages/rxdb-plugin-sync/src/pull-ancestor-changes.ts) 对祖先分支只有下界水位
   （`AncestorPullRequest` 只有 `sinceId`），main 在分叉之后的远端变更也会进来。

8. **跨标签页只同步实体事件，不同步分支切换。** [`RxDBTabsGateway`](../../packages/rxdb/src/gateway/RxDBTabsGateway.ts)
   只转发 `ENTITY_LOCAL_CREATE` / `ENTITY_LOCAL_UPDATE` / `ENTITY_LOCAL_REMOVE`；[`SyncManager`](../../packages/rxdb-plugin-sync/src/SyncManager.ts)
   的 `branchSwitchGeneration` 注释自认「A→B→A 在跨标签页时不可见，属已知限制」。

9. **一个页面里可以开多个 RxDB 实例，但实体类不能共用。** demo 的失败归档导入
   （[`failure-archive-import.ts`](../../apps/dev-rxdb-angular/src/app/rxdb/failure-archive-import.ts)）与录制回放
   （[`replay-recording.ts`](../../apps/dev-rxdb-angular/src/app/rxdb/replay-recording.ts)）都另开实例。同一个实体类注册进两个实例后，
   [`entity-manager.ts`](../../packages/rxdb/src/entity/entity-manager.ts) 拒绝：「is registered with multiple RxDB instances」，
   所以失败归档克隆了实体类。工作树捕获挂在各自的适配器实例上（[`rxdb-adapter.ts`](../../packages/rxdb/src/rxdb-adapter.ts)
   的私有字段 `#workingTreeCaptureHook`），两套捕获上下文可以并存。DevTools 只连一个实例
   （[`connector.ts`](../../packages/rxdb-devtools/src/connector.ts)：`DevToolsConnector supports a single RxDB instance`）。

10. **看旧版本只有 `restore()` 一条路，比较只有一条轴，合并前看不到对方。**
    - [`restore-command.ts`](../../packages/rxdb-plugin-worktree/src/working-tree/restore-command.ts)：
      `if (state.entryCount !== 0) return { ok: false, reason: 'dirty_working_tree' };`。restore 把历史内容作为新的未提交变更写回工作树，
      看完只能 `discard()` 整棵工作树。
    - [`diff.ts`](../../packages/rxdb-plugin-worktree/src/working-tree/diff.ts) 文件头：「这里只有一条轴，而且它没有入参」，
      不加第二条轴的理由是 `status()` 的 `clean` 与 `diff()` 会不再指同一件事。
    - demo 的合并对话框（`merge-dialog.component.ts`）只有源 / 目标分支名、合并策略与「合并后删除源分支」，没有预览；
      合并结果直接混进当前工作树。

## 三类场景

价值状态按 [CONVENTIONS 的价值待证](../CONVENTIONS.md#价值待证)：写得出今天用户踩得到的症状才算实。

### 场景一：多个标签页 / 窗口各自检出

- **要什么**：标签页 A 停在 `main`、标签页 B 停在 `feature/x`，各自读写、互不影响。
- **今天**：做不到。active 分支全库唯一（现状 1），一个标签页切了分支，其他标签页的活查询随之读到新分支的数据；
  没带 `expectedActivationRevision` 的写会直接落进新分支（推断：触发器已按新分支重建）。
- **价值状态**：**价值待证**。没有具名诉求；「另开一个标签页看别的分支」只读的那一半由场景二覆盖。

### 场景二：不切换就预览或对比

- **要什么**：看某个历史提交时的完整数据；看另一条分支的数据；合并前看清会改什么。
- **今天的症状**（现状 5、6、10）：看旧版本要先清空工作树、restore 进来、看完 discard；合并没有预览，结果直接混进当前工作树，
  单向覆盖还会悄悄盖掉目标分支上的改动。
- **价值状态**：症状实，三类里最便宜。
- **不覆盖**：BOM 的 ECN 差异。[US-515](../stories/domain/US-515-bom-change-management.md) 已说明它的轴、单位、维度都不是提交图给得了的，
  本场景只解决「轴」。

### 场景三：隔离的写入方

- **要什么**：远端同步、批量导入、AI agent 写进自己的线，用户审完再合并。
- **今天**（现状 4、6、7）：没有往非 active 分支写的入口；同步进当前工作树是 epic-006 接受的取舍；
  合并是单向覆盖，审完再合并也会盖掉用户在主线上的改动。
- **价值状态**：
  - 同步：已记录的取舍，不是缺陷。要改，先由 owner 判断「同步即变脏」是否还可接受。
  - 批量导入、agent：**价值待证**，没有具名使用方。

## 共同前提：不切换也能读到另一条线

现状 1、2 决定了两个同时存在的检出位**不能**是同一个库文件上的两条连接：库里只有一条 active 分支，触发器里写死的也只有它。
可行的只有三种做法：

| 做法       | 怎么做                                                                                                | 查询兼容                                 | 能否写                           | 存储               | 新鲜度                     | 主要代价                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------- | ------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 只读快照库 | 把当前业务表复制进一个独立库，叠上 `compute_switch_branch_actions` 算出的增量，用第二个 RxDB 实例打开 | 全兼容（就是普通库）                     | 只读                             | 每个检出位一份全量 | 建立时刻的快照，刷新即重建 | 增量计算要能指定起点；第二个实例要用克隆的实体类（现状 9）；DevTools 只连主实例                                                             |
| 库内影子表 | 同一个库里每个检出位一套业务表，仓储按检出位路由表名，触发器写各自的分支 id                           | 全兼容                                   | 可写，同库同事务，合并在库内完成 | 每个检出位一份全量 | 实时                       | 表名今天只来自实体元数据、没有改写口；schema 迁移、索引、全文检索要覆盖每套表；「全库唯一 active 分支」要改成「每条分支至多一个可写检出位」 |
| 查询时叠加 | 不复制，查询时把增量叠到业务表上                                                                      | 排序、分页、聚合、关联、全文检索都要重写 | 难                               | 无额外             | 实时                       | 查询引擎改造                                                                                                                                |

**指点**：

- **对比不需要检出位。** 两条分支的差异就是 `compute_switch_branch_actions` 的结果；合并预览就是 `merge_branch` 读源分支变更的那一半，
  再标出目标分支分叉以来改过、会被覆盖的字段。两者都只读，把内部积木提成公开的只读 API 即可，场景二的「对比」与「合并预览」
  先于任何检出位交付。
- **完整只读视图用只读快照库**：查询栈不用动，复用失败归档导入已经走通的「另开实例 + 克隆实体类」做法。
  历史提交的视图沿 restore 的可达性判断取起点（推断）。
- **写进非 active 线是独立的原语**，场景三需要时再做；影子表只在场景一有具名需求时立项；查询时叠加不做。

## 设计指点

1. **检出位不是贴在分支上的名字。** 它有自己的 HEAD（一条分支，或只读时的一个提交）和自己的数据视图。
   只有「id + label + branchId」的一张表不构成检出位。
2. **一条分支至多被一个可写检出位检出**（git：`fatal: 'main' is already used by worktree at …`），只读检出位不受限。
   可写检出位的未提交改动就是它所检出分支的未提交改动：这条规则保证两者一一对应，不需要另一套按检出位存的工作树。
3. **主检出位就是业务表**，永远存在、不可删除。
4. **在检出位里切分支时，改动留在原分支。** 这是现状 3 的直接结果，与 git 的「带着改动切过去」不同，
   相当于 GitHub Desktop 的「Leave my changes on X」。要带过去，另做显式动作。
5. **新检出位从目标分支自己的状态起步**，不复制任何未提交改动。`createBranch()` 复制工作树的现行语义（FR-017）不变：
   那是建分支，不是建检出位。
6. **对比走独立 API，不给 `diff()` 加第二条轴**（现状 10）。
7. **合并回主线之前要能发现覆盖。** 现行合并是单向覆盖（现状 6）。场景三的写入方合并进用户的线之前，
   至少要标出目标分支分叉以来被改过、会被盖掉的字段；完整的三方合并按需另立。
8. **生命周期显式登记**：每个检出位记归属（标签页会话 / 持久 / 后台任务）。标签页崩溃、任务中断留下的检出位要能回收，
   对应 git 的 `worktree prune`。
9. **检出位是本地概念**：不进同步范围，不跨设备。
10. **只读检出位不得进主实例的实体缓存，也不得派发 NEW 事件**，否则草稿缓存会把预览实体当成新草稿（见下节 workspace）。
11. **加密与权限照旧**：快照库里的加密字段按 envelope 原样复制、不先解密，与 epic-006 的加密边界同口径；系统实体权限不放宽。
12. **改「同步即变脏」要单独拍板。** git 的答案是 fetch 进远端跟踪分支、用户再 merge，但那样远端数据在合并前不会出现在业务表里，
    对本地优先应用是语义级变化。只能按实体或同步配置选用，默认行为不变。多检出位下「谁接收同步」也要重新定义
    （现状 7：在 feature 上拉取已经会带进 main 分叉之后的变更）。
13. **三端对称**：检出位的绑定在 Angular / React / Vue 同时交付。

## 对 storage 与 workspace 插件的影响

两个插件都只有核心包、没有三端绑定，demo 直接调用；Vue demo 同时装了 history、storage、workspace 与工作树插件。

### rxdb-plugin-storage：文件不进版本控制

**结论（owner 2026-10-14 确认）：storage 的文件现在不进版本控制**，归入 epic-006
[版本化域](epic-006-working-tree-commits.md#版本化域tracked--untracked)的第四类 untracked。这一类的判据是实体声明的
`log: false`，`StorageFileMeta` 是目前唯一的实例，理由写在那一节的表里。内容寻址等触发条件出现再做，见本节末。

现状（读源码确认）：

- 文件元数据实体 [`StorageFileMeta`](../../packages/rxdb-plugin-storage/src/file-meta.entity.ts) 是业务实体（不在系统实体登记里），
  声明了 `log: false` 与 `SyncType.None`。文件内容放在 OPFS 的 `files/` 目录下，按可变路径存放，不按库名或分支划分；
  覆盖写原路径，删除连文件一起删。
- `log: false` 的表不建变更日志触发器（[`create_tables_sql.ts`](../../packages/rxdb-adapter-sqlite-core/src/table/create_tables_sql.ts)：
  `if (metadata.log !== false) {`），写捕获的挂载点 1 又只从变更日志取增量，所以文件的增删改从不进工作树。
  [US-311](../stories/collaboration/US-311-unlogged-entities-scope.md) 让版本化域按同一个判据把它归为 untracked，
  事务写、批量写、raw 写三条入口口径一致。
- 它与版本化实体可以同事务写入：混用守卫只拦 QueryCache 与其余实体的混用（epic-006 版本化域第一条不变量），
  `log: false` 的实体与版本化实体同走本地事务。
- 仓库里没有业务实体引用 storage 的文件：grep `StorageFileMeta` / `fileId` / `opfsPath` 只命中 demo 的文件管理页与远端资源缓存页
  （`storage.fetch(path, { url })`）。storage 的 README 与文档站写明文件不随分支、提交、恢复变化，需要随版本回溯的附件由应用层
  按不可变方式使用：新内容写新路径，不覆盖、不删除，业务行只存路径。

多检出位下的后果：

- 预览与只读检出位展示的是文件的当前内容，界面标明「不随版本」；
- 按检出位分表（场景一）时，storage 元数据表保持全库共享、不进副本，否则别的检出位的文件会成为看不见的孤儿；
- 隔离写入方导入的文件直接进共享命名空间，不随那条线丢弃，审阅界面要单列出来。

**转为内容寻址的触发条件**：出现第一个引用 storage 文件、并要求恢复、切分支、预览时文件保持一致的业务实体（例如 BOM 物料修订挂图纸）。
届时按 Git LFS 的思路做：文件内容按哈希不可变存储，跨分支、跨检出位共享去重；新增一张记变更日志的引用表
（fileId → 哈希、文件名、类型、大小），让文件随工作树、提交、合并走；回收用标记清除，根集是可达提交、工作树条目、恢复会话、
物化暂存、草稿缓存与上传中的文件，带宽限期与跨标签页锁；配额按哈希全局只计一次；存量文件补一次哈希迁移。
`removeBranch()` 不删提交、历史不改写，所以只有仅被已删分支引用的内容才可能回收。

**不能只把 `log: false` 改成 `true`**：那样只有元数据进版本控制，恢复与切分支会把元数据带回旧状态，
内容却是按路径覆盖后的最新字节或已删除，比不版本化更糟。

### rxdb-plugin-workspace：受影响，改动小

现状（读源码确认）：

- 草稿存在 IndexedDB（库名即 `dbName`，对象仓库 `workspace`），经 BroadcastChannel 同步到所有标签页；键是 `namespace:entity:id`，不带分支。
- 草稿不感知分支：切分支后草稿还在，保存时落进**保存那一刻**的 active 分支。
- 草稿缓存不收两类实体：系统表（每次判定读活登记），与关闭变更日志的实体——后者保存与删除不派发 CREATE / REMOVE，
  草稿等不到收尾。这与多检出位无关，由 [US-311](../stories/collaboration/US-311-unlogged-entities-scope.md) 交付，
  症状与 demo 实测见该故事。

多检出位下（推断）：

- 场景一：草稿要按检出位划分。现行解码把四段键判为损坏，键格式要带版本并迁移；广播与 `list()` 按检出位过滤；
  保存时校验草稿所属的检出位就是当前检出位。
- 场景二：预览实例不得走共享实体缓存与构造器，否则会和用户草稿撞 id、或凭空生成草稿（设计指点 10）。
- 场景三：后台写入方每 `new` 一个实体就是一次 IndexedDB 写和一次广播，批量导入会淹没所有标签页。写入方要用自己的实例，
  或走不产生草稿的写入口。
- 引用文件的草稿是 storage 回收的根之一。

## 分期与解锁条件

| 阶段 | 交付                                                                                                                                                                                             | 覆盖                     | 解锁条件                                                            | 明确不承诺               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------- | ------------------------ |
| 0    | 本分支收尾：不合入 US-309 改名与 US-310                                                                                                                                                          | —                        | 无                                                                  | —                        |
| 1    | 草稿缓存不收系统表与关闭变更日志的实体；版本化域把 `log: false` 的实体归为第四类 untracked；storage 文档写明文件不随版本（[US-311](../stories/collaboration/US-311-unlogged-entities-scope.md)） | 前置                     | 无，今天就是缺口                                                    | 不做检出位；不做内容寻址 |
| 2    | 只读的对比与合并预览 API（含覆盖标注）                                                                                                                                                           | 场景二的对比部分         | 阶段 1                                                              | 不提供完整视图           |
| 3    | 只读检出位：快照库 + 第二实例 + 生命周期与回收 + 三端绑定                                                                                                                                        | 场景二、场景一的只读部分 | 阶段 2                                                              | 不可写；不实时           |
| 4    | 写进非 active 线的原语 + 隔离写入方 + 合并前覆盖检测                                                                                                                                             | 场景三                   | 具名使用方（批量导入或 agent），或 owner 判定「同步即变脏」不可接受 | 不改默认同步语义         |
| 5    | 可写检出位（影子表或分库）                                                                                                                                                                       | 场景一                   | 具名需求                                                            | —                        |

## 本分支现存实现的处置

本分支（`claude/worktree-rename-contexts`）上的 US-309 改名与 US-310 实现都**不合入**。两者都不在 `origin/main` 上，
npm 上也没有 `@aiao/rxdb-plugin-worktree`（`npm view` 返回 E404），撤回没有发布包袱。

- **[US-309](../stories/plugin/US-309-worktree-rename.md) 改名**：理由是「与即将新增的 git worktree 能力（US-310）同词」。
  US-310 不交付，理由随之不成立；`origin/main` 上包名仍是 `rxdb-plugin-working-tree`，不需要反向改名。
- **[US-310](../stories/collaboration/US-310-named-worktrees.md) 钉在分支上的命名 worktree**：不服务任何一类场景，且与检出位语义冲突。
  在 demo 上用 Playwright 从空库实测：
  - 分支菜单带 `requireClean`、worktree 菜单不带，同样是离开有改动的分支，一个被拒、一个放行；
  - 经分支菜单切到未钉住的分支后，「当前 worktree」不存在，主 worktree 的移除按钮变为可用并能删掉；
  - New branch 复制未提交改动，一份改动变两份；
  - `switchWorktree()` 切的是全库 active 分支，发布后要改成「换检出位」只能做破坏性变更。
- **做法**：以 `origin/main` 为底重建本分支，带走本 Epic 和下列与 worktree 无关的修复，然后删掉本节、US-309、US-310 与
  `specs/011-us310-named-worktrees/`，本 Epic 状态改为 `Backlog`。
  - React / Vue 搜索页 `SearchRecordsPanel`、`SearchResultsList` 的 class 拼接漏空格；
  - 分支下拉抽出的 `ToolbarDropdown`：修掉 `role="menu"` 的非法结构（axe `aria-required-children`），三端同改；
  - 新建分支输入框的输入法组合守卫（组字中的回车不提交）。

## 目标

- [ ] 草稿缓存与版本化域都按变更日志归类实体，storage 文档写明文件不随版本（[US-311](../stories/collaboration/US-311-unlogged-entities-scope.md)）
- [ ] 不切换 active 分支就能对比两条分支、预览一次合并会改什么（**尚无故事认领**，场景二）
- [ ] 不切换 active 分支就能只读查看任一分支或可达提交的完整数据（**尚无故事认领**，场景二）
- [ ] 后台写入方写进自己的线，经审阅合并回主线，覆盖可见（**尚无故事认领**，场景三，价值待证）
- [ ] 多个标签页各自检出可写的分支（**尚无故事认领**，场景一，价值待证）

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-310 命名工作上下文（git worktree 能力）](../stories/collaboration/US-310-named-worktrees.md) (High)：不交付，见[本分支现存实现的处置](#本分支现存实现的处置)
- [US-311 不写变更日志的实体与插件系统表退出草稿缓存与版本化域](../stories/collaboration/US-311-unlogged-entities-scope.md) (High)

## 非目标

- **暂存区**：epic-006 已裁掉，检出位不带 index。
- **钉在分支上的 label 层**：见[本分支现存实现的处置](#本分支现存实现的处置)。
- **查询时叠加**：见[共同前提](#共同前提不切换也能读到另一条线)。
- **检出位跨设备**：检出位是本地概念，不进同步范围。
- **`git worktree move` / `lock`**：检出位没有路径；防回收靠生命周期登记。
- **改变默认同步语义**：场景三只提供可选的隔离写入。
