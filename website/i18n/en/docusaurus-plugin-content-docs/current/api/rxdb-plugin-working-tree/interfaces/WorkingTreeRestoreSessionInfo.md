# WorkingTreeRestoreSessionInfo

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:443](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L443)

The current branch's not-yet-finished restore session (contracts/core-api.md §5).

## Remarks

Exactly four fields, **without the two revisions**. They are the internal basis for `status()` judging `restoring` / `conflicted`, and handing them out only adds another algorithm: the caller compares two numbers itself, and that comparison eventually diverges from the one in `status.ts`. To know whether the session still holds, read `status()` — its `restoring` / `conflicted` are the only exit of the same judgment.

## Properties

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:447](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L447)

The branch the session belongs to

---

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:445](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L445)

The session row's primary key

---

### status \{#status\}

```ts
readonly status: WorkingTreeRestoreSessionStatus;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:451](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L451)

The session status

---

### targetCommitId \{#targetcommitid\}

```ts
readonly targetCommitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:449](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L449)

The commit this restore came from
