# readMountedWorktreeTableSet()

```ts
function readMountedWorktreeTableSet(database): WorktreeTableSet;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L123)

The table set this instance currently has mounted: the set `worktreeTableSet$` hands out at subscription time (US-314 C1).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `database` | [`RxDB`](../../rxdb/classes/RxDB.md) | The main instance |

## Returns

[`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)

The mounted table set

## Throws

RxDBError the stream did not hand out the current set at subscription time

## Remarks

The three frameworks' `useWorktrees()` all take the initial value of `mounted` from the stream and do not read `rxdb.worktreeTableSet`: inside the re-mount transaction that field changes first,
and the stream only emits after the entity caches are cleared, so the side reading the field would see the new set one step earlier than the other two. Only reads the in-memory stream, no IO.
