# @aiao/rxdb-plugin-working-tree

RxDB 本地工作树与提交历史插件：把「未提交的改动」与「提交历史」作为一等概念加进 `@aiao/rxdb`。

未装本包的库**零成本**——十张系统表、写捕获、提交图编解码全部随包走，核心侧只留下装卸口与两道转交门。

## 能力范围

- 写捕获：用户编辑落进工作树而不是直接改主数据，库自己的簿记写入不被捕获
- `status()` / `diff()`：读当前分支的未提交摘要与逐条改动
- `commit()`：把工作树里的**全部**未提交单元提交成一次快照；CAS 落败走返回值而非异常
- `discard()`：把工作树整体退回 HEAD
- `listCommits()`：读当前分支的可达提交历史
- `restore()` / `restoreSession()`：把一个可达历史提交的内容作为**新的未提交变更**写回工作树；不移动 HEAD、不删历史，四个被拒成因走返回值
- `switchBranch()` 的两道可选前置（`requireClean` / `expectedActivationRevision`）；挂在 `db.versionManager` 上，被拒**走异常**

## 用之前要知道的六件事

完整版见文档站的[插件页](https://docs.aiao.io/docs/plugins/rxdb-plugin-working-tree)，这里是压缩版：

1. **提交能力是数据库级的显式开关**——`enable()` 一次，整个库的所有实体、所有分支都按工作树语义运行。启用会留下一行能力水位，**没装本包的客户端从此拒绝连接这个库**；v1 没有 `disable()`。
2. **工作树 ≠ 草稿缓存。** 工作树装的是「已经写进数据库、还没提交成快照」的变更，参与事务、被查询读到；草稿缓存（`@aiao/rxdb-plugin-workspace`）装的是「还没保存」的编辑器 buffer，根本没进主库。两层不能合并，本包因此也不占用 `Workspace*` 前缀。
3. **`restore()` 不是 checkout。** 它把历史内容作为新的未提交变更写回工作树：HEAD 不动、历史不删、工作树变脏，下一步是 `commit()` 或 `discard()`。v1 没有 detached HEAD、没有 `checkout()`。
4. **历史会原样保留敏感旧值。** 写进过某次提交的字段永久留在那次提交的 `ChangeSet` 里，之后改掉、清空、删行都不会动到它；v1 没有任何公开 API 能把它从历史里抠掉。**不要把不该留痕的东西写进启用了提交能力的库。**
5. **加密边界**：加密字段在提交、工作树与恢复会话里仍以 versioned envelope 落盘，持久化路径不先解密再写明文，错误与摘要也不带明文。但加密保护的是**落盘的字节**——它不消解第 4 条，第 4 条也不能替代它。
6. **不改写历史**：没有 amend / rebase / squash，没有「修改提交信息」，也没有 auto-baseline。提交图损坏时守卫只置 `corrupted_read_only` 并留诊断，**不动 HEAD、不删记录**。

另外一条常被漏掉的：**远端同步拉下来的变更和用户的编辑一样进工作树**，在 `status().byOrigin` 里计为 `origin = 'remote_sync'`、**不豁免**，会让 `clean` 变成 `false`，并被下一次 `commit()` 一并提交（提交者是这次 `commit()` 的 `authorId`，v1 不伪造远端作者）。「同步之后工作树突然脏了」是正常行为。

## 能力边界：绕过 adapter 的写入拦不住

写捕获只覆盖**经 adapter 的写路径与 adapter 公开的批量写方法**。直接打开同一个 SQLite 文件、另起一个 PGlite 实例、DevTools 里手写 SQL——这些**拦不住，v1 也不承诺拦得住**，而且它们不进工作树、不进历史、`status()` 看不见。

因此启用了提交能力的数据库有一条硬约束：**业务表只能经 RxDB 写入**。写在这里不是免责声明的注脚——不假装拦得住比拦不住更重要：一道号称拦得住却拦不住的门禁，会让人把「没报错」当成「没被绕过」。

## 使用方式

```ts
import { RxDB } from '@aiao/rxdb';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

const db = new RxDB(config);
db.use(rxDBPluginWorkingTree); // ← 必须在 connect() 之前
await db.connect('sqlite-wasm');

await db.workingTree.enable(); // 既有库上是一次迁移，新库上是一次幂等确认

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
if (!result.ok) {
  // 别人先提交了：conflict 里带着新的 revision，重读 status 后重试即可
  console.warn(result.conflict);
}
```

**`use()` 必须排在 `connect()` 之前。** 本插件声明 `system`（`RxDBSystemContribution`），
宿主要在建表之前读走它的实体、初始行与迁移；`connect()` 之后再 `use()` 已经赶不上建表，
核心会当场抛错而不是静默跳过。

`db.workingTree` 是**非可选**成员，由 `declare module '@aiao/rxdb'` 增广而来：装了本包才存在这个入口，
没装时 `db.workingTree` 是编译错误，而不是运行期的 `undefined`。能力未启用时它照样在，
但每个方法以 `commit_capability_disabled` 拒绝。

## 未认领能力守卫

`enable()` 过的库会在 `rxdb_migration` 里留下一行能力水位（`__rxdb_capability__:workingTree:1:@aiao/rxdb-plugin-working-tree`）。
**没装本包的客户端再打开这个库时，核心拒绝连接**并把该装的包名原样报出来：

```
这个数据库启用了当前进程未认领的 RxDB 能力，缺少对应插件时写入不受该能力管辖，因此拒绝连接：
  - workingTree v1 —— 安装 @aiao/rxdb-plugin-working-tree
```

这道守卫是本包从核心抽出来之后的核心收益：它接替了原先靠抬升 `RXDB_SYSTEM_SCHEMA_VERSION`
来锁旧客户端的做法，且**对第三方插件同样有效**——包名是插件自己写进水位行的，核心不需要认识它。

## 系统表

十张，顺序即建表顺序：

`CommitCapabilityState`、`WorkingTreeActivationState`、`Commit`、`CommitChangeSet`、`CommitBranchRef`、
`WorkingTreeState`、`WorkingTreeEntry`、`WorkingTreeRestoreSession`、`WorkingTreeMaterializationStage`、
`WorkingTreeMaterializationPage`。

它们经 `registerSystemEntities()` 进入核心的系统表身份集，因此 `isSystemEntity()` 认得它们——
`@aiao/rxdb-adapter-http` 等跨包消费者不会把它们当接入方数据推上远端。

## 框架绑定

- Angular —— [`@aiao/rxdb-plugin-working-tree-angular`](../rxdb-plugin-working-tree-angular)
- React —— [`@aiao/rxdb-plugin-working-tree-react`](../rxdb-plugin-working-tree-react)
- Vue —— [`@aiao/rxdb-plugin-working-tree-vue`](../rxdb-plugin-working-tree-vue)

三端 `useWorkingTree()` 同名同语义，只是状态容器形态不同（`Signal` / 渲染快照 / `ComputedRef`）。

## 一致性套件

`@aiao/rxdb-plugin-working-tree/testing` 导出跨后端一致性套件（capture + commit），
六个适配器包（electron / sqlite / sqlite-wasm / pglite / sqliteai / wa-sqlite）各引两条。

## 开发命令

```bash
pnpm nx run rxdb-plugin-working-tree:typecheck
pnpm nx run rxdb-plugin-working-tree:lint --max-warnings=0
pnpm nx test rxdb-plugin-working-tree
pnpm nx run rxdb-plugin-working-tree:build
```

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
