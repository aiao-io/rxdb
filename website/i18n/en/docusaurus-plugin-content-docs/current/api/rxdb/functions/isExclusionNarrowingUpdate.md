# isExclusionNarrowingUpdate()

```ts
function isExclusionNarrowingUpdate(metadata, change): boolean;
```

Defined in: [packages/rxdb/src/system/exclusion-write-order.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-write-order.ts#L103)

Whether an update "narrows" with respect to all exclusion ranges of the entity: it touches at least one exclusion column, the equality columns are unchanged,
and every new range dimension falls within the old range (endpoint comparison; an inverted / empty range is still an empty range after narrowing).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The entity metadata |
| `change` | [`ExclusionUpdateChange`](../interfaces/ExclusionUpdateChange.md) | The old and new values of the update (keyed by property name) |

## Returns

`boolean`
