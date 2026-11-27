# mapPropertyType()

```ts
function mapPropertyType(type): PropertyType;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/metadata-field-extractor.ts#L67)

Maps a PropertyType to the `type` of FieldMetadata.

## Parameters

| Parameter | Type                                                      | Description            |
| --------- | --------------------------------------------------------- | ---------------------- |
| `type`    | [`PropertyType`](../../rxdb/enumerations/PropertyType.md) | The RxDB property type |

## Returns

[`PropertyType`](../type-aliases/PropertyType.md)

The QueryBuilder property type

## Example

```typescript
mapPropertyType(PropertyType.string); // 'string'
mapPropertyType(PropertyType.number); // 'number'
mapPropertyType(PropertyType.boolean); // 'boolean'
```
