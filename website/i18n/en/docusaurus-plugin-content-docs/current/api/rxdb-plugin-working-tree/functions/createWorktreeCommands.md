# createWorktreeCommands()

```ts
function createWorktreeCommands(database, patch): WorktreeCommands;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts#L151)

Builds a set of checkout commands.

## Parameters

| Parameter  | Type                                                          | Description           |
| ---------- | ------------------------------------------------------------- | --------------------- |
| `database` | [`RxDB`](../../rxdb/classes/RxDB.md)                          | The main instance     |
| `patch`    | [`WorktreeStatePatch`](../type-aliases/WorktreeStatePatch.md) | Where the state lands |

## Returns

[`WorktreeCommands`](../interfaces/WorktreeCommands.md)

The commands

## Throws

RxDBError the working tree plugin is not installed
