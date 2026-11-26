# EntityFieldConfig

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L58)

An entity field configuration.

## Properties

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L62)

The display name

---

### encrypted? \{#encrypted\}

```ts
encrypted?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L95)

Whether it is an encrypted column.
This key is only emitted when the metadata declares `encrypted: true`.

---

### enumValues? \{#enumvalues\}

```ts
enumValues?: readonly string[];
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L74)

The allowed values of an enum type

---

### field \{#field\}

```ts
field: string;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L60)

The field name

---

### format? \{#format\}

```ts
format?: FieldFormat;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L85)

The field semantic annotation (only affects display and control selection, not the runtime value type).
This key is only emitted when the metadata declares `format`.

---

### keyValueSchema? \{#keyvalueschema\}

```ts
keyValueSchema?: Record<string, KeyValueSchemaEntry>;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L76)

The schema of a key-value type field

---

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L68)

Whether it can be null

---

### options? \{#options\}

```ts
options?: Readonly<Record<string, FieldOptionDisplay>>;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L90)

Display metadata (label / color / disabled) of enum/multi-select values, keyed by a subset of `enum`.
This key is only emitted when the metadata declares `options`.

---

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L66)

Whether it is read-only

---

### relatedEntityName? \{#relatedentityname\}

```ts
relatedEntityName?: string;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L78)

The name of the entity the relation field points to

---

### relatedNamespace? \{#relatednamespace\}

```ts
relatedNamespace?: string;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L80)

The namespace of the entity the relation field points to

---

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L70)

Whether it is required

---

### type \{#type\}

```ts
type: EntityFieldType;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L64)

The field type

---

### unique? \{#unique\}

```ts
unique?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-field.utils.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-field.utils.ts#L72)

Whether it is unique
