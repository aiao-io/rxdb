# SchemaParserOptions

Defined in: packages/rxdb-model/dist/query-builder/services/schema-parser.service.d.ts:6

Parser configuration options

## Properties

### displayNameGenerator? \{#displaynamegenerator\}

```ts
displayNameGenerator?: (fieldName, metadata?) => string;
```

Defined in: packages/rxdb-model/dist/query-builder/services/schema-parser.service.d.ts:34

Custom display name generator

#### Parameters

| Parameter               | Type                            |
| ----------------------- | ------------------------------- |
| `fieldName`             | `string`                        |
| `metadata?`             | \{ `displayName?`: `string`; \} |
| `metadata.displayName?` | `string`                        |

#### Returns

`string`

---

### entityMetadataMap? \{#entitymetadatamap\}

```ts
entityMetadataMap?: Map<string, Readonly<EntityMetadataType>>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/schema-parser.service.d.ts:26

Entity metadata map (used to resolve the target entity fields of relation fields)
The keys are entity names and the values are entity metadata

---

### fieldFilter? \{#fieldfilter\}

```ts
fieldFilter?: (field) => boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/schema-parser.service.d.ts:30

Custom field filter

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `field`   | [`FieldMetadata`](FieldMetadata.md) |

#### Returns

`boolean`

---

### includeComputedProperties? \{#includecomputedproperties\}

```ts
includeComputedProperties?: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/schema-parser.service.d.ts:16

Whether to include computed properties

#### Default

```ts
false;
```

---

### includeForeignKeys? \{#includeforeignkeys\}

```ts
includeForeignKeys?: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/schema-parser.service.d.ts:11

Whether to include foreign key fields

#### Default

```ts
false;
```

---

### includeRelations? \{#includerelations\}

```ts
includeRelations?: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/schema-parser.service.d.ts:21

Whether to include relation fields (used for the EXISTS operator)

#### Default

```ts
false;
```
