# parseRxDBBackupManifest()

```ts
function parseRxDBBackupManifest(value): RxDBBackupManifest;
```

Defined in: [packages/rxdb/src/backup/backup-manifest.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-manifest.ts#L76)

Validates and normalizes a backup manifest.

## Parameters

| Parameter | Type      | Description                |
| --------- | --------- | -------------------------- |
| `value`   | `unknown` | The result of `JSON.parse` |

## Returns

[`RxDBBackupManifest`](../interfaces/RxDBBackupManifest.md)

A structurally valid manifest.

## Remarks

Checks types and values field by field; any missing field, unknown semantic, or unrecognized format version reports `incompatible_archive`, with `details.field` pointing (via a dot path) at the first field that failed. The return value is a new object and does not reference the input.

## Throws

RxDBBackupError `incompatible_archive`
