---
sidebar_label: "TreeQuery⟨T⟩"
---

# TreeQuery`<T>`

```ts
type TreeQuery<T> = 
  | FindDescendantsQuery<T>
  | FindAncestorsQuery<T>
  | CountDescendantsQuery<T>
  | CountAncestorsQuery<T>;
```

Defined in: [rxdb-plugin-tree/src/query/tree-query.interface.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/query/tree-query.interface.ts#L56)

Union of the four tree query tasks.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Remarks

Bidirectional consistency with [TreeQueryType](TreeQueryType.md) is pinned by `__tests__/contracts/tree-query-type-parity.spec.ts`: adding one here without adding it to [TREE\_QUERY\_TYPE\_LIST](../variables/TREE_QUERY_TYPE_LIST.md) (or vice versa) makes that assertion fail to compile.
