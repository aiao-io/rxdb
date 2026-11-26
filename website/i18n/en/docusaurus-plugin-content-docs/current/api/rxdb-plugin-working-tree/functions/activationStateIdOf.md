# activationStateIdOf()

```ts
function activationStateIdOf(tableSet): string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts#L65)

The primary key of a table set's activation state row: WORKING\_TREE\_ACTIVATION\_STATE\_ID for the main checkout, its held key for a writable checkout (US-314 B2.2).

## Parameters

| Parameter  | Type                                                         | Description                               |
| ---------- | ------------------------------------------------------------ | ----------------------------------------- |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | The table set this instance is mounted on |

## Returns

`string`

The primary key of that table set's activation state row

## Remarks

Each table set has its own `activationRevision`: switching branches inside a checkout only advances its own row, and the commit credentials held by the main checkout and other checkouts are unaffected. With only one row, any switch anywhere invalidates everyone's credentials; not advancing it lets stale credentials through after an `A → B → A` round trip. The branch generation (`branchGenerationSeq`) is a database-wide monotonic source, issued only on the main checkout's row. A writable checkout's row is created on open and deleted on close (`checkout/worktree-manager.ts`).
