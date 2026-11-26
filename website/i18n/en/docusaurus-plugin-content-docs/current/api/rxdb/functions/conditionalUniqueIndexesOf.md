# conditionalUniqueIndexesOf()

```ts
function conditionalUniqueIndexesOf(metadata): EntityIndexMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/conditional-unique-index.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/conditional-unique-index.ts#L43)

All conditional unique indexes of the entity (reads `indexMap`: the full set after inheritance merging).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |

## Returns

[`EntityIndexMetadataOptions`](../interfaces/EntityIndexMetadataOptions.md)[]
