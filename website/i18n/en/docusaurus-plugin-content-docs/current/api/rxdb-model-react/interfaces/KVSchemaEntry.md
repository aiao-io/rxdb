# KVSchemaEntry

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:69

Property description of a single key in keyValue mode

## Properties

### label? \{#label\}

```ts
label?: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:71

Display label (defaults to the key name)

***

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:77

Whether the value can be null

***

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:75

Whether the key is required

***

### type? \{#type\}

```ts
type?: "string" | "number" | "boolean" | "date" | "integer";
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:73

Value type (used for input validation)
