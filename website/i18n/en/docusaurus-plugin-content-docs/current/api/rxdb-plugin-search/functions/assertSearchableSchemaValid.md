# assertSearchableSchemaValid()

```ts
function assertSearchableSchemaValid(metadatas): void;
```

Defined in: [packages/rxdb-plugin-search/src/core/schema-validator.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/schema-validator.ts#L79)

Aggregated validation: throws when any field is invalid, otherwise passes silently.

The error message lists all invalid entries so developers don't need multiple rounds of fixes.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `metadatas` | readonly `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;[] |

## Returns

`void`

## Throws

When an invalid `searchable` declaration exists
