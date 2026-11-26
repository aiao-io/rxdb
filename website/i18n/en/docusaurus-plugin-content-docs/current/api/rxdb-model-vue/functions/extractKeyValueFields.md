# extractKeyValueFields()

```ts
function extractKeyValueFields(properties): FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:129

Extracts the child field list from the properties of a keyValue property

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `properties` | [`KeyValuePropertyMetadata`](../../rxdb/type-aliases/KeyValuePropertyMetadata.md)[] | Child property metadata list of the keyValue property |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

List of child field metadata
