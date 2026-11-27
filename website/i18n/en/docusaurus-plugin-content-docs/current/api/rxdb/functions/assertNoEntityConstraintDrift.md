# assertNoEntityConstraintDrift()

```ts
function assertNoEntityConstraintDrift(report): void;
```

Defined in: [packages/rxdb/src/system/constraint-drift.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L97)

Asserts that an entity table has no constraint drift.

## Parameters

| Parameter | Type                                                                          | Description                                                                                           |
| --------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `report`  | [`EntityConstraintDriftReport`](../interfaces/EntityConstraintDriftReport.md) | The comparison input, see [EntityConstraintDriftReport](../interfaces/EntityConstraintDriftReport.md) |

## Returns

`void`

## Throws

[RxDBConstraintDriftError](../classes/RxDBConstraintDriftError.md) when the table is missing, or when there are missing / extra constraint names

## Remarks

Read-only judgment, no automatic rebuilding: rebuilding is written by the user into `migrations`, which happen to run right before the drift check.
A missing table is likewise fail-fast — the drift check's contract is "the table should exist" (the missing-table rebuild runs before it);
silently skipping would turn this connect into a half-finished state with different semantics on the two sides.
