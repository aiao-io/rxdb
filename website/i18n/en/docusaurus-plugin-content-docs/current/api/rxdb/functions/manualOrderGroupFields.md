# manualOrderGroupFields()

```ts
function manualOrderGroupFields(metadata): readonly string[];
```

Defined in: [packages/rxdb/src/sortable/sortable.utils.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.utils.ts#L60)

The grouping fields of a manually ordered entity.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | `Pick`&lt;[`EntityMetadata`](../type-aliases/EntityMetadata.md), `"manualOrder"`&gt; | The entity metadata |

## Returns

readonly `string`[]

The grouping fields in declaration order; an empty array when `manualOrder: true` (a single sequence for the whole table) or when it is not enabled
