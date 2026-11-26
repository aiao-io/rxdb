# FieldMetadata

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:112

Field metadata

## Properties

### description? \{#description\}

```ts
description?: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:128

Field description

---

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:120

Display name

---

### enum? \{#enum\}

```ts
enum?: unknown[];
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:140

Enum values (if applicable)

---

### isRelation? \{#isrelation\}

```ts
isRelation?: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:148

Whether this is a relation field

---

### keyValueFields? \{#keyvaluefields\}

```ts
keyValueFields?: FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:164

List of keyValue sub-property fields (used for nested property queries)

---

### name \{#name\}

```ts
name: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:116

Field name

---

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:136

Whether the field is nullable

---

### pattern? \{#pattern\}

```ts
pattern?: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:144

Regular expression validation (string type)

---

### relationFields? \{#relationfields\}

```ts
relationFields?: FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:160

List of fields of the relation target entity (used for EXISTS subqueries)

---

### relationKind? \{#relationkind\}

```ts
relationKind?: "1:1" | "1:m" | "m:1" | "m:n";
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:156

Relation type (1:1, 1:m, m:1, m:n)

---

### relationTarget? \{#relationtarget\}

```ts
relationTarget?: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:152

Name of the relation target entity

---

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:132

Whether the field is required

---

### type \{#type\}

```ts
type: PropertyType;
```

Defined in: packages/rxdb-model/dist/query-builder/models/query-builder-state.d.ts:124

Field type
