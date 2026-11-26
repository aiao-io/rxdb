# KeyValuePropertyMetadata

```ts
type KeyValuePropertyMetadata = 
  | Pick<StringProperty, support_keys>
  | Pick<NumberProperty, support_keys>
  | Pick<IntegerProperty, support_keys>
  | Pick<DateProperty, support_keys>
  | Pick<BooleanProperty, support_keys>;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:457](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L457)

keyValue property metadata union type
Nested properties of keyValue do not need columnName; name is used directly as the key
