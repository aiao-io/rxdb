# SchemaParser

Defined in: packages/rxdb-model/dist/query-builder/services/schema-parser.service.d.ts:42

Schema parsing service
Converts RxDB EntityMetadata into field metadata usable by QueryBuilder

## Constructors

### Constructor

```ts
new SchemaParser(options?): SchemaParser;
```

Defined in: packages/rxdb-model/dist/query-builder/services/schema-parser.service.d.ts:46

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`SchemaParserOptions`](../interfaces/SchemaParserOptions.md) | Parser configuration (includes a recursion cache for resolving relationship target fields) |

#### Returns

`SchemaParser`

## Methods

### parse() \{#parse\}

```ts
parse(metadata): FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/services/schema-parser.service.d.ts:60

Parses field metadata from EntityMetadata

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | RxDB entity metadata |

#### Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

Array of field metadata

#### Example

```typescript
const parser = new SchemaParser();
const fields = parser.parse(userMetadata);
// [{ name: 'id', displayName: 'ID', type: 'string' }, ...]
```

***

### parseMany() \{#parsemany\}

```ts
parseMany(metadataMap): Map<string, FieldMetadata[]>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/schema-parser.service.d.ts:67

Batch-parses multiple EntityMetadata

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadataMap` | `Map`&lt;`string`, `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;&gt; | Map of entity name to metadata |

#### Returns

`Map`&lt;`string`, [`FieldMetadata`](../interfaces/FieldMetadata.md)[]&gt;

Map of entity name to array of fields
