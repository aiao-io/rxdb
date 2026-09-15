# @aiao/rxdb-plugin-working-tree

RxDB 本地工作树与提交历史插件：把「未提交的改动」与「提交历史」作为一等概念加进 `@aiao/rxdb`。

未装本包的库**零成本**——十张系统表、写捕获、提交图编解码全部随包走，核心侧只留下装卸口与两道转交门。

## 能力范围

- 写捕获：用户编辑落进工作树而不是直接改主数据，库自己的簿记写入不被捕获
- `status()` / `diff()`：读当前分支的未提交摘要与逐条改动
- `commit()`：把工作树里的**全部**未提交单元提交成一次快照；CAS 落败走返回值而非异常
- `discard()`：把工作树整体退回 HEAD
- `listCommits()`：读当前分支的可达提交历史

尚未实现（US3 / US4，`specs/001-working-tree-commits/tasks.md` T095–T133）：

- `restore()` / `restoreSession()` 恢复到任意历史提交
- 带工作树语义的 `switchBranch`

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
  expectedBranchId: status.branchId,
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
