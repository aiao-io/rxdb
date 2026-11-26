# SchemaParser

Defined in: [packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/schema-parser.service.ts#L102)

Schema parsing service
Converts RxDB EntityMetadata into field metadata usable by QueryBuilder

## Constructors

### Constructor

```ts
new SchemaParser(options?): SchemaParser;
```

Defined in: [packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/schema-parser.service.ts#L110)

#### Parameters

| Parameter  | Type                                                          | Description                                                                     |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `options?` | [`SchemaParserOptions`](../interfaces/SchemaParserOptions.md) | Parser config (includes the recursive parsing cache for relation target fields) |

#### Returns

`SchemaParser`

## Methods

### parse() \{#parse\}

```ts
parse(metadata): FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/schema-parser.service.ts#L134)

Parses field metadata from EntityMetadata

#### Parameters

| Parameter  | Type                                                          | Description          |
| ---------- | ------------------------------------------------------------- | -------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | RxDB entity metadata |

#### Returns

[`FieldMetadata`](../interfaces/FieldMetadata.md)[]

Field metadata array

#### Example

```typescript
const parser = new SchemaParser();
const fields = parser.parse(userMetadata);
// [{ name: 'id', displayName: 'ID', type: 'string' }, ...]
```

---

### parseMany() \{#parsemany\}

```ts
parseMany(metadataMap): Map<string, FieldMetadata[]>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:196](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/schema-parser.service.ts#L196)

Parses in bulk from multiple EntityMetadata

#### Parameters

| Parameter     | Type                                                                                                         | Description                         |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `metadataMap` | `Map`&lt;`string`, `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;&gt; | Mapping of entity names to metadata |

#### Returns

`Map`&lt;`string`, [`FieldMetadata`](../interfaces/FieldMetadata.md)[]&gt;

Mapping of entity names to field arrays
