# @aiao/rxdb-plugin-working-tree

`@aiao/rxdb-plugin-working-tree` 为 `@aiao/rxdb` 提供**本地工作树与提交历史**：把「未提交的改动」与「提交历史」作为一等概念加进数据库——用户的编辑先落进工作树而不是直接改主数据，`status()` / `diff()` 查看摘要与逐条改动，`commit()` 一次性提交成快照，`discard()` 整体退回，`listCommits()` 读取当前分支的提交历史。

未装本包的库**零成本**——十张系统表、写捕获、提交图编解码全部随包走，核心侧只留下装卸口与两道转交门。

## 能力范围

| 能力            | 说明                                                                               |
| --------------- | ---------------------------------------------------------------------------------- |
| 写捕获          | 用户编辑落进工作树而不是直接改主数据；库自己的簿记写入（`rxdb_change` 等）不被捕获 |
| `status()`      | 当前分支的未提交摘要：条目数、三个捕获位（revision）、来源分布                     |
| `diff()`        | 逐条未提交改动；`entity` / `transaction` 两种粒度，支持分页游标                    |
| `commit()`      | 把工作树里的**全部**未提交单元提交成一次快照；CAS 落败走返回值而非异常             |
| `discard()`     | 把工作树整体退回 HEAD                                                              |
| `listCommits()` | 当前分支从 HEAD 沿父链可达的提交历史                                               |

尚未实现（US3 / US4，`specs/001-working-tree-commits/tasks.md` T095–T133）：

- `restore()` / `restoreSession()` 恢复到任意历史提交
- 带工作树语义的 `switchBranch`

## 安装

```bash npm2yarn
npm install @aiao/rxdb-plugin-working-tree
# 框架绑定（按需选其一）
npm install @aiao/rxdb-plugin-working-tree-angular
npm install @aiao/rxdb-plugin-working-tree-react
npm install @aiao/rxdb-plugin-working-tree-vue
```

peer dependencies：`@aiao/rxdb`、`rxjs`；框架绑定另需对应的 `@aiao/rxdb-angular` / `@aiao/rxdb-react` / `@aiao/rxdb-vue`。

## 注册插件

```typescript
import { RxDB } from '@aiao/rxdb';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

const db = new RxDB(config);
db.use(rxDBPluginWorkingTree); // ← 必须在 connect() 之前
await db.connect('sqlite-wasm');

await db.workingTree.enable(); // 既有库上是一次迁移，新库上是一次幂等确认
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

## 未认领能力守卫

`enable()` 过的库会在 `rxdb_migration` 里留下一行能力水位（`__rxdb_capability__:workingTree:1:@aiao/rxdb-plugin-working-tree`）。**没装本包的客户端再打开这个库时，核心拒绝连接**并把该装的包名原样报出来：

```
这个数据库启用了当前进程未认领的 RxDB 能力，缺少对应插件时写入不受该能力管辖，因此拒绝连接：
  - workingTree v1 —— 安装 @aiao/rxdb-plugin-working-tree
