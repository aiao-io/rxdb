# FormFieldConfig

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L16)

Form field configuration

## Properties

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L20)

Display name

---

### encrypted? \{#encrypted\}

```ts
encrypted?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L44)

Whether it is an encrypted column

---

### enumValues? \{#enumvalues\}

```ts
enumValues?: readonly string[];
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L32)

Allowed values of the enum type

---

### field \{#field\}

```ts
field: string;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L18)

Field name

---

### format? \{#format\}

```ts
format?: FieldFormat;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L40)

Field semantic annotation (affects only display and control selection, not the runtime value type)

---

### helpText? \{#helptext\}

```ts
helpText?: string;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L52)

Help text

---

### hidden? \{#hidden\}

```ts
hidden?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L46)

Whether it is hidden

---

### keyValueSchema? \{#keyvalueschema\}

```ts
keyValueSchema?: Record<string, KeyValueSchemaEntry>;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L34)

Schema for key-value type fields

---

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L26)

Whether it can be null

---

### options? \{#options\}

```ts
options?: Readonly<Record<string, FieldOptionDisplay>>;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L42)

Display metadata for enum/multi-select values (label / color / disabled)

---

### order? \{#order\}

```ts
order?: number;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L48)

Ordering weight

---

### placeholder? \{#placeholder\}

```ts
placeholder?: string;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L50)

Placeholder

---

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L24)

Whether it is read-only

---

### relatedEntityName? \{#relatedentityname\}

```ts
relatedEntityName?: string;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L36)

Name of the entity the relation field refers to

---

### relatedNamespace? \{#relatednamespace\}

```ts
relatedNamespace?: string;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L38)

Namespace of the entity the relation field refers to

---

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L28)

Whether it is required

---

### span? \{#span\}

```ts
span?: 1 | 2;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L54)

Number of grid columns it spans (1 or 2)

---

### type \{#type\}

```ts
type: EntityFieldType;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L22)

Field type

---

### unique? \{#unique\}

```ts
unique?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-form/interfaces.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/interfaces.ts#L30)

Whether it is unique
