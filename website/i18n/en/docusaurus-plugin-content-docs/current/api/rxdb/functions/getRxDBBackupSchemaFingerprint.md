# getRxDBBackupSchemaFingerprint()

```ts
function getRxDBBackupSchemaFingerprint(rxdb): string;
```

Defined in: [packages/rxdb/src/backup/backup-target.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-target.ts#L31)

The entity structure fingerprint.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../classes/RxDB.md) | An `init()`-ed instance |

## Returns

`string`

The fingerprint

## Remarks

It takes the entity set after `init()`: many-to-many junction tables and repository-generated entities are added to
`config.entities` inside `SchemaManager.init()` — the source library has connected while the target has not — only "post-initialization" is comparable across the two sides.
