# @aiao/rxdb-plugin-working-tree-react

[`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree) 的 React 集成层。提供 `useWorkingTree()` hook，把工作树插件的 `WorkingTreeManager` 适配为 React 状态消费接口。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-working-tree @aiao/rxdb-react @aiao/rxdb-plugin-working-tree-react react rxjs
```

## 用法

```tsx
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-react';
import { RxDBProvider } from '@aiao/rxdb-react';

const db = new RxDB(config);
db.use(rxDBPluginWorkingTree); // ← 必须在 connect() 之前
await db.connect('sqlite-wasm');

export function CommitBar() {
  const tree = useWorkingTree();

  const save = async () => {
    const status = await tree.status();
    const result = await tree.commit('保存', {
      expectedBranchId: status.branchId,
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

`useWorkingTree()` 经 `useRxDB()` 取库，因此组件树里必须有 `RxDBProvider`。七个状态字段是**普通只读值**
（`Readonly<WorkingTreeAsyncStates>`），可以直接解构；七个方法**引用稳定**，可以安全放进
`useEffect` / `useMemo` 的依赖数组。

## 三端对称

Angular [`@aiao/rxdb-plugin-working-tree-angular`](../rxdb-plugin-working-tree-angular) /
React `@aiao/rxdb-plugin-working-tree-react`（本包） /
Vue [`@aiao/rxdb-plugin-working-tree-vue`](../rxdb-plugin-working-tree-vue) 的
`useWorkingTree()` **同名、同字段、同方法签名**，只有状态容器形态不同（`Signal` / 渲染快照 / `ComputedRef`）。
三个包各自的 spec 结尾都带一段 `tri-framework-api.md §3 清单守卫`，任一端加减成员都会红。

## 行为约定（三端一致）

- **创建入口本身一次 IO 都不发**：七格状态初值全是 `idle`，只有真调了方法才去读库。
- **没有变更流**：状态只在经本入口发出的命令之后更新。别的标签页写进来的改动、直接走
  `entity.save()` 的写入，都不会推一份新的 status 过来——要最新值就再调一次 `status()`。
- 拿不到数据库时**抛错**，而不是返回一份「一切干净」的默认值。
- `commit()` 的 CAS 落败走返回值（`result.ok === false` 且带 `conflict`），不是异常。

类型与错误类一律从 [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree) 直接 import，
本包**不重定义、也不再导出**（tri-framework-api.md §1）。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 工作树与提交能力见 [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree)

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
