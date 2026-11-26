# assertQueryCacheRowContract()

```ts
function assertQueryCacheRowContract(entityName, rows, metadata): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query-cache-row-contract.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query-cache-row-contract.ts#L266)

Validates the column set of remote rows before writing them; fails fast when the contract is violated.

## Parameters

| Parameter    | Type                                                                                                    | Description                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entityName` | `string`                                                                                                | The logical entity name passed in by `QueryCacheEngine`; appears verbatim in error messages                                                             |
| `rows`       | readonly `object`[]                                                                                     | The remote rows about to be written                                                                                                                     |
| `metadata`   | \| `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; \| `undefined` | Entity metadata; when not found, the first two criteria are skipped (the local table's NOT NULL column set cannot be computed), the third still applies |

## Returns

`void`

## Remarks

Three criteria, with different causes and different fixes, so they are written separately in the message:

1. **Missing NOT NULL column** — the local table is created NOT NULL with no SQL default, so the write is bound to be rejected by SQLite. Today this surfaces as `NOT NULL constraint failed: public$recipes.createdAt`: the table name is the namespace-prefixed **local** table name, the column name does not even exist in the **remote** schema, and the call stack lands inside the adapter rather than at that `find()` — three layers of misdirection that make the reader's first reaction "the local table is wrong".
2. **NOT NULL column present as a key but with a null value** — `{ createdAt: null }` passes criterion 1 with its key, only to be rejected by the database with the **same** NOT NULL error. When the remote column is nullable, or a `select` carries a join that missed, this is exactly the shape `select('*')` returns — not a theoretical shape. The fix differs from criterion 1 (investigate why the remote side has null in this column), so it gets its own section.
3. **Heterogeneous batch** — `upsertMany` takes its column list from `data[0]`, and subsequent rows are read with the same set of keys. A missing key binds `undefined`, which lands as NULL in SQLite: a nullable column gets **silently wiped**, without even an error.

Judging before the write, rather than catching and translating SQLite errors: translation requires matching driver strings, and wa-sqlite / sqlite-wasm / node:sqlite word things differently — a regex table that has to be maintained together with driver versions. Computing "which columns must exist" from metadata and comparing is driver-independent.

It also does **not** fill missing columns with local defaults: a backfilled `createdAt` would be the moment of the local fetch rather than the moment the record was created; different devices pulling the same row would get different values, and this pollution would only surface in cross-device comparison.

## Throws

When rows violating the contract exist
