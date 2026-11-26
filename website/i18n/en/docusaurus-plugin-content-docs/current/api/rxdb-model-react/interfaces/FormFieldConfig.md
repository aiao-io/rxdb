# FormFieldConfig

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:10

Form field configuration

## Properties

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:14

Display name

---

### encrypted? \{#encrypted\}

```ts
encrypted?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:38

Whether this is an encrypted column

---

### enumValues? \{#enumvalues\}

```ts
enumValues?: readonly string[];
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:26

Allowed values of the enum type

---

### field \{#field\}

```ts
field: string;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:12

Field name

---

### format? \{#format\}

```ts
format?: FieldFormat;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:34

Field semantic annotation (only affects display and control selection, does not change the runtime value type)

---

### helpText? \{#helptext\}

```ts
helpText?: string;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:46

Help text

---

### hidden? \{#hidden\}

```ts
hidden?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:40

Whether it is hidden

---

### keyValueSchema? \{#keyvalueschema\}

```ts
keyValueSchema?: Record<string, KeyValueSchemaEntry>;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:28

Schema of a key-value typed field

---

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:20

Whether the value can be null

---

### options? \{#options\}

```ts
options?: Readonly<Record<string, FieldOptionDisplay>>;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:36

Display metadata (label / color / disabled) for enum/multi-select values

---

### order? \{#order\}

```ts
order?: number;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:42

Ordering weight

---

### placeholder? \{#placeholder\}

```ts
placeholder?: string;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:44

Placeholder hint

---

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:18

Whether the field is read-only

---

### relatedEntityName? \{#relatedentityname\}

```ts
relatedEntityName?: string;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:30

Name of the entity a relation field points to

---

### relatedNamespace? \{#relatednamespace\}

```ts
relatedNamespace?: string;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:32

Namespace of the entity a relation field points to

---

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:22

Whether the field is required

---

### span? \{#span\}

```ts
span?: 1 | 2;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:48

Number of grid columns it occupies (1 or 2)

---

### type \{#type\}

```ts
type: EntityFieldType;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:16

Field type

---

### unique? \{#unique\}

```ts
unique?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-form/interfaces.d.ts:24

Whether the field is unique
