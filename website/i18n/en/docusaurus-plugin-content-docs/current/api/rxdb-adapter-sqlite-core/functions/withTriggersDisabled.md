# withTriggersDisabled()

```ts
function withTriggersDisabled<T>(adapter, tx, body, tableSet?): Promise<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/with\_triggers\_disabled.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/with_triggers_disabled.ts#L93)

Executes a block of writes inside a window with triggers disabled: drop triggers → run `body` → rebuild triggers.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter   | Type                                                           | Default value      | Description                                                                                                                                            |
| ----------- | -------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `adapter`   | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) | `undefined`        | The SQLite adapter                                                                                                                                     |
| `tx`        | [`SqlExecutor`](../type-aliases/SqlExecutor.md)                | `undefined`        | The executor of the **current** transaction; the three sandwich steps must land in the same transaction                                                |
| `body`      | () => `Promise`&lt;`T`&gt;                                     | `undefined`        | The writes to execute inside the window; the return value is passed through as-is                                                                      |
| `tableSet?` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)   | `adapter.tableSet` | Which table set's triggers to drop and reattach; default is the one this instance is mounted on; QueryCache writes pass the main table set (see below) |

## Returns

`Promise`&lt;`T`&gt;

The return value of `body`

## Throws

Rethrows `body`'s error as-is — when `body` throws but the trigger rebuild succeeds

## Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) Thrown when the current branch cannot be read during the trigger rebuild phase (regardless of whether `body` succeeded, see below)

## Throws

AggregateError Thrown when **both** `body` and the trigger rebuild fail: `errors` is
`[bodyError, restoreError]`, and `cause` is `bodyError`

## Remarks

Used for paths that "copy a remote replica into local tables": pull backfills and QueryCache cache writes are not local changes,
and should not enter `rxdb_change`. The `AFTER INSERT/UPDATE/DELETE` triggers on the table do not distinguish the write source,
and the only way to suppress them is to remove them during the write.

**The three steps must be in the same transaction as the write**: splitting into two `runInTransaction` calls self-deadlocks under C2 nested transactions
(see the note in [readCurrentBranchId](readCurrentBranchId.md)), and the committed window in between, with no triggers, is open to concurrent writes —
the history of those writes would be lost forever.

Both the drop and the rebuild only touch one table set (default `adapter.tableSet`, the one this instance is mounted on); the rebuild is branded with the branch held by that table set and does **not touch branch tables** (US-314 B1.3).
Previously the rebuild reused the whole SQL block of branch switching, so every pull carried along an identity UPDATE of the branch table; when mounted on a writable checkout, that UPDATE
would light up the branch held by the checkout. Entities synced by QueryCache only live in the main table set (they do not enter shadow table sets): when backfilling the cache while mounted on a writable checkout,
what must be dropped are the main table set's triggers; dropping this instance's own set is as good as dropping nothing, and the backfill still gets recorded into the main branch's log (US-314 B2.1).

**Rebuilding triggers is a "must run whether it succeeded or failed" tail step, and it is not implemented with `try/finally`**: the production call sites of this function
are all inside `this.transaction()`, so when `body` throws the whole transaction rolls back with it, and the intermediate state of "triggers dropped,
not yet rebuilt" is never actually committed; but this function is publicly exported through `src/index.ts`, and when a third party calls it outside a transaction and
`body` throws, that intermediate state really does commit — the database is then permanently without triggers, with no error at all.
If it were changed to `try { ... } finally { await restoreTriggers(); }`, an error thrown inside the `finally` block
(the rebuild itself failing) would swallow the completion state of the `try` block per the semantics described by `no-unsafe-finally`,
and `body`'s original error would be gone completely and untraceably. Here it uses the pattern of "first capture `body`'s result, then unconditionally run
the tail step, then decide what to throw based on both results": isomorphic to
`withTemporaryValue` in `packages/rxdb-test/src/encrypted/temporary-value.ts`
— that function solves a structurally identical problem (run the main operation → unconditionally run a "must execute" tail step →
preserve both sides with `AggregateError` when both fail), and this one reuses the same shape and wording style directly.

## Example

```typescript
await adapter.runInTransaction(tx => withTriggersDisabled(adapter, tx, () => writeRemoteRows(tx, rows)), false);
```
