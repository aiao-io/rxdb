# createSchemaFromEntity()

```ts
function createSchemaFromEntity(metadata, options?): FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/schema-factory.d.ts:34

Creates field metadata from EntityMetadata

This is a convenience factory function that wraps the creation and parsing of a SchemaParser

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | RxDB entity metadata |
| `options?` | [`SchemaParserOptions`](../interfaces/SchemaParserOptions.md) | Parser options |

## Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

The array of field metadata

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
