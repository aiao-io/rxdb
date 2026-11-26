# collectInvalidSearchableFields()

```ts
function collectInvalidSearchableFields(metadatas): readonly InvalidSearchableField[];
```

Defined in: [packages/rxdb-plugin-search/src/core/schema-validator.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/schema-validator.ts#L54)

Scans all fields in entity metadata that are explicitly marked `searchable: true` and collects the entries whose types are illegal (not string/enum/stringArray).

## Parameters

| Parameter   | Type                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `metadatas` | readonly `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;[] |

## Returns

readonly [`InvalidSearchableField`](../interfaces/InvalidSearchableField.md)[]

List of invalid fields; an empty array when all are valid.
