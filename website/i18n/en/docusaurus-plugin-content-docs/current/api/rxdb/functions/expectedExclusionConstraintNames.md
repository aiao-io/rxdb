# expectedExclusionConstraintNames()

```ts
function expectedExclusionConstraintNames(metadata): string[];
```

Defined in: [packages/rxdb/src/system/constraint-drift.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L56)

All range exclusion constraint names deterministically generated from the metadata (`ex_`, phase C).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |

## Returns

`string`[]

## Remarks

These are **constraint** names: on PG they are the `EXCLUDE` constraints themselves; on SQLite each constraint becomes two triggers, and the adapter expands them via `exclusionTriggerNames` before comparing.
