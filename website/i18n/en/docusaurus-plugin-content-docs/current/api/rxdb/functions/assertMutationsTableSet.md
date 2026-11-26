# assertMutationsTableSet()

```ts
function assertMutationsTableSet<T>(rxdb, options): void;
```

Defined in: [packages/rxdb/src/entity/worktree-table-set-guard.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/worktree-table-set-guard.ts#L49)

Checks the entities' table set when a batch write actually executes; must share the transaction boundary with the write.

## Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type                                                               | Description                         |
| --------- | ------------------------------------------------------------------ | ----------------------------------- |
| `rxdb`    | [`RxDB`](../classes/RxDB.md)                                       | The instance initiating the write   |
| `options` | [`RxDBMutationsMap`](../interfaces/RxDBMutationsMap.md)&lt;`T`&gt; | The whole batch of entity mutations |

## Returns

`void`

## Throws

[WorktreeTableSetMismatchError](../classes/WorktreeTableSetMismatchError.md) rejects the whole batch when an entity comes from another table set
