# EntityPropertyMetadata

```ts
type EntityPropertyMetadata =
  | SetRequired<UUIDProperty, 'columnName'>
  | SetRequired<StringProperty, 'columnName'>
  | SetRequired<EnumProperty, 'columnName'>
  | SetRequired<NumberProperty, 'columnName'>
  | SetRequired<IntegerProperty, 'columnName'>
  | SetRequired<BigIntProperty, 'columnName'>
  | SetRequired<BinaryProperty, 'columnName'>
  | SetRequired<DateProperty, 'columnName'>
  | SetRequired<BooleanProperty, 'columnName'>
  | SetRequired<StringArrayProperty, 'columnName'>
  | SetRequired<NumberArrayProperty, 'columnName'>
  | SetRequired<JSONProperty, 'columnName'>
  | SetRequired<KeyValueProperty, 'columnName'>;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:494](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L494)

Union type of field metadata after normalization

## Remarks

This and [EntityPropertyMetadataOptions](EntityPropertyMetadataOptions.md) are the **before/after states** of the same set of
shapes: users declare the Options state, and `transitionMetadata()` produces this type, the only difference being
`columnName` going from optional to required (defaulting to `name` when omitted). Splitting into two types spares all
metadata-consuming code from guarding against the empty case at every column-name lookup.

Therefore any side that consumes metadata should ask for this type, not Options — receiving Options means the
upstream forgot `transitionMetadata()`.
