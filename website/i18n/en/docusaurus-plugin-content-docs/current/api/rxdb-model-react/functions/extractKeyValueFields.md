# extractKeyValueFields()

```ts
function extractKeyValueFields(properties): FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:129

Extracts the list of sub-fields from the properties of a keyValue property

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `properties` | [`KeyValuePropertyMetadata`](../../rxdb/type-aliases/KeyValuePropertyMetadata.md)[] | List of sub-property metadata of the keyValue property |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

List of sub-field metadata
