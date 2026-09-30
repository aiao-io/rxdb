# @aiao/rxdb-plugin-tree-react

[`@aiao/rxdb-plugin-tree`](../rxdb-plugin-tree) 的 React 集成层。把四个树查询接到 React 状态。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-tree @aiao/rxdb-react @aiao/rxdb-plugin-tree-react react rxjs
```

## 用法

```tsx
import { useCountDescendants, useFindDescendants } from '@aiao/rxdb-plugin-tree-react';

export function CategoryTree({ rootId }: { readonly rootId: string }) {
  const children = useFindDescendants(Category, { entityId: rootId, level: 1 });
  const total = useCountDescendants(Category, { entityId: rootId });

  if (children.error) return <p role="alert">{children.error.message}</p>;

  return (
    <section aria-busy={children.isLoading}>
      <h2>共 {total.value} 个后代</h2>
      <ul>
        {children.value.map(node => (
          <li key={String(node.id)}>{node.name}</li>
        ))}
      </ul>
    </section>
  );
}
```

四个 hook 依赖插件注册的 `TreeRepository`，应用必须先 `rxdb.use(rxDBPluginTree)` 再 `init()`。

## API

| Hook                  | 仓储方法           | 结果类型                          | 默认值 |
| --------------------- | ------------------ | --------------------------------- | ------ |
| `useFindDescendants`  | `findDescendants`  | `RxDBResource<InstanceType<T>[]>` | `[]`   |
| `useCountDescendants` | `countDescendants` | `RxDBResource<number>`            | `0`    |
| `useFindAncestors`    | `findAncestors`    | `RxDBResource<InstanceType<T>[]>` | `[]`   |
| `useCountAncestors`   | `countAncestors`   | `RxDBResource<number>`            | `0`    |

都是 [`useRepositoryQuery`](../rxdb-react) 的薄包装：只决定「查哪个仓储方法、默认值是什么」，订阅、错误与加载状态全部由 `@aiao/rxdb-react` 负责，`RxDBResource` 的状态组合与核心 hooks 完全一致。

泛型收紧到 `TreeEntityType`：实例不满足 `ITreeEntity`（缺 `createdAt` / `updatedAt`）的实体在编译期就被拒。

三框架同功能对称：Angular 见 [`@aiao/rxdb-plugin-tree-angular`](../rxdb-plugin-tree-angular)，Vue 见 [`@aiao/rxdb-plugin-tree-vue`](../rxdb-plugin-tree-vue)。

## 迁移

这四个 hook 曾由 `@aiao/rxdb-react` 导出。改从本包取，见 [tree-split 迁移说明](https://github.com/aiao-io/rxdb/blob/main/website/docs/migration/tree-split.md)。

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
