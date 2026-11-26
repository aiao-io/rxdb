# countAncestors

`countAncestors` counts the ancestors of a tree entity without returning the entities themselves.

> The four tree queries come from the plugin package `@aiao/rxdb-plugin-tree`; the library must call `rxdb.use(rxDBPluginTree)` first. See [Tree plugin split](../migration/tree-split.md).

## Signature

```ts
countAncestors(options: FindTreeOptions<T>): Observable<number>
```

## Count semantics

- With `entityId`: excludes the current node, counts only ancestors
- `level` normalization follows the same rules as [findAncestors](./findAncestors.md)
- A root node normally has `0` ancestors

## Basic usage

```ts
import { firstValueFrom } from 'rxjs';

const count = await firstValueFrom(
  Menu.countAncestors({
    entityId: leaf.id
  })
);
```

## Checking whether a node is a root

```ts
const isRoot = (await firstValueFrom(Menu.countAncestors({ entityId: node.id }))) === 0;
```

## Limiting the counted levels

```ts
const parentOnly = await firstValueFrom(
  Menu.countAncestors({
    entityId: leaf.id,
    level: 1
  })
);
```

:::tip About ordering

A count has no notion of order. The display order of siblings in a tree (the tree-building order) comes from the default ordering of regular queries: for a sortable tree entity declaring `manualOrder: { groupBy: ['parentId'] }`, a query without `orderBy` returns `[parentId, sortOrder, id]`. See [Manual ordering (manualOrder and reorder)](../model-mutation/reorder.md).

:::

## See also

- [findAncestors](./findAncestors.md)
- [countDescendants](./countDescendants.md)
