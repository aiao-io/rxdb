# assertMutationsAllowed()

```ts
function assertMutationsAllowed(options): void;
```

Defined in: [packages/rxdb/src/entity/entity-permissions.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-permissions.ts#L154)

Whole-batch precheck for the batch public write entrance.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`RxDBMutationsMap`](../interfaces/RxDBMutationsMap.md) | The argument of `mutations()`; entity classes appearing in any of the three groups take part in the judgment |

## Returns

`void`

## Throws

[PermissionDeniedError](../classes/PermissionDeniedError.md) Any single violation rejects the whole batch; the list enumerates every violation.

## Remarks

It only reads metadata and is synchronous, so the verdict is reached before any write goes out — unrelated to the fact that QueryCache batches write one row at a time and are not themselves atomic. Groups with empty sets do not count: with no rows to write, there are no writes to reject.
