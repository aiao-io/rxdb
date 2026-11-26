# assertQueryCacheRowContract()

```ts
function assertQueryCacheRowContract(entityName, rows, metadata): void;
```

Defined in: [packages/rxdb-adapter-pglite/src/query-cache/query\_cache\_row\_contract.ts:376](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/query-cache/query_cache_row_contract.ts#L376)

Validates the column set of remote rows before persistence, failing fast when the contract is violated.

## Parameters

| Parameter    | Type                                                          | Description                                                                                              |
| ------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `entityName` | `string`                                                      | The logical entity name passed in by `QueryCacheEngine`, used verbatim in error messages                 |
| `rows`       | readonly `object`[]                                           | Remote rows to be persisted                                                                              |
| `metadata`   | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata (`resolveQueryCacheTarget` already fails fast, so it is guaranteed to be available here) |

## Returns

`void`

## Remarks

Only **one** condition is judged: a column that is NOT NULL on the local table with no SQL default value must be deliverable as a non-null value by this row — either none of the three spellings carries it, or the key is present but the value is `null` / `undefined`. Both would be rejected by PostgreSQL when written; today that surfaces as the same `null value in column "created_at" of relation "qc_recipes" violates not-null constraint`: the table name is the **local** table name with the schema attached, the column name does not exist at all in the **remote** schema, and the call stack lands inside the adapter rather than at that `find()` — a triple misdirection whose first reading is "the local table was created wrong".

"Key present but value empty" is not a theoretical shape: when the remote column is nullable, or a `select` includes a join that matched nothing, `select('*')` returns `{ createdAt: null }`. Judging only key presence would let the whole batch through.

**Not judged**: heterogeneity within a batch. The criterion on the sqlite-core side exists because its column list is taken from `data[0]`, subsequent rows fetch values by the same batch keys, and a missing key binds `undefined` written as NULL (nullable columns silently cleared). PGlite groups by column set via `groupByColumnSet` and emits one INSERT per group; missing keys simply never appear in the column list — the structure does not have this disease, and judging it anyway would turn a delivered capability into an error.

Judged before persistence rather than catching and translating PostgreSQL errors: translation requires matching driver strings, and each driver phrases them differently — that would be a regex table maintained alongside driver versions. Computing "which columns must exist" from metadata and comparing is driver-independent.

Local defaults are **not** filled in for missing columns either (the iron rule "no fallback bailouts"): a fabricated `createdAt` would be the moment of the local fetch rather than the moment the record was created; different devices pulling the same row would get different values, and the pollution would only surface during cross-device comparison.

## Throws

When a row fails to satisfy the contract
