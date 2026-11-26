# PropertyColumnConfig

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:22

Configuration required to build a property column

## Properties

### enumItems? \{#enumitems\}

```ts
enumItems?: readonly EnumItem[];
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:36

Full definition of the enum items (used when type=enum; supports text internationalization and icons; takes precedence over enumValues)

***

### enumValues? \{#enumvalues\}

```ts
enumValues?: readonly string[];
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:34

Enum value list (used when type=enum; the short form without icons/i18n)

***

### field \{#field\}

```ts
field: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:26

Field name (the key in the record)

***

### format? \{#format\}

```ts
format?: FieldFormat;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:48

Semantic annotation of the field (determines the display form and editor selection, not the runtime value type)

***

### i18n? \{#i18n\}

```ts
i18n?: ModelI18n;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:24

Component translation and formatting runtime.

***

### keyValueSchema? \{#keyvalueschema\}

```ts
keyValueSchema?: Record<string, KVSchemaEntry>;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:44

keyValue property schema — defines the allowed keys and their value types

***

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:38

Whether null is allowed (used when type=enum)

***

### options? \{#options\}

```ts
options?: Readonly<Record<string, FieldOptionDisplay>>;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:52

Display metadata for enum/multi-select values (label / color / disabled); the keys are a subset of `enum`

***

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:32

Property-level readonly: no editor is attached to the whole column (the switch is disabled for boolean columns); keyboard toggles, clipboard pastes and Delete clearing are also rejected

***

### relatedItems? \{#relateditems\}

```ts
relatedItems?: RelatedEntityItem[];
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:59

Candidate list of related entities (used for oneToOne / manyToOne types)

Each item contains `id` (the foreign key value) and `displayName` (the cell display text).
Pass a new list when the column updates to refresh the editor options.

***

### relatedItemsProvider? \{#relateditemsprovider\}

```ts
relatedItemsProvider?: () => RelatedEntityItem[];
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:66

Dynamic provider of related entity candidates (takes precedence over relatedItems)

Called on every cell render or editor open; can return the latest candidate list.
Suitable for scenarios where the business layer needs to query related entities dynamically at runtime.

#### Returns

[`RelatedEntityItem`](RelatedEntityItem.md)[]

***

### sort? \{#sort\}

```ts
sort?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:42

Whether ordering is enabled

***

### title? \{#title\}

```ts
title?: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:28

Column title (defaults to field)

***

### type \{#type\}

```ts
type: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:30

Property type

***

### width? \{#width\}

```ts
width?: number | "auto";
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:40

Column width (default 'auto'; uuid type defaults to 320)
