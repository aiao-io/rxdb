# withTriggersDisabled()

```ts
function withTriggersDisabled<T>(adapter, tx, body, tableSet?): Promise<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/with\_triggers\_disabled.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/with_triggers_disabled.ts#L93)

Runs a piece of writing inside a window with triggers disabled: drop triggers → run `body` → rebuild triggers.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter   | Type                                                           | Default value      | Description                                                                                                                                         |
| ----------- | -------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapter`   | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) | `undefined`        | SQLite adapter                                                                                                                                      |
| `tx`        | [`SqlExecutor`](../type-aliases/SqlExecutor.md)                | `undefined`        | Executor of the **current** transaction; the three steps of the sandwich must land in the same transaction                                          |
| `body`      | () => `Promise`&lt;`T`&gt;                                     | `undefined`        | The write to execute inside the window; its return value is passed through unchanged                                                                |
| `tableSet?` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)   | `adapter.tableSet` | Which table set's triggers to drop and remount; defaults to the set mounted on this instance; QueryCache writes pass the main table set (see below) |

## Returns

`Promise`&lt;`T`&gt;

`body`'s return value

## Throws

Rethrows `body`'s error unchanged — when `body` throws but the trigger rebuild succeeds

## Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) when the current branch cannot be read during the trigger rebuild phase (regardless of whether `body` succeeded, see below)

## Throws

AggregateError when `body` and the trigger rebuild **both** fail: `errors` is
`[bodyError, restoreError]`, and `cause` is `bodyError`

## Remarks

Used for the "copy a remote replica into local tables" path: pull backfill and QueryCache cache writes are not local changes
and should not enter `rxdb_change`. The `AFTER INSERT/UPDATE/DELETE` triggers on the tables do not distinguish write sources,
so the only way to suppress them is to drop them during the write.

**The three steps must share the write's transaction**: splitting them into two `runInTransaction` calls self-deadlocks under C2 nested transactions
(see the note on [readCurrentBranchId](readCurrentBranchId.md)), and the committed window in between without triggers would be open to concurrent writes —
the history of those writes would be lost forever.

Both dropping and rebuilding only touch one table set (defaulting to the `adapter.tableSet` mounted on this instance); the rebuild stamps the branch held by that table set and **does not touch branch tables** (US-314 B1.3).
Previously the rebuild reused the whole SQL block of branch switching, so every pull carried an identity UPDATE on the branch table; when mounted on a writable checkout, that UPDATE
would light up the branch held by the checkout. QueryCache-synced entities only live in the main table set (never in shadow table sets): when backfilling the cache while mounted on a writable checkout,
what needs dropping is the main table set's triggers — dropping this instance's set is the same as dropping nothing, and the backfill still gets logged into the main branch's history (US-314 B2.1).

**The trigger rebuild is a wrap-up that "must run whether or not it succeeds", and it is not implemented with `try/finally`**: this function's production
call sites are all inside `this.transaction()`, so when `body` throws the whole transaction rolls back with it, and the intermediate "triggers dropped,
not yet rebuilt" state was never really committed; but this function is publicly exported via `src/index.ts`, and when a third party calls it outside a transaction and
`body` throws, that intermediate state really does get committed — the database then has no triggers forever, with no error indication at all.
Switching to `try { ... } finally { await restoreTriggers(); }` would mean that a further throw in the `finally` block
(the rebuild itself failing) swallows the `try` block's completion state per the semantics described by `no-unsafe-finally`,
and `body`'s original error disappears completely without a trace. This instead uses the shape "first capture `body`'s result, then run the
wrap-up unconditionally, and finally decide what to throw based on both results": it is isomorphic to
`withTemporaryValue` in `packages/rxdb-test/src/encrypted/temporary-value.ts`
— that function solves a structurally identical problem (run the main operation → unconditionally run a wrap-up that "must execute" →
use `AggregateError` to preserve both sides when both fail), and this reuses the same shape and wording style directly.

## Example

```typescript
await adapter.runInTransaction(tx => withTriggersDisabled(adapter, tx, () => writeRemoteRows(tx, rows)), false);
```
