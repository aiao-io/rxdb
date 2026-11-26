# PropertyColumnConfig

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L54)

Configuration required to build a property column

## Properties

### enumItems? \{#enumitems\}

```ts
enumItems?: readonly EnumItem[];
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L68)

Full enum item definitions (used when type=enum; supports text internationalization and icons; takes precedence over enumValues)

---

### enumValues? \{#enumvalues\}

```ts
enumValues?: readonly string[];
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L66)

Enum value list (used when type=enum; the short form without icons/i18n)

---

### field \{#field\}

```ts
field: string;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L58)

Field name (key in the record)

---

### format? \{#format\}

```ts
format?: FieldFormat;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L80)

Field semantic annotation (determines the display form and editor choice; does not change the runtime value type)

---

### i18n? \{#i18n\}

```ts
i18n?: ModelI18n;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L56)

Component translation and formatting runtime.

---

### keyValueSchema? \{#keyvalueschema\}

```ts
keyValueSchema?: Record<string, KVSchemaEntry>;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L76)

keyValue property schema — defines the allowed keys and their value types

---

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L70)

Whether null is allowed (used when type=enum)

---

### options? \{#options\}

```ts
options?: Readonly<Record<string, FieldOptionDisplay>>;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L84)

Display metadata for enum/multi-select values (label / color / disabled); the keys are a subset of `enum`

---

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L64)

Property-level read-only: the whole column gets no editor (boolean columns disable the toggle), and keyboard toggling, clipboard paste, and Delete clearing are also refused

---

### relatedItems? \{#relateditems\}

```ts
relatedItems?: RelatedEntityItem[];
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L91)

Related-entity candidate list (used for oneToOne / manyToOne types)

Each item contains `id` (the foreign key value) and `displayName` (the cell display text).
Pass a new list again when the column updates to refresh the editor options.

---

### relatedItemsProvider? \{#relateditemsprovider\}

```ts
relatedItemsProvider?: () => RelatedEntityItem[];
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L98)

Dynamic provider of related-entity candidates (takes precedence over relatedItems)

Called each time a cell renders or an editor opens and can return the latest candidate list.
Suitable for scenarios where the business layer needs to query related entities dynamically at runtime.

#### Returns

[`RelatedEntityItem`](RelatedEntityItem.md)[]

---

### sort? \{#sort\}

```ts
sort?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L74)

Whether ordering is enabled

---

### title? \{#title\}

```ts
title?: string;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L60)

Column title (defaults to field)

---

### type \{#type\}

```ts
type: string;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L62)

Property type

---

### width? \{#width\}

```ts
width?: number | "auto";
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L72)

Column width (default 'auto'; uuid type defaults to 320)
