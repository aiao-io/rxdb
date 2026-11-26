# WorkingTreeRestoreSessionInfo

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:443](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L443)

The current branch's not-yet-finished restore session (contracts/core-api.md §5).

## Remarks

Exactly four fields, **without the two revisions**. They are the internal basis of `status()`'s `restoring` / `conflicted` judgment;
handing them out would only add one more algorithm: callers comparing the two numbers themselves, and that comparison
would eventually diverge from the one in `status.ts`. To know whether the session still holds, read `status()` —
the `restoring` / `conflicted` there is the single outlet of that same judgment.

## Properties

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:447](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L447)

The branch the session belongs to

***

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:445](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L445)

The primary key of the session row

***

### status \{#status\}

```ts
readonly status: WorkingTreeRestoreSessionStatus;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:451](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L451)

The session status

***

### targetCommitId \{#targetcommitid\}

```ts
readonly targetCommitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:449](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L449)

The source commit of this restore
