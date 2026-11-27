# installFtsForEntity()

```ts
function installFtsForEntity(plan, executor, migrationStore): Promise<InstallFtsResult>;
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-runtime.ts:248](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-runtime.ts#L248)

Performs FTS5 installation for a single entity; idempotent.

Behavior:

- If an install record with the same signature already exists → `already_installed`, no side effects
- If an install record with a different signature already exists → throws [SearchSchemaMismatchError](../classes/SearchSchemaMismatchError.md)
- Otherwise executes in the order DDL → triggers → backfill → two migration records

Callers are responsible for wrapping the installation of multiple entities in `adapter.transaction(...)`; this function itself does not open a transaction — some adapters/dialects disallow DDL inside transactions.

## Parameters

| Parameter        | Type                                                            |
| ---------------- | --------------------------------------------------------------- |
| `plan`           | [`FtsInstallPlan`](../interfaces/FtsInstallPlan.md)             |
| `executor`       | [`RuntimeSqlExecutor`](../interfaces/RuntimeSqlExecutor.md)     |
| `migrationStore` | [`MigrationRecordStore`](../interfaces/MigrationRecordStore.md) |

## Returns

`Promise`&lt;[`InstallFtsResult`](../interfaces/InstallFtsResult.md)&gt;
