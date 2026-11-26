# referencedCheckFields()

```ts
function referencedCheckFields(check): readonly string[];
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:477](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L477)

Collects all fields referenced by the rule tree (including `ref` targets), deduplicated in declaration order.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `check` | [`EntityCheckMetadataOptions`](../interfaces/EntityCheckMetadataOptions.md) |

## Returns

readonly `string`[]
