# countDescendants

`countDescendants` counts the descendants of a tree entity without returning the entities themselves.

> The four tree queries come from the plugin package `@aiao/rxdb-plugin-tree`; the library must call `rxdb.use(rxDBPluginTree)` first. See [Tree plugin split](../migration/tree-split.md).

## Signature

```ts
countDescendants(options: FindTreeOptions<T>): Observable<number>
```

## Count semantics

- With `entityId`: excludes the current node, counts only descendants
- Without `entityId`: counts starting from all root nodes
- `level` normalization follows the same rules as [findDescendants](./findDescendants.md)

## Basic usage

```ts
import { firstValueFrom } from 'rxjs';

const count = await firstValueFrom(
  Menu.countDescendants({
    entityId: root.id,
    level: 2
  })
);
```

## Direct child count

```ts
const directChildCount = await firstValueFrom(
  Menu.countDescendants({
    entityId: root.id,
    level: 1
  })
);
```

## Filtered count

```ts
const activeCount = await firstValueFrom(
  Menu.countDescendants({
    entityId: root.id,
    where: {
      combinator: 'and',
      rules: [{ field: 'enabled', operator: '=', value: true }]
    }
  })
);
```

:::tip About ordering

A count has no notion of order. The display order of siblings in a tree (the tree-building order) comes from the default ordering of regular queries: for a sortable tree entity declaring `manualOrder: { groupBy: ['parentId'] }`, a query without `orderBy` returns `[parentId, sortOrder, id]`. See [Manual ordering (manualOrder and reorder)](../model-mutation/reorder.md).

:::

## See also

- [findDescendants](./findDescendants.md)
- [countAncestors](./countAncestors.md)
