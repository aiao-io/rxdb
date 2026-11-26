# deleteIndexedDatabase()

```ts
function deleteIndexedDatabase(name): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/worktree/drop-storage.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/worktree/drop-storage.ts#L26)

Deletes an IndexedDB database; does nothing when the database does not exist.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | IndexedDB database name |

## Returns

`Promise`&lt;`void`&gt;

## Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) When the database is blocked by another connection beyond the grace period, or when the deletion itself fails
