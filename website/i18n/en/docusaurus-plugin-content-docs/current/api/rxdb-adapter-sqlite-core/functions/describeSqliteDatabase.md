# describeSqliteDatabase()

```ts
function describeSqliteDatabase(executor): Promise<SqliteBlankDatabase>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-blank-database.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-blank-database.ts#L87)

Describes a database's structure and all rows, so restore can judge whether the target "is exactly a freshly created empty database".

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | `SqliteBackupExecutor` | The client |

## Returns

`Promise`&lt;[`SqliteBlankDatabase`](../interfaces/SqliteBlankDatabase.md)&gt;

The object list, structure and row counts, and all rows

## Remarks

The structure follows the `readSqliteBackupSchema` read by backup, and the rows are whole-row literals for dumping,
so two identical descriptions mean backing up the two databases yields the same content. Throws `restore_incomplete` when the database has a restore marker.
