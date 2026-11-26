# isCurrentRxDBSystemVersion()

```ts
function isCurrentRxDBSystemVersion(state): boolean;
```

Defined in: [packages/rxdb/src/system/migration.ts:335](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L335)

Determines whether the library has already stopped at the current watermark; both numbers must be equal.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`RxDBSystemVersionState`](../interfaces/RxDBSystemVersionState.md) | The result of [getRxDBSystemVersionState](getRxDBSystemVersionState.md) |

## Returns

`boolean`

`true` when both numbers equal this process's constants

## Remarks

The single gate of each adapter's `migrateSystemSchema()`: `true` returns directly, `false` runs that whole block of **idempotent** repair.
Because it is idempotent, one stopped at 4, one stopped at 5, and a brand-new `0` share the same path — adapters do not need to branch per version
(see the notes on watermark 6 in [RXDB\_SYSTEM\_SCHEMA\_VERSION](../variables/RXDB_SYSTEM_SCHEMA_VERSION.md)).

Uses **equality** rather than `>=`: when the library is newer than the process, returning `false` here would push it into the migration path,
while that DDL only knows how to catch up to the current watermark. That case is blocked earlier by [assertSupportedRxDBSystemVersions](assertSupportedRxDBSystemVersions.md);
the two must be called in pairs.
