# FieldMetadata

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L126)

Field metadata

## Properties

### description? \{#description\}

```ts
description?: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L145)

Field description

***

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L135)

Display name

***

### enum? \{#enum\}

```ts
enum?: unknown[];
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L160)

Enum values (if applicable)

***

### isRelation? \{#isrelation\}

```ts
isRelation?: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L170)

Whether it is a relation field

***

### keyValueFields? \{#keyvaluefields\}

```ts
keyValueFields?: FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:190](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L190)

List of keyValue sub-property fields (used for nested property queries)

***

### name \{#name\}

```ts
name: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:130](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L130)

Field name

***

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L155)

Whether it can be null

***

### pattern? \{#pattern\}

```ts
pattern?: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L165)

Regular expression validation (string type)

***

### relationFields? \{#relationfields\}

```ts
relationFields?: FieldMetadata[];
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:185](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L185)

Field list of the relation target entity (used for EXISTS subqueries)

***

### relationKind? \{#relationkind\}

```ts
relationKind?: "1:1" | "1:m" | "m:1" | "m:n";
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L180)

Relation type (1:1, 1:m, m:1, m:n)

***

### relationTarget? \{#relationtarget\}

```ts
relationTarget?: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L175)

Name of the relation target entity

***

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L150)

Whether it is required

***

### type \{#type\}

```ts
type: PropertyType;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L140)

Field type
