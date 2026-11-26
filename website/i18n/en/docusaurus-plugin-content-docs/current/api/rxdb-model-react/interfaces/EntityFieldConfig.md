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
This key is only output when the metadata declares `encrypted: true`

---

### enumValues? \{#enumvalues\}

```ts
enumValues?: readonly string[];
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:40

Allowed values of the enum type

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

Field semantic annotation (only affects display and control selection, does not change the runtime value type)
This key is only output when the metadata declares `format`

---

### keyValueSchema? \{#keyvalueschema\}

```ts
keyValueSchema?: Record<string, KeyValueSchemaEntry>;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:42

Schema of a key-value typed field

---

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:34

Whether the value can be null

---

### options? \{#options\}

```ts
options?: Readonly<Record<string, FieldOptionDisplay>>;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:56

Display metadata (label / color / disabled) for enum/multi-select values; the keys are a subset of `enum`
This key is only output when the metadata declares `options`

---

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:32

Whether the field is read-only

---

### relatedEntityName? \{#relatedentityname\}

```ts
relatedEntityName?: string;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:44

Name of the entity a relation field points to

---

### relatedNamespace? \{#relatednamespace\}

```ts
relatedNamespace?: string;
```

Defined in: packages/rxdb-model/dist/entity-field.utils.d.ts:46

Namespace of the entity a relation field points to

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
