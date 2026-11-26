# ordersWritesForExclusion()

```ts
function ordersWritesForExclusion(metadata): boolean;
```

Defined in: [packages/rxdb/src/system/exclusion-write-order.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-write-order.ts#L32)

Whether the entity's writes are ordered as "delete → update → insert" (which is the case once an exclusion range is declared).

## Parameters

| Parameter  | Type                                                  | Description         |
| ---------- | ----------------------------------------------------- | ------------------- |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The entity metadata |

## Returns

`boolean`
