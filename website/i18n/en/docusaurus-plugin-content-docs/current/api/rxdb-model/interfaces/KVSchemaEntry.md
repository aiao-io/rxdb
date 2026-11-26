# KVSchemaEntry

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L102)

Describes the property of a single key in the keyValue schema.

## Properties

### label? \{#label\}

```ts
label?: string;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L104)

The display label (defaults to the key name)

***

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L110)

Whether null is allowed

***

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L108)

Whether it is required

***

### type? \{#type\}

```ts
type?: "string" | "number" | "boolean" | "date" | "integer";
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L106)

The value type (used for input validation)
