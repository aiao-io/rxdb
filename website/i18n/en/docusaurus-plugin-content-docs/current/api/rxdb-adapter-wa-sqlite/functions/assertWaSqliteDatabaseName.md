# assertWaSqliteDatabaseName()

```ts
function assertWaSqliteDatabaseName(dbName): void;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/SqliteClient.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/SqliteClient.ts#L96)

Validates the database name before loading the browser VFS.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `dbName` | `string` | The adapter's database name |

## Returns

`void`

## Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) when the UTF-8 byte count exceeds [WA\_SQLITE\_MAX\_DATABASE\_NAME\_BYTES](../variables/WA_SQLITE_MAX_DATABASE_NAME_BYTES.md),
  or when the name would land in the same VFS file as another name (e.g. `tenant alice` / `tenant%20alice`, `a?x` / `a?y`)
