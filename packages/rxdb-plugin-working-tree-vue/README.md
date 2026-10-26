# @aiao/rxdb-plugin-working-tree-vue

[`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree) 的 Vue 集成层。提供 `useWorkingTree()` composable，把工作树插件的 `WorkingTreeManager` 适配为 Vue `ComputedRef` 消费接口。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-working-tree @aiao/rxdb-vue @aiao/rxdb-plugin-working-tree-vue vue rxjs
```

## 用法

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

装插件仍在库侧完成（`db.use(rxDBPluginWorkingTree)` **必须排在 `connect()` 之前**），本包只负责读写。

`useWorkingTree()` 经 `useRxDB()` 取库，因此上游要有 `provideRxDB()`。十格状态各自装进
`ComputedRef`：模板只读了 `statusState` 时，一次 `diff()` 的相位变化不会让它重新求值。

## 检出位：`useWorktrees()`

`useWorktrees()` 是工作树插件 `db.workingTree.checkouts` 的入口：只读检出位（US-313）的 `list()` / `open()` / `attach()` / `prune()`，
可写检出位（US-314）的 `add()` / `mount()` / `mountMain()` / `release()` / `remove()` / `rename()`，一个命令一格状态（`listState`、`addState`……共十格），
签名与插件上的同名方法一致。改了登记表的命令（`open` / `attach` / `prune` / `add` / `mount` / `remove` / `rename`，以及只读视图的
`close()` / `release()` / `refresh()`）落定之后顺带重读登记表；同一格后发的请求胜出。
`useWorktrees()` 要在嵌套的 Provider **之外**调用：快照实例没装工作树插件。

`mounted` 是本实例此刻挂的那套表（换挂收尾之后才变）：`mounted.isMain` 即主检出位，登记行里 `tableSetSuffix === mounted.suffix` 的那一行就是挂着的，
当前分支是 `activeKey === mounted.holderKey` 的那一条。换挂之后 `useWorkingTree()` 不会自己重读，订阅 `mounted` 再重读：

```ts
const worktrees = useWorktrees();
const tree = useWorkingTree();
watch(worktrees.mounted, () => void tree.status());

const row = await worktrees.add('feature');
await worktrees.mount(row.id);
```

打开只读检出位得到的视图放进 `shallowRef`（RxDB 实例的私有字段过不了深层响应式代理），再在子组件里把 `view.rxdb`
交给 `provideRxDB()`，里面的查询 composable 与 rxdb-model 的实体列表照用：

```ts
const worktrees = useWorktrees();
const view = shallowRef<WorktreeView | null>(null);
view.value = await worktrees.open({ branchId: 'feature' });
// 子组件：provideRxDB(toRef(props, 'rxdb'))
```

用完 `view.close()`：断开只读实例、删快照库与登记。

## 三端对称

Angular [`@aiao/rxdb-plugin-working-tree-angular`](../rxdb-plugin-working-tree-angular) /
React [`@aiao/rxdb-plugin-working-tree-react`](../rxdb-plugin-working-tree-react) /
Vue `@aiao/rxdb-plugin-working-tree-vue`（本包） 的
`useWorkingTree()` 与 `useWorktrees()` **同名、同字段、同方法签名**，只有状态容器形态不同（`Signal` / 渲染快照 / `ComputedRef`）。
三个包各自的 spec 结尾都带一段 `tri-framework-api.md §3 清单守卫`，任一端加减成员都会红。

唯一随框架而异的是**换库**：React 每次 render 重新取库，`RxDBProvider` 换了 `db` 时两个 hook 都回到初态、
旧库迟到的结果丢弃；Angular 注入器里的库不会换，换库就是重建组件；Vue 在 `setup()` 里取一次库，
`provideRxDB()` 的源换了库时入口仍指着旧库，要跟着换就给用它的组件加 `:key`，让它随库重建。

## 行为约定（三端一致）

- **创建入口本身一次 IO 都不发**：十格状态初值全是 `idle`，只有真调了方法才去读库。
- **没有变更流**：状态只在经本入口发出的命令之后更新。别的标签页写进来的改动、直接走
  `entity.save()` 的写入，都不会推一份新的 status 过来——要最新值就再调一次 `status()`。
- 拿不到数据库时**抛错**，而不是返回一份「一切干净」的默认值。
- `commit()` 的 CAS 落败走返回值（`result.ok === false` 且带 `conflict`），不是异常。
- `restore()` 的四个被拒成因（冲突 / 工作树不干净 / 编解码不兼容 / 目标不可达）同样走返回值，
  因此 `restoreState` **没有 empty**——「被拒」与「一条都没恢复」都是结果。`restoreSessionState`
  的空只有一个含义：当前分支没有未结束的恢复会话；`conflicted` 的会话**不是**空。
- `switchBranch(branchId, options?)` 的被拒反过来走**异常**：`{ requireClean: true }` 撞上非空工作树时
  抛 `WorkingTreeDirtyError`，`expectedActivationRevision` 过期时抛核心的分支前置条件错误——那一刻分支
  **根本没切**，没有任何结果可交给调用方。不传第二参与无条件切换逐字节一致（核心那条「一个条件都没提
  就一条语句都不发」的快路径因此仍然成立）。成功之后自动重读一次 status：那份摘要属于**另一条**分支。
  它挂在核心的 `VersionManager` 而不是 `WorkingTreeManager` 上（contracts/core-api.md §6），三端入口
  因此取整个 `RxDB`，而不是只取 `db.workingTree`。

类型与错误类一律从 [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree) 直接 import，
本包**不重定义、也不再导出**（tri-framework-api.md §1）。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 工作树与提交能力见 [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree)

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
