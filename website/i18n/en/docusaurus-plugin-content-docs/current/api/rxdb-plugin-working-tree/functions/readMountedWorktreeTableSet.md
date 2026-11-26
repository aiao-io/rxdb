# readMountedWorktreeTableSet()

```ts
function readMountedWorktreeTableSet(database): WorktreeTableSet;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L123)

The table set this instance is currently mounted on: the one `worktreeTableSet$` delivers at subscription
time (US-314 C1).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `database` | [`RxDB`](../../rxdb/classes/RxDB.md) | The main instance |

## Returns

[`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)

The mounted table set

## Throws

RxDBError when the stream does not deliver the current set at subscription time

## Remarks

The three frameworks' `useWorktrees()` all take their `mounted` initial value from the stream, none of them
reads `rxdb.worktreeTableSet`: in the remount transaction that field changes first, while the stream only
emits after the entity cache has been cleared — the field-reading side would see the new set one step before
the other two. Only the in-memory stream is read; no IO is issued.
