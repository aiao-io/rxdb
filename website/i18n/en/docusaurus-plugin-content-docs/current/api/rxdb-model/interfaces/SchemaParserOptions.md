# SchemaParserOptions

Defined in: [packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/schema-parser.service.ts#L31)

The parser configuration options.

## Properties

### displayNameGenerator? \{#displaynamegenerator\}

```ts
displayNameGenerator?: (fieldName, metadata?) => string;
```

Defined in: [packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/schema-parser.service.ts#L64)

A custom display name generator

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fieldName` | `string` |
| `metadata?` | \{ `displayName?`: `string`; \} |
| `metadata.displayName?` | `string` |

#### Returns

`string`

***

### entityMetadataMap? \{#entitymetadatamap\}

```ts
entityMetadataMap?: Map<string, Readonly<EntityMetadataType>>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/schema-parser.service.ts#L54)

The entity metadata map (used to resolve the target entity's fields for relation fields).
Keys are entity names, values are entity metadata.

***

### fieldFilter? \{#fieldfilter\}

```ts
fieldFilter?: (field) => boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/schema-parser.service.ts#L59)

A custom field filter

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | [`FieldMetadata`](FieldMetadata.md) |

#### Returns

`boolean`

***

### includeComputedProperties? \{#includecomputedproperties\}

```ts
includeComputedProperties?: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/schema-parser.service.ts#L42)

Whether computed properties are included

#### Default

```ts
false
```

***

### includeForeignKeys? \{#includeforeignkeys\}

```ts
includeForeignKeys?: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/schema-parser.service.ts#L36)

Whether foreign key fields are included

#### Default

```ts
false
```

***

### includeRelations? \{#includerelations\}

```ts
includeRelations?: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/services/schema-parser.service.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/schema-parser.service.ts#L48)

Whether relation fields are included (used for the EXISTS operator)

#### Default

```ts
false
```
