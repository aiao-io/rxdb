# isConditionalUniqueIndex()

```ts
function isConditionalUniqueIndex(index): boolean;
```

Defined in: [packages/rxdb/src/entity/conditional-unique-index.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/conditional-unique-index.ts#L40)

Whether the index is a conditional unique index (one that declares `where`).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `index` | [`EntityIndexMetadataOptions`](../interfaces/EntityIndexMetadataOptions.md) |

## Returns

`boolean`
