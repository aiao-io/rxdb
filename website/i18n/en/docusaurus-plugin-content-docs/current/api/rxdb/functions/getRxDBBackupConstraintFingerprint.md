# getRxDBBackupConstraintFingerprint()

```ts
function getRxDBBackupConstraintFingerprint(rxdb): string;
```

Defined in: [packages/rxdb/src/backup/backup-target.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-target.ts#L44)

The entity-level storage constraint fingerprint (CHECK / conditional unique index / exclusion range), written into the manifest's `constraintFingerprint`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../classes/RxDB.md) | An `init()`-ed instance |

## Returns

`string`

64 hexadecimal characters of SHA-256

## Remarks

Like [getRxDBBackupSchemaFingerprint](getRxDBBackupSchemaFingerprint.md), takes the entity set after `init()`. The backup side writes it into the manifest and the restore side computes the expectation,
with both sides sharing this one algorithm; two configurations that differ only in these constraints are invisible to the structural fingerprint, so this one rejects them before writing to the target.
