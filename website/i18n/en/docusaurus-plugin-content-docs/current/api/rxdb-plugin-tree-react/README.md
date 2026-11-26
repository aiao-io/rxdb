# rxdb-plugin-tree-react

The React integration layer for [`@aiao/rxdb-plugin-tree`](../rxdb-plugin-tree/README.md). Wires the four tree queries into React state.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-tree @aiao/rxdb-react @aiao/rxdb-plugin-tree-react react rxjs
```

## Usage

```tsx
import { useCountDescendants, useFindDescendants } from '@aiao/rxdb-plugin-tree-react';

export function CategoryTree({ rootId }: { readonly rootId: string }) {
  const children = useFindDescendants(Category, { entityId: rootId, level: 1 });
  const total = useCountDescendants(Category, { entityId: rootId });

  if (children.error) return <p role="alert">{children.error.message}</p>;

  return (
    <section aria-busy={children.isLoading}>
      <h2>{total.value} descendants total</h2>
      <ul>
        {children.value.map(node => (
          <li key={String(node.id)}>{node.name}</li>
        ))}
      </ul>
    </section>
  );
}
```

The four hooks depend on the `TreeRepository` registered by the plugin; the application must call `rxdb.use(rxDBPluginTree)` and then `init()`.

## API

| Hook                  | Repository method  | Result type                       | Default |
| --------------------- | ------------------ | --------------------------------- | ------- |
| `useFindDescendants`  | `findDescendants`  | `RxDBResource<InstanceType<T>[]>` | `[]`    |
| `useCountDescendants` | `countDescendants` | `RxDBResource<number>`            | `0`     |
| `useFindAncestors`    | `findAncestors`    | `RxDBResource<InstanceType<T>[]>` | `[]`    |
| `useCountAncestors`   | `countAncestors`   | `RxDBResource<number>`            | `0`     |

All four are thin wrappers around [`useRepositoryQuery`](../rxdb-react/README.md): they only decide "which repository method to query and what the default value is"; subscription, error and loading state are entirely handled by `@aiao/rxdb-react`, and `RxDBResource`'s state combinations are exactly the same as the core hooks.

The generics are narrowed to `TreeEntityType`: entities whose instances do not satisfy `ITreeEntity` (missing `createdAt` / `updatedAt`) are rejected at compile time.

Symmetric functionality across the three frameworks: see [`@aiao/rxdb-plugin-tree-angular`](../rxdb-plugin-tree-angular/README.md) for Angular and [`@aiao/rxdb-plugin-tree-vue`](../rxdb-plugin-tree-vue/README.md) for Vue.

## Migration

These four hooks used to be exported by `@aiao/rxdb-react`. Import them from this package instead; see the [tree-split migration notes](https://github.com/aiao-io/rxdb/blob/main/website/docs/migration/tree-split.md).

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

## Functions

| Function                                                | Description                              |
| ------------------------------------------------------- | ---------------------------------------- |
| [useCountAncestors](functions/useCountAncestors.md)     | Counts the ancestors of a tree entity.   |
| [useCountDescendants](functions/useCountDescendants.md) | Counts the descendants of a tree entity. |
| [useFindAncestors](functions/useFindAncestors.md)       | Finds all ancestors of a tree entity.    |
| [useFindDescendants](functions/useFindDescendants.md)   | Finds all descendants of a tree entity.  |
