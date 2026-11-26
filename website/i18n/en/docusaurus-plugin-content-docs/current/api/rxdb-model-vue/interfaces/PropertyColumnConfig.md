# PropertyColumnConfig

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:22

Configuration needed to build a property column

## Properties

### enumItems? \{#enumitems\}

```ts
enumItems?: readonly EnumItem[];
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:36

Complete definition of the enum items (used when type=enum; supports internationalized text and icon icons; takes precedence over enumValues)

---

### enumValues? \{#enumvalues\}

```ts
enumValues?: readonly string[];
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:34

List of enum values (used when type=enum; the short form without icons/i18n)

---

### field \{#field\}

```ts
field: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:26

Field name (the key in the record)

---

### format? \{#format\}

```ts
format?: FieldFormat;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:48

Semantic annotation of the field (determines the display form and editor choice; does not change the runtime value type)

---

### i18n? \{#i18n\}

```ts
i18n?: ModelI18n;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:24

Component translation and formatting runtime.

---

### keyValueSchema? \{#keyvalueschema\}

```ts
keyValueSchema?: Record<string, KVSchemaEntry>;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:44

Schema of keyValue properties — defines the allowed keys and their value types

---

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:38

Whether null is allowed (used when type=enum)

---

### options? \{#options\}

```ts
options?: Readonly<Record<string, FieldOptionDisplay>>;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:52

Display metadata for enum / multi-select values (label / color / disabled); the keys are a subset of `enum`

---

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:32

Property-level read-only: no editor is attached to the whole column (the boolean column's toggle is disabled); keyboard toggling, clipboard paste, and Delete clearing are also refused

---

### relatedItems? \{#relateditems\}

```ts
relatedItems?: RelatedEntityItem[];
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:59

List of related entity candidates (used by oneToOne / manyToOne types)

Each item contains `id` (the foreign key value) and `displayName` (the text shown in the cell).
Pass a new list when the column updates to refresh the editor options.

---

### relatedItemsProvider? \{#relateditemsprovider\}

```ts
relatedItemsProvider?: () => RelatedEntityItem[];
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:66

Dynamic provider of related entity candidates (takes precedence over relatedItems)

Called every time a cell renders or an editor opens; it can return the latest candidate list.
Suitable for scenarios where the business layer needs to query related entities dynamically at runtime.

#### Returns

[`RelatedEntityItem`](RelatedEntityItem.md)[]

---

### sort? \{#sort\}

```ts
sort?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:42

Whether to enable ordering

---

### title? \{#title\}

```ts
title?: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:28

Column title (defaults to field)

---

### type \{#type\}

```ts
type: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:30

Property type

---

### width? \{#width\}

```ts
width?: number | "auto";
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:40

Column width (defaults to 'auto'; the uuid type defaults to 320)
