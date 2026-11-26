# generateSwitchBranchStatements()

```ts
function generateSwitchBranchStatements(adapter, branchId): string[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch\_branch.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts#L46)

Generates the sequence of SQL statements to execute when switching branches, returned in execution order.

## Parameters

| Parameter  | Type                                                           |
| ---------- | -------------------------------------------------------------- |
| `adapter`  | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `branchId` | `string`                                                       |

## Returns

`string`[]

## Remarks

Split into an array rather than assembled into one block because **result set collection** follows statement boundaries: oo1's `db.exec()`
only collects the rows of the first statement "with result columns" for multi-statement SQL (`evalFirstResult`). Once the branch switch is split into
the two `RETURNING`s of "extinguish + light up" and passed together to a single `execute()`, the rows of the light-up statement
can never reach [transaction\_sqlite\_result](transaction_sqlite_result.md) — the target branch's cached entities stay at `activated = false`,
while the SQL itself executes perfectly fine with no error at all.

So the caller either executes statement by statement ([switch\_branch](switch_branch.md), which needs those rows to dispatch events),
or assembles them and executes at once (paths that only care about write side effects, such as [withTriggersDisabled](withTriggersDisabled.md)).
