# mapPropertyType()

```ts
function mapPropertyType(type): PropertyType;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:51

Maps PropertyType to the FieldMetadata type

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | [`PropertyType`](../../rxdb/enumerations/PropertyType.md) | The RxDB property type |

## Returns

[`PropertyType`](../type-aliases/PropertyType.md)

The QueryBuilder property type

## Example

```typescript
mapPropertyType(PropertyType.string) // 'string'
mapPropertyType(PropertyType.number) // 'number'
mapPropertyType(PropertyType.boolean) // 'boolean'
```
