# describeSqliteDatabase()

```ts
function describeSqliteDatabase(executor): Promise<SqliteBlankDatabase>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-blank-database.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-blank-database.ts#L87)

Describes a database's structure and all rows, for restore to decide whether the target "is exactly a freshly created empty database".

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | `SqliteBackupExecutor` | Client |

## Returns

`Promise`&lt;[`SqliteBlankDatabase`](../interfaces/SqliteBlankDatabase.md)&gt;

Object list, structure and row counts, all rows

## Remarks

The structure reuses readSqliteBackupSchema from the backup's read side, and rows are the whole-row literals used by the dump,
so two identical descriptions mean backing up the two databases would produce identical content. Throws `restore_incomplete` when the database holds a restore marker.
