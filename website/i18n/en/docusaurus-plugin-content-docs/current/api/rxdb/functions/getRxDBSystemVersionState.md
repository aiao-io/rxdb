# getRxDBSystemVersionState()

```ts
function getRxDBSystemVersionState(migrationNames): RxDBSystemVersionState;
```

Defined in: [packages/rxdb/src/system/migration.ts:284](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L284)

Extracts the two version numbers from a set of migration names.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `migrationNames` | `Iterable`&lt;`string`&gt; | The `name` column of the whole `rxdb_migration` table, order-independent |

## Returns

[`RxDBSystemVersionState`](../interfaces/RxDBSystemVersionState.md)

The maximum of each number; `0` when there is no corresponding watermark row

## Throws

[UnsupportedRxDBSystemVersionError](../classes/UnsupportedRxDBSystemVersionError.md) when the version segment of any watermark row is malformed

## Remarks

Takes `max` rather than the "last row": watermark rows accumulate across migrations — in a database migrated up to 6, the `__rxdb_system_schema__:4` row is still there (migration records are never deleted; deleting them would discard the execution history), and the read order of the migration table is not guaranteed.

The user's own migration names are always skipped (no prefix match yields `undefined`), so they are never misjudged as watermarks.
