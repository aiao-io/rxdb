# mapPropertyType()

```ts
function mapPropertyType(type): PropertyType;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/metadata-field-extractor.d.ts:51

Maps PropertyType to the type of FieldMetadata

## Parameters

| Parameter | Type                                                      | Description        |
| --------- | --------------------------------------------------------- | ------------------ |
| `type`    | [`PropertyType`](../../rxdb/enumerations/PropertyType.md) | RxDB property type |

## Returns

[`PropertyType`](../type-aliases/PropertyType.md)

QueryBuilder property type

## Example

```typescript
mapPropertyType(PropertyType.string); // 'string'
mapPropertyType(PropertyType.number); // 'number'
mapPropertyType(PropertyType.boolean); // 'boolean'
```
