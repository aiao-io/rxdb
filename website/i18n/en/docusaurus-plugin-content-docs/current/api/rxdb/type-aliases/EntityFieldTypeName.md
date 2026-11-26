# EntityFieldTypeName

```ts
type EntityFieldTypeName = `${PropertyType}` | "oneToOne" | "manyToOne" | "computed";
```

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L41)

The string-literal view of [EntityFieldType](EntityFieldType.md).

## Remarks

`PropertyType` is a string enum, so using [EntityFieldType](EntityFieldType.md) directly as a parameter type rejects
literals like `'date'` and forces every caller to import the enum — an unnecessary breaking change for a public
utility. The template-literal type extracts the enum's string-value set, accepting both enum members and equivalent
literals while still rejecting any string outside the enum.
