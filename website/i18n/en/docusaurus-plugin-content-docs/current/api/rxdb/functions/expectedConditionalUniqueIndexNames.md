# expectedConditionalUniqueIndexNames()

```ts
function expectedConditionalUniqueIndexNames(metadata): string[];
```

Defined in: [packages/rxdb/src/system/constraint-drift.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L46)

All conditional unique index names deterministically generated from the metadata (`uq_`, phase B).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |

## Returns

`string`[]
