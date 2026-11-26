# assertRxDBBackupCompatible()

```ts
function assertRxDBBackupCompatible(manifest, expected): void;
```

Defined in: [packages/rxdb/src/backup/backup-manifest.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-manifest.ts#L138)

Judges whether an archive can be restored to the target configuration.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `manifest` | [`RxDBBackupManifest`](../interfaces/RxDBBackupManifest.md) | The result of [parseRxDBBackupManifest](parseRxDBBackupManifest.md) |
| `expected` | [`RxDBBackupCompatibility`](../interfaces/RxDBBackupCompatibility.md) | The target side's expectations |

## Returns

`void`

## Remarks

Equality checks: adapter name, engine, engine data compatibility key, system table structure version, change codec version, entity structure fingerprint; when the archive carries a constraint fingerprint, it must be equal too (archives from 0.0.28 and earlier lack this entry and only compare the other items). Extensions only require that everything the archive uses is provided by the target. The RxDB version, the full engine version, the source storage backend, and the creation time are recorded but not compared. An encrypted archive requires the target's auth domain to be exactly the same (`auth_domain_mismatch`); one side encrypted and the other not reports `incompatible_archive`.

## Throws

RxDBBackupError `incompatible_archive` / `auth_domain_mismatch`
