# MigrationRecordStore

Defined in: [packages/rxdb-plugin-search/src/core/fts5-runtime.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-runtime.ts#L58)

Abstraction for migration record access. The plugin does not depend directly on the `RxDBMigration` entity, which makes unit testing and reuse easier.

## Methods

### listInstallMigrationsForTable() \{#listinstallmigrationsfortable\}

```ts
listInstallMigrationsForTable(tableName): Promise<readonly object[]>;
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-runtime.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-runtime.ts#L64)

Lists all `fts5__<table>__v1__install__*` migration records for a table. Usually there will be only 0 or 1 — if multiple different signatures coexist, the migration history has been contaminated and `installFtsForEntity` throws [SearchSchemaMismatchError](../classes/SearchSchemaMismatchError.md) directly (fail-fast, no guessing which one is trustworthy).

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `tableName` | `string` |

#### Returns

`Promise`&lt;readonly `object`[]&gt;

---

### recordMigration() \{#recordmigration\}

```ts
recordMigration(name): Promise<void>;
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-runtime.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-runtime.ts#L66)

Writes a migration record (idempotency optional; the caller guarantees not to write duplicate records with the same name)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

#### Returns

`Promise`&lt;`void`&gt;
