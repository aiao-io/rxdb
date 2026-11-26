# createSchemaFromEntity()

```ts
function createSchemaFromEntity(metadata, options?): FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/schema-factory.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/schema-factory.ts#L40)

Creates field metadata from EntityMetadata

This is a convenience factory function that wraps the creation and parsing of a SchemaParser

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | RxDB entity metadata |
| `options?` | [`SchemaParserOptions`](../interfaces/SchemaParserOptions.md) | Parser options |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

Field metadata array

## Example

```typescript
// Basic usage
const fields = createSchemaFromEntity(userMetadata);

// Include foreign keys
const fieldsWithFK = createSchemaFromEntity(userMetadata, {
  includeForeignKeys: true
});

// Include computed properties
const fieldsWithComputed = createSchemaFromEntity(userMetadata, {
  includeComputedProperties: true
});

// Custom filter
const onlyStringFields = createSchemaFromEntity(userMetadata, {
  fieldFilter: (field) => field.type === 'string'
});
```
