# isUniqueConstraintViolation()

```ts
function isUniqueConstraintViolation(cause): boolean;
```

Defined in: [packages/rxdb/src/system/migration.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L223)

Determines whether an error is a unique / primary key constraint conflict.

## Parameters

| Parameter | Type      | Description                         |
| --------- | --------- | ----------------------------------- |
| `cause`   | `unknown` | The raw error thrown by the adapter |

## Returns

`boolean`

`true` when it is a unique / primary key constraint conflict

## Remarks

Each adapter's error object has a different shape; the only things in common are two: PostgreSQL's SQLSTATE `23505`,
and the native text always present in the messages of the SQLite bindings (wa-sqlite / sqlite-wasm / sqliteai / node).
Only these two are matched; other errors are rethrown unchanged — the same definition as `sqlite-core-keyring-storage.ts` (SQLC-029).

**Do not** use it to judge whether a write failure at an arbitrary location **is** a concurrency conflict: it only says "this is a unique constraint violation",
not "which table and which index conflicted". The caller must sandwich it around that one INSERT it sent itself,
otherwise an unrelated unique constraint error in user code would be misread (see [RxDBMigrationClaimConflictError](../classes/RxDBMigrationClaimConflictError.md)).
