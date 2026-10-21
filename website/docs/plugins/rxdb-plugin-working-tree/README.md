# @aiao/rxdb-plugin-working-tree

`@aiao/rxdb-plugin-working-tree` 为 `@aiao/rxdb` 提供**本地工作树与提交历史**：把「未提交的改动」与「提交历史」作为一等概念加进数据库——用户的编辑先落进工作树而不是直接改主数据，`status()` / `diff()` 查看摘要与逐条改动，`commit()` 一次性提交成快照，`discard()` 整体退回，`listCommits()` 读取当前分支的提交历史，`restore()` 把历史版本的内容搬回工作树。

未装本包的库**零成本**——十二张系统表、写捕获、提交图编解码全部随包走，核心侧只留下装卸口与两道转交门。

## 能力范围

| 能力                       | 说明                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 写捕获                     | 用户编辑落进工作树而不是直接改主数据；库自己的簿记写入（`rxdb_change` 等）不被捕获                                                                   |
| `status()`                 | 当前分支的未提交摘要：条目数、三个捕获位（revision）、来源分布                                                                                       |
| `diff()`                   | 逐条未提交改动；`entity` / `transaction` 两种粒度，支持分页游标                                                                                      |
| `commit()`                 | 把工作树里的**全部**未提交单元提交成一次快照；CAS 落败走返回值而非异常                                                                               |
| `discard()`                | 把工作树整体退回 HEAD                                                                                                                                |
| `listCommits()`            | 当前分支从 HEAD 沿父链可达的提交历史                                                                                                                 |
| `restore()`                | 把一个可达历史提交的内容作为**新的未提交变更**写回工作树；不移动 HEAD、不删历史                                                                      |
| `restoreSession()`         | 当前分支那个尚未结束的恢复会话                                                                                                                       |
| `commits$`                 | 每次 `commit()` **确实写入了新 commit** 时发一次 `{ commitId, branchId }`，供录制回放等订阅方关联提交                                                |
| `switchBranch()`           | 切分支时可以要求「当前分支必须干净」「激活代际必须对得上」；挂在 `@aiao/rxdb-plugin-history` 的 `db.versionManager` 上                               |
| `checkouts`                | 只读检出位：不切换分支、不动工作树，以只读方式打开另一条分支或当前分支上一个可达提交的完整数据（见[只读检出位](#只读检出位)）                        |
| `createBranchFromCommit()` | 从当前分支历史里的一个提交建分支：HEAD 就是那个提交、工作树为空，不切换；`checkBranchFromCommit()` 先问建不建得了（见[从提交建分支](#从提交建分支)） |

## 用之前要知道的六件事

这六条不是注意事项的合集，是**六个会让人做错决定的地方**。放在用法前面，是因为其中三条在数据写进去之后就不可撤销了。

### 1. 提交能力是**数据库级**的显式开关，不是按实体、按分支的

`db.workingTree.enable()` 一次，整个库从此按工作树语义运行——所有实体、所有分支。没有「只让 `Article` 走工作树」，也没有「只在 `feature` 分支上启用」。

启用会在 `rxdb_migration` 里留下一行能力水位，**没装本插件的客户端从此拒绝连接这个库**（见下文「未认领能力守卫」）。因此这不是一个可以「先打开试试」的开关：库一旦启用，所有访问它的客户端都必须装上 `@aiao/rxdb-plugin-working-tree`，包括别人的、旧版本的、你控制不到的那些。v1 **没有 `disable()`**。

### 2. 工作树 ≠ 草稿缓存，两者不是同一层，也不互相替代

|          | 工作树（本包）                             | 草稿缓存（`@aiao/rxdb-plugin-workspace`） |
| -------- | ------------------------------------------ | ----------------------------------------- |
| 内容     | **已经写进数据库**、但还没提交成快照的变更 | 编辑器里那份**还没保存**的 buffer         |
| 存放位置 | 主库的系统表，参与事务                     | 插件自己的 IndexedDB，**根本没进主库**    |
| 查询语义 | `find()` 读到的就是工作树里的值            | 查询看不见它                              |
| 丢失后果 | 用户已保存的工作没了                       | 用户没保存的输入没了                      |
| 生命周期 | 直到 `commit()` 或 `discard()`             | 直到用户保存或丢弃                        |

这两层**不能合并成一层**：合并会让查询语义反转（未保存的 buffer 出现在查询结果里）、表达不了 modified / deleted，而且跨不过事务边界。所以「用户点了保存但还没提交」在工作树，「用户还没点保存」在草稿缓存，一个都不能少。

也因此本包的公开名字里**没有 `Workspace*` 前缀**——那个前缀已经属于草稿缓存，同前缀不同义比同名更容易骗过人。

### 3. `restore()` 是「把旧内容搬进工作树」，不是 checkout

`restore()` 读一个历史提交，把它的内容作为**新的未提交变更**写回当前工作树。做完之后：

- `HEAD` **一个字节都没动**；
- 历史**一条都没删**；
- 工作树是**脏的**，脏在普通条目上，与手写变更同表同形；
- 下一步是 `commit()`（把这次恢复变成一个新提交）或 `discard()`（当作没恢复过）。

**没有 detached HEAD、没有 `checkout()`**：`listCommits()` 返回的是**数据，不是可切换的位置**。只想看一眼另一条分支或一个历史提交，用[只读检出位](#只读检出位)：它把目标的数据建成一份只读快照，HEAD 与工作树都不动。

恢复目标必须在当前分支 HEAD 的可达父链上；够不到就是 `{ ok: false, reason: 'unreachable_target' }`，而不是异常。

### 4. 历史会**原样保留**敏感旧值——删除不等于删干净

提交历史是不可变记录。一个字段被写进过某次提交，它就永久留在那次提交的 `ChangeSet` 里：

- 之后把它改掉、清空、甚至把整行删掉，**都不会**动到历史里的那一份；
- `discard()` 丢的是工作树，不是历史；
- `restore()` 也不删历史（见上一条）。

所以：**不要把不该留痕的东西写进启用了提交能力的库**——密码、明文 token、一次性验证码、用户要求「删除」的个人数据。一旦提交，v1 没有任何公开 API 能把它从历史里抠掉（`commit()` 之外没有写入历史的入口，也没有改写历史的入口——这正是下面第 6 条的另一面）。

合规场景下把这一条读成「本库不适合直接存放需要 right-to-erasure 的字段」，而不是「提交前记得清一下」。

### 5. 加密边界：at-rest 契约延续，但加密不是访问控制

支持字段加密的后端上，提交、ChangeSet、工作树条目与恢复会话里的加密字段仍以 **versioned envelope** 落盘——持久化路径**不会**先解密再把明文写进新系统表。错误、摘要与 benchmark 报告里也不出现加密字段明文。

边界在这里：

- 加密保护的是**落盘的字节**。解锁之后读取照常返回明文业务值，工作树与历史也一样；
- 「历史保留敏感旧值」这条风险**不因为开了加密而消失**——加密只保证别人拿到数据库文件时读不出来，不保证合法用户读不出旧值；
- **at-rest 加密不能被第 4 条的风险提示替代，第 4 条也不能被加密替代**。两条各管一件事。

### 6. 不改写历史：没有 amend / rebase / squash / 强制推送

已经写进历史的提交，v1 **不提供任何改写入口**。没有 `amend`，没有 `rebase`，没有 `squash`，没有「修改提交信息」。

- CAS 落败丢掉的提交、被删分支留下的节点，行都还在库里，只是没有任何 ref 指向它们——「历史 ≠ `rxdb_commit` 全表」；
- 提交图损坏时守卫把分支置为 `corrupted_read_only` 并留下诊断，**不动 HEAD、不删记录**（FR-022）：自动回退到较早提交能让界面继续转，代价是用户的数据在他不知情时被换掉；
- v1 也**不提供 auto-baseline**（同步后自动把远端变化并入 HEAD）——那会造出「谁在什么时刻替用户提交了什么」的隐式历史。

### 另外：远端同步会产生 `origin = 'remote_sync'` 的未提交变化

这一条经常出乎意料，所以单独说：**远端同步拉下来的变更，和用户自己的编辑一样进工作树**，不自动进历史。

- 它们在 `status().byOrigin` 里计入 `remote_sync`，**不豁免**：`clean` 会因此变成 `false`，`entryCount` 会涨；
- 它们会被下一次 `commit()` 一并提交——`commit()` 提交的是工作树里的**全部**未提交单元，没有子集；
- 提交者是**这次 `commit()` 的 `authorId`**，不是远端那个作者。v1 刻意不伪造远端作者身份；
- 因此「一次同步之后工作树突然脏了」是**正常行为**，不是缺陷。要区分谁写的，读 `diff()` 每条的 `origin`。

如果界面上有「有未提交改动」的提示，记得它会被后台同步点亮。

### 另外：不进版本控制的数据

默认每个业务实体都进版本控制。例外只有四类，它们的变化不进 `status()` / `diff()` / `commit()`，`restore()` 也不会带回：

- `SyncType.QueryCache` 的实体：可从远端重建的缓存；
- 实体行上的 `remoteId` 与审计时间（`createdAt` / `updatedAt`）：同步与簿记字段，不表达用户意图；
- 插件在业务表上登记的派生索引列；
- 关闭变更日志（`@Entity({ log: false })`）的实体，如 storage 插件的文件元数据：它们不写变更日志，分支、历史与撤销本来就看不见它们。

关闭变更日志的实体可以与版本化实体在同一个事务里写；QueryCache 实体与其余实体混在一个事务里会被拒绝（`mixed_versioned_cache_transaction`）。

## 能力边界：绕过 adapter 的写入拦不住

写捕获只覆盖**经 adapter 的写路径与 adapter 公开的批量写方法**。下面这些**拦不住，v1 也不承诺拦得住**：

- 另一个进程直接打开同一个 SQLite 文件写入；
- 另起一个 PGlite 实例指向同一份数据；
- DevTools 里手写 SQL；
- 任何绕过 `@aiao/rxdb` 的外部数据库句柄。

这类写入不进工作树、不进历史、不会被 `status()` 看见，而且会让工作树与主数据之间的关系**静默失真**。

所以启用了提交能力的数据库有一条硬约束：**业务表只能经 RxDB 写入**。

这句话写在这里不是免责声明的注脚——**不假装拦得住比拦不住更重要**。一道号称拦得住却拦不住的门禁，会让人把「没报错」当成「没被绕过」，而真正被绕过的那次同样不报错。

## 安装

```bash npm2yarn
npm install @aiao/rxdb-plugin-working-tree
# 框架绑定（按需选其一）
npm install @aiao/rxdb-plugin-working-tree-angular
npm install @aiao/rxdb-plugin-working-tree-react
npm install @aiao/rxdb-plugin-working-tree-vue
```

peer dependencies：`@aiao/rxdb`、`rxjs`；框架绑定另需对应的 `@aiao/rxdb-angular` / `@aiao/rxdb-react` / `@aiao/rxdb-vue`。

:::info `switchBranch()` 还要装历史插件
下文「切分支的前置条件」用的 `db.versionManager` **不是本包挂的**，也不在 core 里——它由
`@aiao/rxdb-plugin-history` 在连接纪元内挂载（见[分支管理](../../collaboration/branch.md)与[历史与同步拆包](../../migration/history-sync-plugins.md)）。

只用工作树与提交（`status()` / `diff()` / `commit()` / `discard()` / `listCommits()` / `restore()`）**不需要**它；
要用 `switchBranch()` 的那两道前置，就得把它一起装上、一起 `use()`：

```bash npm2yarn
npm install @aiao/rxdb-plugin-history
```

没装时 `db.versionManager` 是 `undefined`——core 不做 fallback 兜底。
:::

## 注册插件

```typescript
import { RxDB } from '@aiao/rxdb';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

const db = new RxDB(config);
db.use(rxDBPluginWorkingTree); // ← 必须在 connect() 之前
await db.connect('sqlite-wasm');

await db.workingTree.enable(); // 既有库上是一次迁移，新库上是一次幂等确认
```

要用 `switchBranch()` 的两道前置，再把历史插件一起 `use()` 上——`db.versionManager` 由它挂载，本包只往上加前置：

```typescript
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';

db.use(rxDBPluginWorkingTree);
db.use(rxDBPluginHistory);
```

:::warning
**`use()` 必须排在 `connect()` 之前。** 本插件声明 `system`（`RxDBSystemContribution`），
宿主要在建表之前读走它的实体、初始行与迁移；`connect()` 之后再 `use()` 已经赶不上建表，
核心会当场抛错而不是静默跳过。
:::

`db.workingTree` 是**非可选**成员，由 `declare module '@aiao/rxdb'` 增广而来：装了本包才存在这个入口，没装时 `db.workingTree` 是编译错误，而不是运行期的 `undefined`。能力未启用时它照样在，但每个方法以 `commit_capability_disabled` 拒绝。

## 启用能力

`enable()` 是**幂等**的：既有库上翻能力位并给每条本地分支补根节点（同一个事务），新库上是一次确认。之后本进程从下一次写开始捕获进工作树；这一笔启用本身属于 HEAD，不属于工作树。

```typescript
await db.workingTree.enable();
console.log(await db.workingTree.isEnabled()); // true
```

未启用时调用其余成员会抛 `WorkingTreeCapabilityDisabledError`（`code: 'commit_capability_disabled'`）——这是「还没启用」，出路是 `enable()`；与「启用了但版本对不上」（`UnsupportedRxDBSystemVersionError`，出路是升客户端或跑迁移）是两件事。

## 状态与改动

### `status()`

零参——摘要问的是「当前分支现在怎么样」，而当前分支由 active 分支唯一确定。

```typescript
const status = await db.workingTree.status();
console.log(status.entryCount, status.clean, status.byOrigin);
```

返回 `WorkingTreeStatus`：

| 字段                  | 类型                         | 说明                                           |
| --------------------- | ---------------------------- | ---------------------------------------------- |
| `branchId`            | `string`                     | 当前 active 分支 id                            |
| `entryCount`          | `number`                     | 未提交条目数                                   |
| `clean`               | `boolean`                    | 没有未提交条目                                 |
| `restoring`           | `boolean`                    | 有未结束的恢复会话，且捕获的 revision 仍对得上 |
| `conflicted`          | `boolean`                    | 有未结束的恢复会话，但捕获的 revision 已经分叉 |
| `byOrigin`            | `WorkingTreeOriginBreakdown` | 条目按来源分布；`remote_sync` **不豁免**       |
| `activationRevision`  | `number`                     | 捕获位之一：分支激活 revision                  |
| `headRevision`        | `number`                     | 捕获位之一：HEAD 推进 revision                 |
| `workingTreeRevision` | `number`                     | 捕获位之一：工作树 revision                    |

三个 revision 字段缺一不可：它们恰好是 `commit()` / `discard()` 要求调用方捕获的那三个位。少给一个，调用方就永远构造不出一次不会撞 `CommitConflict` 的提交。

### `diff(options?)`

只有一条 diff 轴：`HEAD ↔ 工作树`。没有 `from` / `to` / `ref` 入参，也不收 `branchId`。

```typescript
const diff = await db.workingTree.diff({
  granularity: 'transaction', // 'entity' | 'transaction'，默认 'entity'
  entities: ['Article'], // 只看这些实体；空数组 = 一个都不看
  limit: 50, // 不给即一次给全
  cursor: diff.nextCursor // 分页续读
});
```

返回 `WorkingTreeDiff`：`branchId`、`baseHeadCommitId`（分支还没有任何提交时为 `null`）、`workingTreeRevision`、`granularity`、`entries`（实体粒度行）、`transactions`（事务粒度组）、`nextCursor`（到末尾为 `null`）。两种粒度互斥：实体粒度下 `transactions` 恒为空数组，反之亦然。

`WorkingTreeDiffEntry` 与 `CommitChangeSet` 的列逐一对齐——提交时这批单元原样变成变更集：`unitId`、`transactionId`（单次 `save()` 为 `null`）、`namespace`、`entity`、`entityId`、`operation`、`patch`、`inversePatch`、`origin`（`'local' | 'remote_sync'`）。

## 提交与丢弃

### `commit(message, options)`

把当前分支工作树里的**全部**未提交单元提交成一次快照。恰好两个位置参数：没有 selection 入参，也没有可选的第三参。写 commit 与清空工作树在同一个事务里。

```typescript
const status = await db.workingTree.status();

const result = await db.workingTree.commit('保存', {
  expectedBranch: {
    branchId: status.branchId,
    activationRevision: status.activationRevision
  },
  expectedHeadRevision: status.headRevision,
  expectedWorkingTreeRevision: status.workingTreeRevision,
  authorId: 'alice',
  operationId: crypto.randomUUID()
});

if (result.ok) {
  console.log('已提交', result.commitId, result.changeSetCount, '个单元');
} else {
  // 别人先提交了：conflict 里带着新的 revision，重读 status 后重试即可
  console.warn(result.conflict);
}
```

| 入参字段（`CommitOptions`，全部必填） | 说明                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `expectedBranch`                      | 捕获时的 active 分支**令牌**：`{ branchId, activationRevision }`——只认 `branchId` 的话，`main → feature → main` 一个来回之后令牌又「对上了」，而这中间工作树已经换过两轮 |
| `expectedHeadRevision`                | 捕获时的 HEAD 推进 revision                                                                                                                                              |
| `expectedWorkingTreeRevision`         | 捕获时的工作树 revision                                                                                                                                                  |
| `authorId`                            | 提交作者；落进不可变历史的 `Commit.author`                                                                                                                               |
| `operationId`                         | 调用方的操作 id；同一次逻辑提交的重试必须带同一个值（幂等键）                                                                                                            |

返回 `CommitResult`——判别位是 `ok`：

- `ok: true`：`commitId`（新提交 id）、`changeSetCount`（变更单元数）、`headRevision`（推进后的 HEAD revision）
- `ok: false`：`conflict`（`CommitConflict`），本次提交一个字节都没落地

### CAS 与 `CommitConflict`

三个捕获位（分支身份、HEAD revision、工作树 revision）是提交的 CAS 凭据。任何一个对不上，提交落败并返回：

```typescript
interface CommitConflict {
  kind: 'working_tree_revision' | 'head_revision' | 'activation_revision';
  expected: number; // 调用方捕获的值
  actual: number; // 事务里读到的当前值
  branchId: string; // 当前 active 分支 id
}
```

落败走**返回值而不是异常**——CAS 冲突是并发编辑的正常出口，不是错误。三种 `kind` 的出路是同一条：重新 `status()`、让用户复核、再提交一次。`conflict` 不入库，也没有「清除冲突」的 API。

### `discard(options)`

把当前分支的工作树整体退回当前 HEAD。恰好一个必填位置参数（同 `WorkingTreeCredentials`）。

```typescript
const status = await db.workingTree.status();

const result = await db.workingTree.discard({
  expectedBranch: {
    branchId: status.branchId,
    activationRevision: status.activationRevision
  },
  expectedHeadRevision: status.headRevision,
  expectedWorkingTreeRevision: status.workingTreeRevision
});

if (result.ok) {
  // result.discardedCount：本次丢掉的单元数；0 即语义 no-op（工作树本来就是干净的）
} else {
  console.warn(result.conflict);
}
```

### `listCommits(options?)`

当前分支从 HEAD 沿完整父链可达的提交历史。与 `status()` / `diff()` 同样不收 `branchId`。

```typescript
const page = await db.workingTree.listCommits({
  limit: 20, // 从 HEAD 端起最多返回多少条；不给返回整条可达历史
  since: new Date('2026-01-01'), // 数据库时间下限
  until: new Date('2026-09-01'), // 数据库时间上限
  entity: 'Article' // 只要动过这个实体的提交
});
```

返回 `CommitLogPage`：`branchId`（恒为读取时刻的 active 分支）、`headCommitId`（一次都没提交过时为 `null`）、`entries`（最新在前）。一次都没提交过的库是 `entries` 为空的一页——这是**有语义的空**，不是错误。

`CommitLogEntry` 是 `Commit` 实体列的一个子集：`commitId`、`parentIds`、`firstParentId`（根节点为 `null`）、`kind`（`'normal' | 'baseline' | 'branch_baseline'`，后两者是系统根节点，不是用户提交）、`message`、`authorId`、`createdAt`、`changeSetCount`。`operationId` 与 `contentFingerprint` 被刻意挡在公开面外——实体是存储细节，历史不可变不靠口头约定。

> 历史 ≠ `rxdb_commit` 全表：CAS 丢掉的提交与被删分支留下的节点，行都还在，但没有任何 ref 指向它们。

### `commits$`

每次 `commit()` **确实写入了新 commit** 时同步发出一次 `WorkingTreeCommitEvent`（`{ commitId, branchId }`）。发出时事务已提交、`commit()` 的 Promise 还没 resolve，所以 `await commit()` 之后订阅者一定已经收到，回调里 `listCommits()` 也一定读得到这个 `commitId`。

```typescript
db.workingTree.commits$.subscribe(({ commitId, branchId }) => console.log(branchId, commitId));
```

- **不发**：`ok: false`（凭据冲突 / CAS 落败）、抛错、同一 `operationId` 的幂等重放（它同样回 `ok: true`）、`enable()` 的基线、`restore()` / `discard()`。按返回值自己判断的话，幂等重放会被记两次。
- 载荷只有这两个关联键；消息、作者等用 `commitId` 去 `listCommits()` 读落库后的真值。
- 订阅者抛错不影响 `commit()` 的返回值，也不影响其他订阅者。
- 不经启用门禁：未启用提交能力的库上也能订阅，只是永远不发。流不 `error`、不 `complete`。

[`@aiao/rxdb-plugin-replay`](../rxdb-plugin-replay/README.md) 靠它在录像时间轴上写 commit 标记。

## 恢复历史版本

### `restore(target, options)`

把一个可达历史提交的内容作为**新的未提交变更**写回当前工作树。**恰好两个必填位置参数**，与 `commit()` 同形——`options` 做成可选的话，「缺省时由本次调用内部读 revision」就成了合法用法，而内部读到的恒等于当前值、CAS 永远命中。

```typescript
const status = await db.workingTree.status();

const result = await db.workingTree.restore(
  { commitId: 'commit-abc' }, // 缺省 entities = 整个 commit 的全部单元
  {
    expectedBranch: {
      branchId: status.branchId,
      activationRevision: status.activationRevision
    },
    expectedHeadRevision: status.headRevision,
    expectedWorkingTreeRevision: status.workingTreeRevision
  }
);
```

`target.entities` 可以只点名一部分单元（`{ namespace, entity, entityId }` 三段全给）。这与「`commit()` 不能挑子集」不冲突，方向恰好相反：这里挑的是**要往工作树里写什么**，写完之后它们和手写变更一样是整棵工作树的一部分，下一次 `commit()` 照样全量提交。

返回 `WorkingTreeRestoreResult`，判别位是 `ok`：

| 出口                                       | 含义                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `ok: true`                                 | `restoredCount`（写进工作树的条目数）、`sessionId`、`workingTreeRevision`；`restoredCount: 0` 是一次什么都没写的 no-op    |
| `ok: false, reason: 'conflict'`            | 三个捕获位对不上；带 `conflict`，与 `commit()` 同形                                                                       |
| `ok: false, reason: 'dirty_working_tree'`  | 工作树不干净——先 `commit()` 或 `discard()`                                                                                |
| `ok: false, reason: 'incompatible_schema'` | 重放路径上有本客户端认不出的实体；带 `incompatible`（首个不兼容节点、重放方向、实体与版本 manifest，**不含 patch 内容**） |
| `ok: false, reason: 'unreachable_target'`  | 目标提交从当前 HEAD 够不到                                                                                                |

四个被拒成因**全部走返回值**，不是异常：它们都是用户随手点错一个历史条目就会走到的日常路径，而不是「库坏了」。被拒时持久状态**逐字节不变**。

兼容性预检发生在**任何持久写入之前**，覆盖整条重放路径上的**每一个**节点——不是只看目标节点：真正被读取并应用的是 HEAD 到目标之间每一个节点的 inverse patch，中间任何一个引用了本客户端不认识的实体，物化结果就已经错了，而目标节点自己干干净净。

### `restoreSession()`

当前分支那个尚未结束的恢复会话；没有就是 `null`。与 `status()` / `listCommits()` 一样**不收 `branchId`**——会话恒属当前 active 分支。

```typescript
const session = await db.workingTree.restoreSession();
// { id, branchId, targetCommitId, status } | null
```

会话是**一行库表，不是一个内存字段**：跨标签页与刷新之后，「这次恢复来自哪个提交」必须还能问出来。

「这次恢复还成不成立」不在这个入口回答，那是 `status()` 的两位：

- `restoring: true` —— 有未结束会话，且捕获的 revision 仍对得上；
- `conflicted: true` —— 有未结束会话，但捕获的 revision 已经分叉。

`conflicted` 的会话**不是**空会话：它仍占着唯一索引，仍拦着下一次恢复。

## 切分支的前置条件

### `db.versionManager.switchBranch(branchId, options?)`

切分支挂在 `db.versionManager` 上，不在 `db.workingTree` 上——分支属于 `@aiao/rxdb-plugin-history`，工作树只是给它**加了两道可选前置**。

因此本小节的每一行都以「装了历史插件」为前提：没 `use(rxDBPluginHistory)` 时 `db.versionManager` 是 `undefined`，报错报在读槽位那一行，与前置条件无关。

```typescript
// 无条件切换：与没装本插件时逐字节一致
await db.versionManager.switchBranch('feature');

// 当前分支必须干净，否则抛 WorkingTreeDirtyError
await db.versionManager.switchBranch('feature', { requireClean: true });

// 激活代际必须对得上，否则抛 StaleActiveBranchError
await db.versionManager.switchBranch('feature', {
  expectedActivationRevision: status.activationRevision
});
```

| 字段                         | 说明                                                     |
| ---------------------------- | -------------------------------------------------------- |
| `requireClean`               | 缺省 / `false` = 不表态；`true` 时当前分支非空就拒绝切换 |
| `expectedActivationRevision` | 提供时，激活代际与库里的对不上就拒绝切换                 |

两个字段都是**可选**的，而且**不传就是不传**：一个条件都没提出时，这条路径一条语句都不发——不是「读了再忽略」。`requireClean: false` 与不传是同一件事。

**被拒走异常，不走返回值**——这与 `commit()` / `restore()` 恰好相反，理由是那一刻分支**根本没切**，没有任何结果可以交给调用方：

```typescript
import { WorkingTreeDirtyError } from '@aiao/rxdb-plugin-working-tree';

try {
  await db.versionManager.switchBranch('feature', { requireClean: true });
} catch (error) {
  if (error instanceof WorkingTreeDirtyError) {
    // error.branchId / error.entryCount：「main 上还有 2 条未提交改动，先提交或丢弃」
  }
}
```

v1 **没有自动 stash，也不携带脏工作树跨分支**：工作树属于分支，切过去看到的是**那条**分支的工作树。

另一道前置不受 `requireClean` 控制：**目标分支的提交图必须完整**。它单独判、单独抛，`requireClean: false` 关不掉它——否则历史子系统的回放路径就能切进一份重放不出来的历史。

## 从提交建分支

### `createBranchFromCommit(branchId, commitId)` 与 `checkBranchFromCommit(commitId)`

从当前分支历史里的一个提交建一条分支（US-314 阶段 A），与 git 的 `git branch <name> <commit>` 同义：新分支的 HEAD 就是那个提交，与原分支共享它之前的历史；工作树为空；切过去读到的是那次 `commit()` 刚完成时的业务表。当前分支一格都不动，它的未提交改动留在原地。

**只建不切**——GitHub Desktop 的「Create branch from commit」建完会检出新分支，那一步由调用方接着调 `switchBranch()`：

```typescript
const check = await db.workingTree.checkBranchFromCommit(commitId);
if (!check.ok) {
  // check.reason：'unreachable_target' | 'fork_point_unknown' | 'history_rewritten'
}

const result = await db.workingTree.createBranchFromCommit('fix/login', commitId);
if (result.ok) {
  await db.versionManager.switchBranch(result.branch.id, { requireClean: true });
}
```

`checkBranchFromCommit()` 不写任何东西，给界面在要名字之前先问一句；两次调用之间库可能变了，`createBranchFromCommit()` 会重判。被拒的三种成因都走**返回值**：

| `reason`             | 含义                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `unreachable_target` | 提交不在当前分支 HEAD 的可达父链上，与 `restore()` 同名同义                                    |
| `fork_point_unknown` | 提交没有记下分叉点：分叉点表出现之前的提交，或 metadata-only 分支首次物化写下的基线            |
| `history_rewritten`  | 提交之后有过撤销或重做，改动了新分支要继承的那段变更日志，切过去读到的已经不是那次提交时的数据 |

能力未启用、提交图损坏、分支 id 不可用或本地 / 远端已有同名分支，**抛错**，与 `createBranch()` 同文案。

分叉点在提交时与提交同一事务记下（`rxdb_commit_fork_point`）：新分支挂在提交所在的分支上，在那一刻它停下的变更处分叉，数据由变更日志沿谱系折叠出来。两点与切分支今天的行为一致，要心里有数：

- **不进变更日志的写会被带上**：提交之后的拉取、过期清理关着触发器写业务表，切换不会撤掉它们，新分支也就带着它们。
- **建完之后再在父分支上撤销分叉点之前的变更**，新分支的数据跟着变，与任何一条子分支一样。

## 只读检出位

不切换分支、不动工作树，以只读方式打开另一条分支或当前分支上一个可达提交的**完整数据**，用平常的查询与实体列表浏览（US-313）。`db.workingTree.checkouts` 把业务数据复制进一个独立的快照库，叠上从当前分支走到目标点的增量，再用第二个 RxDB 实例只读打开它。

| 视图     | 目标           | 看到的是                                                                                          |
| -------- | -------------- | ------------------------------------------------------------------------------------------------- |
| 分支视图 | `{ branchId }` | 那条分支此刻的数据，含它的未提交变更，与「切过去读到的数据」逐行一致                              |
| 提交视图 | `{ commitId }` | 当前分支上那次 `commit()` 刚完成时的已跟踪数据；提交要在 HEAD 的可达父链上，与 `restore()` 同口径 |

快照是**建立时刻**的数据，不实时；`view.refresh()` 按同一个目标重建一份。

### 配置快照库

快照库与主库是**同一种后端**、各用各的库名。插件选项 `worktrees.adapter` 给出快照实例的适配器工厂，存储位置按快照实例自己的 `db.config.dbName` 定（`wt-` 加一串散列，每个检出位一个）：

```typescript
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';

db.use(rxDBPluginWorkingTree, {
  worktrees: {
    // 主线程 IndexedDB：每个检出位一个独立的 IndexedDB 库，关闭时删得掉
    adapter: snapshot => new RxDBAdapterSqlite(snapshot, { vfs: 'idb' }),
    // 快照实例只装读侧要的插件：实体用到 TreeRepository 就要装树插件
    plugins: [rxDBPluginTree]
  }
});
```

:::warning
**不要照搬主库的适配器工厂。** 主库若跑在 Worker / SharedWorker 里、按外层库名或常量给 Worker 命名，Worker 里的客户端初始化过一次就直接复用，快照实例会悄悄连到主库上。连错了也写不坏主库：快照实例带一条只在快照库上登记的标记迁移，误打开已有的库时当场以 `adapter_mismatch` 失败。
:::

`plugins` 里不要装写侧插件（history / sync / workspace / working-tree / storage / search）。

### 打开、浏览、关闭

```typescript
const view = await db.workingTree.checkouts.open({ branchId: 'feature/x' }); // 或 { commitId }

const FeatureTodo = view.entityOf(Todo); // 主实例的实体类 → 快照实例上的对应类
const todos = await firstValueFrom(
  view.rxdb.entityManager.getRepository(FeatureTodo).findAll({ where: { combinator: 'and', rules: [] } })
);

await view.close(); // 断开只读实例，删快照库与登记
```

| 成员              | 说明                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `view.rxdb`       | 只读的第二个实例；交给各端的 Provider，现有查询 hook 与 rxdb-model 的实体列表照用            |
| `view.entityOf()` | 主实例的实体类在快照实例上的对应类（同命名空间、同名）；快照里没有时抛 `incomplete_entities` |
| `view.refresh()`  | 按同一个目标重建快照，交回新视图，旧的随之关闭                                               |
| `view.close()`    | 断开、删快照库、撤销登记                                                                     |
| `view.release()`  | 只断开与放开锁，登记与快照库留着：持久归属的留给 `attach()`，会话归属的留给 `prune()`        |

`checkouts.list()` 读登记表，`checkouts.attach(id)` 再打开一个持久归属、已建完的检出位（不重建快照），`checkouts.prune()` 回收没人在用的。

### 只读，且不污染主实例

- **三层只读**：核心的 `readOnly` 让公开写入口抛 `RxDBReadOnlyError`；只读捕获钩子拦适配器层的批量写与 raw 写；引擎封印（SQLite `PRAGMA query_only`、PGlite 只读事务）兜住直接打到适配器的写。快照库与主库都不变。
- **实体类是克隆**：同一个实体类不能注册到两个实例，快照实例用 `cloneEntityClasses()` 克隆出来的类，主实例的实体缓存、NEW 事件、草稿缓存都碰不到它们。核心系统实体两个实例共用同一个类，`RxDBBranch.find()` 这类静态调用落到可写的主实例。
- **加密照旧**：加密字段按信封原样复制、不解密，建快照不调用密钥环。快照实例与主实例共用同一个密钥环（信封的 AAD 绑定库名），在快照实例上 `lock()` 也会锁住主库。

### 快照里有什么

复制的是主实例上的业务表；系统表（快照实例有自己的一套）、QueryCache 实体与只有远端一侧的实体不复制，全文搜索不装（搜索插件要往快照库写索引）。不记变更日志（`log: false`）的实体照常复制，但增量不碰它们：它们在快照里是**打开那一刻的内容**，不随检出的分支或提交。storage 的文件元数据就是这样；文件本身不进快照，按路径读到的是读取时的当前内容。界面上要标「不随版本」。

### 生命周期与回收

- 每个检出位一把**排他** Web Lock：写登记行之前拿下，关闭或放开时还。标签页关掉或崩掉，浏览器替它还锁：「锁没人持有」即「没人在用」。同一个检出位同一时刻只能在一处打开，`attach()` 拿不到锁即 `in_use`。
- `owner: 'session'`（默认）是会话归属，标签页没了就该回收；`owner: 'persistent'` 放开之后还在登记里，刷新页面后 `attach(id)` 原样打开。
- `prune()` 回收拿得到锁的会话归属检出位，以及没建完的（`building`）。删之前先用空实体集连一次快照库：标记迁移在不是快照库的已有库上当场失败，工厂配错、指到主库存储时报错而不是把主库删掉。启动清理：既有库连接时，插件在本来就有的引导事务里读一次登记表，确有孤儿（会话归属或没建完、且锁没人持有）才在连上之后跑一次 `prune()`。不无条件回收，是因为另一个连接的 `connect()` 要先拿系统迁移的排他锁、拿不到就失败，连上之后多开一笔事务会让恰好同时连接的标签页连不上。
- `attach()` 校验实体结构指纹：应用的实体结构变了报 `schema_mismatch`，要重新打开一个。

### 支持的后端

首批六个后端：PGlite、sqlite-wasm、wa-sqlite、sqlite（官方）、sqliteai、Electron。快照原语（读页、导入、接手密钥环、封印）与删库（`dropStorage()`）由适配器提供。按当前配置删不掉自己存储的后端由 `canDropStorage()` 答 `false`，`open()` 在建快照之前就以 `unsupported_adapter` 拒绝：sqlite-wasm 的 `fs-handle`、wa-sqlite 的 `AccessHandlePoolVFS`、PGlite 内存与 `idb://` 之外的数据目录、Electron PGlite。Tauri 等没有快照原语的适配器同样报 `unsupported_adapter`。

## 可写检出位

像 GitHub Desktop 3.6 的 worktree 那样，在另一条分支上读写、提交，主检出位的分支、工作树与业务表一处不动（US-314）。可写检出位是**同一个库里的一套影子表**：`checkouts.add()` 开出来，`mount()` 让主实例挂上它，此后的读写、捕获、提交都落在它持有的分支上。

```typescript
const { checkouts } = db.workingTree;

const worktree = await checkouts.add('feature/x', { name: 'feature-x' }); // 登记、持有分支、建表、播种；建好不挂
await checkouts.mount(worktree.id); // 主实例换挂：实体缓存清空、活查询重跑、撤销栈换到那条分支

const todo = new Todo();
todo.title = '在检出位里写';
await todo.save();
await db.workingTree.commit('在检出位里提交', await credentials()); // 提交进 feature/x 的历史

await checkouts.mountMain(); // 挂回主检出位
await checkouts.remove(worktree.id); // 删那套表、放开分支、删登记；未提交的改动留在分支上
```

| 方法                               | 说明                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add(branchId, { name?, owner? })` | 一笔事务里登记、持有分支、建表、播种（主表集的行原样复制，再叠上「主检出位所在分支 → 这条分支」的增量）；建好不挂，本上下文认领它。没给名字取分支 id，被占了加 `-2`、`-3` |
| `mount(id)`                        | 让主实例挂上它；没认领的先认领                                                                                                                                            |
| `mountMain()`                      | 挂回主检出位；认领照旧                                                                                                                                                    |
| `release(id)`                      | 交出认领：挂在它上面就先挂回主检出位，表、持有与登记都留着                                                                                                                |
| `remove(id)`                       | 挂在它上面就先挂回主检出位，再一笔事务删表、放开分支、删登记                                                                                                              |
| `rename(id, name)`                 | 改名（去首尾空白）；空名字报 `invalid_name`，与另一个可写检出位重名报 `name_taken`，主检出位与只读检出位改不了名（`not_found`）                                           |
| `list()` / `prune()`               | 只读与可写两类都列、都收，登记行的 `mode` 区分                                                                                                                            |

### 一条分支只能被一个检出位持有

主检出位正停在上面的分支、已被另一个可写检出位持有的分支，`add()` 都抛 `WorktreeBranchHeldError`（git：`already used by worktree`）；主检出位 `switchBranch()` 切到被持有的分支同样被拒。被持有的分支也删不掉：`removeBranch()` 抛 `WorktreeBranchHeldError`（git：`Cannot delete branch … checked out at …`），合并时带 `deleteSource` 遇到被持有的源分支，合并照常完成、源分支留着，`sourceDeleteError` 是这个错误。删掉那个检出位就都放开了。只读检出位不占分支。

### 挂在可写检出位上时

- 当前分支是它持有的分支：`status()`、`commit()`、撤销 / 重做、建分支的父分支都跟着它。
- **不同步**：只有主检出位同步，推拉同步的入口一进门就抛，QueryCache 的自动回推等挂回主检出位再跑，可推送计数是 0。检出位上的提交等那条分支回到主检出位、或合并进主线之后再进同步。
- **合并**：`mergeBranch()` 合进的是它持有的分支，落在这套影子表里、进它的工作树，主检出位一处不动。只有进这套表的实体（记变更日志的版本化实体）会合进来，QueryCache 同步的这类只在主检出位那套表里的实体不合：照合会改主检出位的表。`previewMerge()` 同一口径。
- **QueryCache** 只有主检出位那一份：挂在检出位上读写的也是它，回填照旧不进变更日志、出站队列照旧按主检出位的分支算。
- **图**：边表与节点一样进这套影子表，邻居与路径查询只看这套表。节点与边只有一个进影子表时（例如节点走 QueryCache 同步、边没有），图查询直接拒绝。边实体随节点继承 `log: false`。
- **切分支**：`switchBranch()` 在检出位里切：放开原来持有的分支、持有目标分支，这套表按增量改过去，改动留在原分支（GitHub Desktop 的「Leave my changes」），登记行的 `branchId` 跟着走。目标被主检出位或另一个检出位持有时抛 `WorktreeBranchHeldError`，本地只有元数据的远端分支报 `branch_not_materialized`（先在主检出位上切过去一次）。每套表有自己的激活版本号：检出位里切分支只推进它自己的，主检出位手上的提交凭据照样有效。
- **多个标签页**：每个标签页挂自己的那一套，可以一个挂主检出位、一个挂可写检出位。实体事件带上写在哪套表上（`tableSetSuffix`，主表集不带），跨标签页转发之后，活查询与全文检索只合进挂着同一套表的那几个标签页；同一行在两套表里各有一份时，一边改它不会改到另一边的活查询与实体缓存。
- **草稿缓存**（`@aiao/rxdb-plugin-workspace`）按检出位分区：挂在检出位上新建的草稿只在这个检出位上看得到，换挂时先落盘再换成新挂那一套的草稿（见草稿缓存插件的文档）。换挂之前拿到的实体对象（含没存的草稿）在另一套表上保存抛 `WorktreeTableSetMismatchError`：照存的话主检出位上新建的实体会落进检出位的影子表。

### 生命周期与回收

- 缺省**持久归属**（与 git、GitHub Desktop 一致）：重启之后还在，分支一直被占到 `remove()`；任何一处都能 `mount(id)` 再认领。`owner: 'session'` 的在认领它的标签页结束之后由 `prune()` 回收。
- 认领用检出位的 Web Lock：`add()` / `mount()` 拿下，`release()` / `remove()` 还掉；别处认领着时 `mount()` / `remove()` 报 `in_use`。
- `prune()` 与启动清理还回收**持有的分支已经不在了**的可写检出位。可写检出位的表在主库里，不配快照库也收得了。
- 关掉检出位时未提交的改动不会丢：检出位里的写都记进了那条分支的变更日志，切过去照样读得到（git 删 worktree 会丢，这里不会）。

### 已知限制

- 全文检索只建在主检出位那一套表上。
- 实体用整数自增主键时，两套表各自递增，跨套可能分出相同的 id（播种时已对齐序列）。
- 远端分支要先在主检出位上切过去一次、把数据物化到本地，才能开检出位或在检出位里切过去。
- 检出位是本地概念，不保证降级：B1.2 之前的版本在带持有键的库上切分支会把持有键抹掉。

PGlite 与 SQLite 系（wa-sqlite、sqlite-wasm、sqlite、sqliteai、Electron）都支持，一致性套件同一份。适配器没有建删表集的槽位（`createWorktreeTableSet` / `dropWorktreeTableSet`）时 `add()` 报 `unsupported_adapter`。

## 未认领能力守卫

`enable()` 过的库会在 `rxdb_migration` 里留下一行能力水位（`__rxdb_capability__:workingTree:1:@aiao/rxdb-plugin-working-tree`）。**没装本包的客户端再打开这个库时，核心拒绝连接**并把该装的包名原样报出来：

```
这个数据库启用了当前进程未认领的 RxDB 能力，缺少对应插件时写入不受该能力管辖，因此拒绝连接：
  - workingTree v1 —— 安装 @aiao/rxdb-plugin-working-tree
```

这道守卫是本包从核心抽出来之后的核心收益：它接替了原先靠抬升 `RXDB_SYSTEM_SCHEMA_VERSION` 来锁旧客户端的做法，且**对第三方插件同样有效**——包名是插件自己写进水位行的，核心不需要认识它。

## 系统表

十二张，顺序即建表顺序：

`CommitCapabilityState`、`WorkingTreeActivationState`、`Commit`、`CommitChangeSet`、`CommitBranchRef`、
`WorkingTreeState`、`WorkingTreeEntry`、`WorkingTreeRestoreSession`、`WorkingTreeMaterializationStage`、
`WorkingTreeMaterializationPage`、`Worktree`（只读检出位登记表，`rxdb_worktree`）、`CommitForkPoint`
（提交的分叉点，`rxdb_commit_fork_point`）。都不记变更日志。

它们经 `registerSystemEntities()` 进入核心的系统表身份集，因此 `isSystemEntity()` 认得它们——`@aiao/rxdb-adapter-http` 等跨包消费者不会把它们当接入方数据推上远端。

## 框架绑定

三端 `useWorkingTree()` **同名、同字段、同方法签名**，只有状态容器形态不同（`Signal` / 渲染快照 / `ComputedRef`）。任一端加减成员，三端 spec 都会红。

### Angular

```typescript
import { Component } from '@angular/core';
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-angular';

@Component({
  selector: 'app-commit-bar',
  template: `
    @switch (tree.statusState().phase) {
      @case ('loading') {
        <span>读取中…</span>
      }
      @case ('empty') {
        <span>没有未提交的改动</span>
      }
      @case ('success') {
        <span>{{ tree.statusState().value.entryCount }} 条未提交</span>
      }
    }
    <button [disabled]="tree.commitState().phase === 'loading'" (click)="save()">提交</button>
  `
})
export class CommitBar {
  readonly tree = useWorkingTree();

  async save(): Promise<void> {
    const status = await this.tree.status();
    const result = await this.tree.commit('保存', {
      expectedBranch: {
        branchId: status.branchId,
        activationRevision: status.activationRevision
      },
      expectedHeadRevision: status.headRevision,
      expectedWorkingTreeRevision: status.workingTreeRevision,
      authorId: 'alice',
      operationId: crypto.randomUUID()
    });
    if (!result.ok) console.warn('别人先提交了，重试即可', result.conflict);
  }
}
```

`useWorkingTree()` **必须在 Angular 注入上下文中调用**——它经 `useRxDB()` 取库，因此上游要有 `provideRxDB()`。十格状态各自装进 `Signal`：模板只读了 `statusState` 时，一次 `diff()` 的相位变化不会让它重新求值。

### React

```tsx
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-react';

export function CommitBar() {
  const tree = useWorkingTree();

  const save = async () => {
    const status = await tree.status();
    const result = await tree.commit('保存', {
      expectedBranch: {
        branchId: status.branchId,
        activationRevision: status.activationRevision
      },
      expectedHeadRevision: status.headRevision,
      expectedWorkingTreeRevision: status.workingTreeRevision,
      authorId: 'alice',
      operationId: crypto.randomUUID()
    });
    if (!result.ok) console.warn('别人先提交了，重试即可', result.conflict);
  };

  return (
    <div>
      {tree.statusState.phase === 'empty' && <span>没有未提交的改动</span>}
      {tree.statusState.phase === 'success' && <span>{tree.statusState.value.entryCount} 条未提交</span>}
      <button disabled={tree.commitState.phase === 'loading'} onClick={() => void save()}>
        提交
      </button>
    </div>
  );
}
```

`useWorkingTree()` 经 `useRxDB()` 取库，因此组件树里必须有 `RxDBProvider`。十个状态字段是**普通只读值**（`Readonly<WorkingTreeAsyncStates>`），可以直接解构；十个方法**引用稳定**，可以安全放进 `useEffect` / `useMemo` 的依赖数组。

### Vue

```vue
<script lang="ts" setup>
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-vue';

const tree = useWorkingTree();

const save = async (): Promise<void> => {
  const status = await tree.status();
  const result = await tree.commit('保存', {
    expectedBranch: {
      branchId: status.branchId,
      activationRevision: status.activationRevision
    },
    expectedHeadRevision: status.headRevision,
    expectedWorkingTreeRevision: status.workingTreeRevision,
    authorId: 'alice',
    operationId: crypto.randomUUID()
  });
  if (!result.ok) console.warn('别人先提交了，重试即可', result.conflict);
};
</script>

<template>
  <span v-if="tree.statusState.value.phase === 'empty'">没有未提交的改动</span>
  <span v-else-if="tree.statusState.value.phase === 'success'">
    {{ tree.statusState.value.value.entryCount }} 条未提交
  </span>
  <button :disabled="tree.commitState.value.phase === 'loading'" @click="save">提交</button>
</template>
```

`useWorkingTree()` 经 `useRxDB()` 取库，因此上游要有 `provideRxDB()`。十格状态各自装进 `ComputedRef`：模板只读了 `statusState` 时，一次 `diff()` 的相位变化不会让它重新求值。

### 十四格异步状态

三端共享同一份状态契约（`WorkingTreeAsyncStates`，定义在插件包而不是三个框架包里）：

| 字段                          | 类型                                               | 说明                                                                               |
| ----------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `isEnabledState`              | 命令态 `<boolean>`                                 | `isEnabled()` 的状态                                                               |
| `enableState`                 | 命令态 `<CommitCapabilityInfo>`                    | `enable()` 的状态                                                                  |
| `enableIfEmptyState`          | 命令态 `<WorkingTreeEnableIfEmptyResult>`          | `enableIfEmpty()` 的状态；**没有 empty** —— `not_empty` 是结果                     |
| `statusState`                 | 查询态 `<WorkingTreeStatus>`                       | `status()` 的状态；**空即没有未提交变更**                                          |
| `diffState`                   | 查询态 `<WorkingTreeDiff>`                         | `diff()` 的状态；**空即没有可展示的改动**                                          |
| `listCommitsState`            | 查询态 `<CommitLogPage>`                           | `listCommits()` 的状态；**空即还没有历史**                                         |
| `commitChangesState`          | 查询态 `<CommitChangeSetPage>`                     | `commitChanges()` 的状态；**空即这个提交没有变更单元**（基线节点）                 |
| `commitState`                 | 命令态 `<CommitResult>`                            | `commit()` 的状态；**没有 empty**                                                  |
| `discardState`                | 命令态 `<WorkingTreeDiscardResult>`                | `discard()` 的状态；**没有 empty**                                                 |
| `restoreState`                | 命令态 `<WorkingTreeRestoreResult>`                | `restore()` 的状态；**没有 empty** —— 四个被拒成因与 `restoredCount: 0` 都是结果   |
| `restoreSessionState`         | 查询态 `<WorkingTreeRestoreSessionInfo \| null>`   | `restoreSession()` 的状态；**空即当前分支没有未结束的恢复会话**，且带着那个 `null` |
| `switchBranchState`           | 命令态 `<void>`                                    | `switchBranch()` 的状态；**没有 empty** —— 切到当前分支是成功的 no-op              |
| `checkBranchFromCommitState`  | 命令态 `<WorkingTreeBranchFromCommitCheck>`        | `checkBranchFromCommit()` 的状态；**没有 empty** —— 能建与三种被拒成因都是结果     |
| `createBranchFromCommitState` | 命令态 `<WorkingTreeCreateBranchFromCommitResult>` | `createBranchFromCommit()` 的状态；**没有 empty** —— 建好了与三种被拒成因都是结果  |

查询态五相：`idle → loading → success / empty / error`；命令态四相（无 `empty`）。两条判别细节：

- **`switchBranch()` 的被拒反过来走 `error`**：`requireClean` 撞上脏工作树、激活代际过期，都是异常而不是返回值——那一刻分支根本没切，没有结果可交给调用方。
- **`commit()` 的 CAS 冲突走 `success`**（`CommitResult.ok === false` 的冲突也是成功出口），**不是 `error`**——冲突是并发编辑的正常出口，不是错误。
- **`empty` 是 `success` 的细化，`value` 照样在**：一次空的 `status()` 里三个 revision 仍可读，不用为了拿它们再查一次。

错误态保留 `error`（`Error` 实例原样透传，`instanceof` 与 `code` 都在），重试就是再调一次对应方法。

### 行为约定（三端一致）

- **创建入口本身一次 IO 都不发**：十四格状态初值全是 `idle`，只有真调了方法才去读库。
- **没有变更流**：状态只在经本入口发出的命令之后更新。别的标签页写进来的改动、直接走 `entity.save()` 的写入，都不会推一份新的 status 过来——要最新值就再调一次 `status()`。
- 拿不到数据库时**抛错**，而不是返回一份「一切干净」的默认值。
- `commit()` / `discard()` / `restore()` / `checkBranchFromCommit()` / `createBranchFromCommit()` 的被拒走返回值（`result.ok === false`），不是异常；`switchBranch()` 的被拒**走异常**。
- `createBranchFromCommit()` 不切换，也不重读 `status()`：当前分支的工作树一格都没动，切过去那一步的 `switchBranch()` 会重读。
- `enable()` / `discard()` / `restore()` / `switchBranch()` 成功之后自动重读一次 `status()`——`switchBranch()` 重读回来的那份摘要属于**另一条**分支。
- `switchBranch()` 挂在历史插件（`@aiao/rxdb-plugin-history`）的 `versionManager` 上而不是 `workingTree` 上，因此三端入口取的是整个 `RxDB`，不是只取 `db.workingTree`。
- 类型与错误类一律从 `@aiao/rxdb-plugin-working-tree` 直接 import，绑定包**不重定义、也不再导出**。

### 只读检出位：`useWorktrees()`

三端 `useWorktrees()` 同名同 API：四格状态 `listState` / `openState` / `attachState` / `pruneState`，命令 `list()` / `open()` / `attach()` / `prune()` 与 `db.workingTree.checkouts` 上的同名方法签名一致。打开、再打开、回收之后，以及视图的 `close()` / `release()` / `refresh()` 之后，都会顺带重读登记表；同一格后发的请求胜出。

打开得到的视图把 `view.rxdb` 交给各端现成的 Provider，里面的查询 hook 与 rxdb-model 的实体列表照用（只读实例上列表不出写控件）：

- React：`<RxDBProvider db={view.rxdb}>…</RxDBProvider>`
- Vue：在子组件里 `provideRxDB(view.rxdb)`；视图放 `shallowRef`，RxDB 实例的私有字段过不了深层响应式代理
- Angular：子组件注入器里 `{ provide: RxDB, useValue: view.rxdb }`，比如经 `NgComponentOutlet` 的 `injector`

`useWorktrees()` 本身要在嵌套的 Provider **之外**调用：快照实例没装工作树插件。

## 错误类型

| 错误                                 | 出现时机                                                                                                                 | 出路                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `WorkingTreeCapabilityDisabledError` | 库还没启用提交能力就调用受管成员（`code: 'commit_capability_disabled'`）                                                 | 先 `db.workingTree.enable()`                          |
| `UnsupportedRxDBSystemVersionError`  | 库启用了能力，但能力版本三元组与本进程不符                                                                               | 升客户端或跑迁移                                      |
| `CommitValidationError`              | 提交消息为空、或工作树是干净的（`empty_commit`）                                                                         | 检查入参与 `status()`                                 |
| `CommitGraphCorruptedError`          | 当前分支的提交图已损坏（FR-051）                                                                                         | 诊断数据现场                                          |
| `WorkingTreeEntryCountMismatchError` | 冗余列与实际条目行数对不上——库里两份真相对不上                                                                           | 诊断数据现场                                          |
| `WorkingTreeDirtyError`              | `switchBranch(..., { requireClean: true })` 撞上非空工作树（`code: 'working_tree_dirty'`，带 `branchId` / `entryCount`） | 先 `commit()` 或 `discard()`，或不传 `requireClean`   |
| `StaleActiveBranchError`             | `expectedActivationRevision` 与库里的激活代际对不上（`code: 'stale_active_branch'`，带 `expected` / `actual` 两个令牌）  | 重读 `status()` 再切                                  |
| `WorktreeUnavailableError`           | 检出位打不开（`reason`：没配快照库、后端不支持、分支不存在、提交不可达、有进行中的恢复、`in_use` 等十三种）              | 按 `reason` 处理；提交视图的拒绝与 `restore()` 同口径 |
| `WorktreeBranchHeldError`（核心）    | 开可写检出位或主检出位切分支时，分支已被另一个检出位持有（`code: 'worktree_branch_held'`，带 `branchId` / `holderKey`）  | 换一条分支，或先删掉持有它的检出位                    |
| `RxDBReadOnlyError`（核心）          | 在只读检出位的实例上写                                                                                                   | 回主实例写                                            |

## 一致性套件

`@aiao/rxdb-plugin-working-tree/testing` 导出跨后端一致性套件（capture + commit + worktree），六个适配器包（electron / sqlite / sqlite-wasm / pglite / sqliteai / wa-sqlite）各引三条。新增适配器时接上这三条，才能拿到「捕获不漏、提交不错、只读检出位与切过去读到的一致」的跨后端保证。

只读检出位套件的上下文比另外两套多一个可选的 `createDatabaseWithPersistentSnapshots`：只有「持久归属的检出位放开之后原样再打开」那条用例要求快照库落在持久存储上。快照库开在持久存储上很贵的后端（比如 OPFS 只能在专用 Worker 里开、一个快照库一个 Worker），`createDatabase` 给内存档快照、这一项给持久档；不给就用 `createDatabase`，那时它的快照库要落在持久存储上。

## 相关文档

- [数据协作](../../collaboration/README.md)——分支、同步、撤销重做的工作流视角
- [版本与 API 稳定性策略](../../versioning.md)
- API 参考：`api/rxdb-plugin-working-tree`（本包）、`api/rxdb-plugin-working-tree-angular` / `-react` / `-vue`（绑定包）
