# getRxDBBackupAuthDomain()

```ts
function getRxDBBackupAuthDomain(rxdb): string | null;
```

Defined in: [packages/rxdb/src/backup/backup-target.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-target.ts#L14)

The encryption auth domain: the library name when some entity declares an encrypted column (same source as the keyring's namespace), otherwise `null`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../classes/RxDB.md) | An `init()`-ed instance |

## Returns

`string` \| `null`

The auth domain

## Remarks

The backup side writes it into the manifest and the restore side compares against it; both sides must be the same algorithm, so it lives in the core rather than one copy per adapter.
