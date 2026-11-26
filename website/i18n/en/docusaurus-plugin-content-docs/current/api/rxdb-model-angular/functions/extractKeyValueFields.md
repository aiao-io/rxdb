# extractKeyValueFields()

```ts
function extractKeyValueFields(properties): FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:129

Extracts the sub-field list from the properties of a keyValue property

## Parameters

| Parameter    | Type                                                                                | Description                                                 |
| ------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `properties` | [`KeyValuePropertyMetadata`](../../rxdb/type-aliases/KeyValuePropertyMetadata.md)[] | The metadata list of the keyValue property's sub-properties |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

List of sub-field metadata
