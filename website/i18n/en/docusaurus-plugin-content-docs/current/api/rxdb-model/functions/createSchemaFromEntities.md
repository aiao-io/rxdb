# createSchemaFromEntities()

```ts
function createSchemaFromEntities(metadataMap, options?): Map<string, FieldMetadata[]>;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/schema-factory.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/schema-factory.ts#L69)

Batch-creates field metadata from multiple EntityMetadata.

## Parameters

| Parameter     | Type                                                                                                         | Description                         |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `metadataMap` | `Map`&lt;`string`, `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;&gt; | A map from entity names to metadata |
| `options?`    | [`SchemaParserOptions`](../interfaces/SchemaParserOptions.md)                                                | The parser options                  |

## Returns

`Map`&lt;`string`, [`FieldMetadata`](../interfaces/FieldMetadata.md)[]&gt;

A map from entity names to field arrays

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

// Use the result
const userFields = schemas.get('User');
const postFields = schemas.get('Post');
```
