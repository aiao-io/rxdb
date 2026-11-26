# sqliteStorageLockName()

```ts
function sqliteStorageLockName(storageKey): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts#L78)

The lock name protecting the same persistent SQLite database.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `storageKey` | `string` | The `storageKey` of [SqliteBackupStorage](../type-aliases/SqliteBackupStorage.md) |

## Returns

`string`

The lock name
