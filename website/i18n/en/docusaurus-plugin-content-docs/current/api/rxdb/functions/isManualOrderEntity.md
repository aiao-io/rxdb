# isManualOrderEntity()

```ts
function isManualOrderEntity(metadata): boolean;
```

Defined in: [packages/rxdb/src/sortable/sortable.utils.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.utils.ts#L51)

Whether the entity has manual ordering enabled.

## Parameters

| Parameter  | Type                                                                                 | Description         |
| ---------- | ------------------------------------------------------------------------------------ | ------------------- |
| `metadata` | `Pick`&lt;[`EntityMetadata`](../type-aliases/EntityMetadata.md), `"manualOrder"`&gt; | The entity metadata |

## Returns

`boolean`

`true` when `manualOrder: true` or `manualOrder: { groupBy }` is declared
