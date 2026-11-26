# assertClaimedCapabilities()

```ts
function assertClaimedCapabilities(migrationNames, claimedCapabilities): void;
```

Defined in: [packages/rxdb/src/system/capability-watermark.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/capability-watermark.ts#L127)

Guard for unclaimed capabilities.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `migrationNames` | readonly `string`[] | All row names in the database's `rxdb_migration` |
| `claimedCapabilities` | `ReadonlySet`&lt;`string`&gt; | Names of capabilities registered in this process |

## Returns

`void`

## Throws

[UnclaimedRxDBCapabilityError](../classes/UnclaimedRxDBCapabilityError.md) When an unclaimed capability exists.

## Remarks

Claiming is judged by **capability name** only; version mismatches belong to the claimer's own fail-closed behavior (a plugin knows better than the core whether it can read an older version's tables). If the core also did version comparison, every plugin version bump would have to wait for the core to let it through.

When multiple version rows exist for the same capability, only the highest one is reported: an upgraded database keeps both v1 and v2 rows, and reporting each row would make the user think two packages are missing.
