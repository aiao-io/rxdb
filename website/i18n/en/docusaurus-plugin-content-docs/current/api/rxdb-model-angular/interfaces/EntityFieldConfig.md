# EntityFieldConfig

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:24

Entity field configuration

## Properties

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:28

Display name

---

### encrypted? \{#encrypted\}

```ts
encrypted?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:61

Whether this is an encrypted column
this key is only emitted when the metadata declares `encrypted: true`

---

### enumValues? \{#enumvalues\}

```ts
enumValues?: readonly string[];
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:40

The allowed values of an enum type

---

### field \{#field\}

```ts
field: string;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:26

Field name

---

### format? \{#format\}

```ts
format?: FieldFormat;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:51

Semantic annotation of the field (only affects display and control selection, not the runtime value type)
this key is only emitted when the metadata declares `format`

---

### keyValueSchema? \{#keyvalueschema\}

```ts
keyValueSchema?: Record<string, KeyValueSchemaEntry>;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:42

Schema of a key-value type field

---

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:34

Whether the field is nullable

---

### options? \{#options\}

```ts
options?: Readonly<Record<string, FieldOptionDisplay>>;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:56

Display metadata for enum/multi-select values (label / color / disabled); the keys are a subset of `enum`
this key is only emitted when the metadata declares `options`

---

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:32

Whether the field is readonly

---

### relatedEntityName? \{#relatedentityname\}

```ts
relatedEntityName?: string;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:44

The name of the entity the relation field points to

---

### relatedNamespace? \{#relatednamespace\}

```ts
relatedNamespace?: string;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:46

The namespace of the entity the relation field points to

---

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:36

Whether the field is required

---

### type \{#type\}

```ts
type: EntityFieldType;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:30

Field type

---

### unique? \{#unique\}

```ts
unique?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:38

Whether the field is unique
