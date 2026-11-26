# readActiveRestoreSession()

```ts
function readActiveRestoreSession(executor, branchId): Promise<WorkingTreeRestoreSessionInfo | null>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:471](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L471)

Reads the current branch's unfinished restore session; `null` when there is none.

## Parameters

| Parameter  | Type                                                                  | Description                      |
| ---------- | --------------------------------------------------------------------- | -------------------------------- |
| `executor` | [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md) | The current transaction executor |
| `branchId` | `string`                                                              | The target branch                |

## Returns

`Promise`&lt;
\| [`WorkingTreeRestoreSessionInfo`](../interfaces/WorkingTreeRestoreSessionInfo.md)
\| `null`&gt;

See [WorkingTreeRestoreSessionInfo](../interfaces/WorkingTreeRestoreSessionInfo.md); `null` when there is no unfinished session

## Remarks

The query itself goes through readActiveRestoreSessionRow, the **same** one as `readRestoreBits` in `status.ts`: the criterion is `activeKey IS NOT NULL` rather than `status = 'active'`. The two look equivalent; the difference is `conflicted` — that session's `activeKey` still occupies the index and still needs the user to resolve it, and filtering by status makes it silently vanish at this entry point while it remains at the unique index.

This function does only one extra thing: **narrows** the row to [WorkingTreeRestoreSessionInfo](../interfaces/WorkingTreeRestoreSessionInfo.md) before exposing it. Handing out the entity row directly lets callers mutate its `status` / `activeKey` — while terminal state transitions are only permitted through `restore-session-transitions.ts`, where SQL and the in-memory row change together.