```

这道守卫是本包从核心抽出来之后的核心收益：它接替了原先靠抬升 `RXDB_SYSTEM_SCHEMA_VERSION` 来锁旧客户端的做法，且**对第三方插件同样有效**——包名是插件自己写进水位行的，核心不需要认识它。

## 系统表

十张，顺序即建表顺序：

`CommitCapabilityState`、`WorkingTreeActivationState`、`Commit`、`CommitChangeSet`、`CommitBranchRef`、
`WorkingTreeState`、`WorkingTreeEntry`、`WorkingTreeRestoreSession`、`WorkingTreeMaterializationStage`、
`WorkingTreeMaterializationPage`。

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

`useWorkingTree()` **必须在 Angular 注入上下文中调用**——它经 `useRxDB()` 取库，因此上游要有 `provideRxDB()`。七格状态各自装进 `Signal`：模板只读了 `statusState` 时，一次 `diff()` 的相位变化不会让它重新求值。

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

`useWorkingTree()` 经 `useRxDB()` 取库，因此组件树里必须有 `RxDBProvider`。七个状态字段是**普通只读值**（`Readonly<WorkingTreeAsyncStates>`），可以直接解构；七个方法**引用稳定**，可以安全放进 `useEffect` / `useMemo` 的依赖数组。

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

`useWorkingTree()` 经 `useRxDB()` 取库，因此上游要有 `provideRxDB()`。七格状态各自装进 `ComputedRef`：模板只读了 `statusState` 时，一次 `diff()` 的相位变化不会让它重新求值。

### 七格异步状态

三端共享同一份状态契约（`WorkingTreeAsyncStates`，定义在插件包而不是三个框架包里）：

| 字段               | 类型                                | 说明                                       |
| ------------------ | ----------------------------------- | ------------------------------------------ |
| `isEnabledState`   | 命令态 `<boolean>`                  | `isEnabled()` 的状态                       |
| `enableState`      | 命令态 `<CommitCapabilityInfo>`     | `enable()` 的状态                          |
| `statusState`      | 查询态 `<WorkingTreeStatus>`        | `status()` 的状态；**空即没有未提交变更**  |
| `diffState`        | 查询态 `<WorkingTreeDiff>`          | `diff()` 的状态；**空即没有可展示的改动**  |
| `listCommitsState` | 查询态 `<CommitLogPage>`            | `listCommits()` 的状态；**空即还没有历史** |
| `commitState`      | 命令态 `<CommitResult>`             | `commit()` 的状态；**没有 empty**          |
| `discardState`     | 命令态 `<WorkingTreeDiscardResult>` | `discard()` 的状态；**没有 empty**         |

查询态五相：`idle → loading → success / empty / error`；命令态四相（无 `empty`）。两条判别细节：

- **`commit()` 的 CAS 冲突走 `success`**（`CommitResult.ok === false` 的冲突也是成功出口），**不是 `error`**——冲突是并发编辑的正常出口，不是错误。
- **`empty` 是 `success` 的细化，`value` 照样在**：一次空的 `status()` 里三个 revision 仍可读，不用为了拿它们再查一次。

错误态保留 `error`（`Error` 实例原样透传，`instanceof` 与 `code` 都在），重试就是再调一次对应方法。

### 行为约定（三端一致）

- **创建入口本身一次 IO 都不发**：七格状态初值全是 `idle`，只有真调了方法才去读库。
- **没有变更流**：状态只在经本入口发出的命令之后更新。别的标签页写进来的改动、直接走 `entity.save()` 的写入，都不会推一份新的 status 过来——要最新值就再调一次 `status()`。
- 拿不到数据库时**抛错**，而不是返回一份「一切干净」的默认值。
- `commit()` / `discard()` 的 CAS 落败走返回值（`result.ok === false` 且带 `conflict`），不是异常。
- 类型与错误类一律从 `@aiao/rxdb-plugin-working-tree` 直接 import，绑定包**不重定义、也不再导出**。

## 错误类型

| 错误                                 | 出现时机                                                                 | 出路                         |
| ------------------------------------ | ------------------------------------------------------------------------ | ---------------------------- |
| `WorkingTreeCapabilityDisabledError` | 库还没启用提交能力就调用受管成员（`code: 'commit_capability_disabled'`） | 先 `db.workingTree.enable()` |
| `UnsupportedRxDBSystemVersionError`  | 库启用了能力，但能力版本三元组与本进程不符                               | 升客户端或跑迁移             |
| `CommitValidationError`              | 提交消息为空、或工作树是干净的（`empty_commit`）                         | 检查入参与 `status()`        |
| `CommitGraphCorruptedError`          | 当前分支的提交图已损坏（FR-051）                                         | 诊断数据现场                 |
| `WorkingTreeEntryCountMismatchError` | 冗余列与实际条目行数对不上——库里两份真相对不上                           | 诊断数据现场                 |

## 一致性套件

`@aiao/rxdb-plugin-working-tree/testing` 导出跨后端一致性套件（capture + commit），六个适配器包（electron / sqlite / sqlite-wasm / pglite / sqliteai / wa-sqlite）各引两条。新增适配器时接上这两条，才能拿到「捕获不漏、提交不错」的跨后端保证。

## 相关文档

- [数据协作](../../collaboration/README.md)——分支、同步、撤销重做的工作流视角
- [版本与 API 稳定性策略](../../versioning.md)
- API 参考：`api/rxdb-plugin-working-tree`（本包）、`api/rxdb-plugin-working-tree-angular` / `-react` / `-vue`（绑定包）
