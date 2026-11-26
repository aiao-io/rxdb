# ~~Interface: EntityFieldConfig~~

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L57)

## Deprecated

Superseded by [EntityFieldDescriptor](../type-aliases/EntityFieldDescriptor.md). All boolean flags on this interface are optional,
so "not declared" and "declared as false" are indistinguishable, and it has no `encrypted` / `format` / `options` at all.

## Properties

### ~~displayName~~ \{#displayname\}

```ts
displayName: string;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L59)

---

### ~~enumValues?~~ \{#enumvalues\}

```ts
enumValues?: readonly string[];
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L65)

---

### ~~field~~ \{#field\}

```ts
field: string;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L58)

---

### ~~keyValueSchema?~~ \{#keyvalueschema\}

```ts
keyValueSchema?: Record<string, KeyValueSchemaEntry>;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L66)

---

### ~~nullable?~~ \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L62)

---

### ~~readonly?~~ \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L61)

---

### ~~relatedEntityName?~~ \{#relatedentityname\}

```ts
relatedEntityName?: string;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L67)

---

### ~~relatedNamespace?~~ \{#relatednamespace\}

```ts
relatedNamespace?: string;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L68)

---

### ~~required?~~ \{#required\}

```ts
required?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L63)

---

### ~~type~~ \{#type\}

```ts
type: EntityFieldType;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L60)

---

### ~~unique?~~ \{#unique\}

```ts
unique?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L64)
