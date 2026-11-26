# createSchemaFromEntities()

```ts
function createSchemaFromEntities(metadataMap, options?): Map<string, FieldMetadata[]>;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/schema-factory.d.ts:59

Batch-creates field metadata from multiple EntityMetadata

## Parameters

| Parameter     | Type                                                                                                         | Description                             |
| ------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `metadataMap` | `Map`&lt;`string`, `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;&gt; | A mapping from entity names to metadata |
| `options?`    | [`SchemaParserOptions`](../interfaces/SchemaParserOptions.md)                                                | Parser options                          |

## Returns

`Map`&lt;`string`, [`FieldMetadata`](../interfaces/FieldMetadata.md)[]&gt;

A mapping from entity names to field arrays

## Example

```typescript
const entities = new Map([
  ['User', userMetadata],
  ['Post', postMetadata],
  ['Comment', commentMetadata]
]);

const schemas = createSchemaFromEntities(entities, {
  includeForeignKeys: true
});

// Use the results
const userFields = schemas.get('User');
const postFields = schemas.get('Post');
```
