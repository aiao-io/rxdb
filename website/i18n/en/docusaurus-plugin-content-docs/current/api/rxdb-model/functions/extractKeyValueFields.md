# extractKeyValueFields()

```ts
function extractKeyValueFields(properties): FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:407](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L407)

Extracts the list of child fields from the `properties` of a keyValue property.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `properties` | [`KeyValuePropertyMetadata`](../../rxdb/type-aliases/KeyValuePropertyMetadata.md)[] | Metadata list of the child properties of a keyValue property |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

The list of child field metadata
