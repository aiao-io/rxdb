# OperatorDefinition

Defined in: [packages/rxdb-model/src/query-builder/models/operator.interface.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/operator.interface.ts#L9)

An operator definition.
Contains the operator's metadata and constraints.

## Properties

### applicableTypes \{#applicabletypes\}

```ts
applicableTypes: PropertyType[];
```

Defined in: [packages/rxdb-model/src/query-builder/models/operator.interface.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/operator.interface.ts#L36)

The applicable field types

---

### key \{#key\}

```ts
key: OperatorName;
```

Defined in: [packages/rxdb-model/src/query-builder/models/operator.interface.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/operator.interface.ts#L13)

The operator key (using RxDB's OperatorName)

---

### label \{#label\}

```ts
label: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/operator.interface.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/operator.interface.ts#L18)

The display label (supports internationalization)

---

### labelKey? \{#labelkey\}

```ts
labelKey?: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/operator.interface.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/operator.interface.ts#L21)

Key in the built-in label catalog; a custom label keeps priority.

---

### valueType \{#valuetype\}

```ts
valueType: 'array' | 'single' | 'range' | 'none' | 'subquery';
```

Defined in: [packages/rxdb-model/src/query-builder/models/operator.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/operator.interface.ts#L31)

The value type

- single: a single value (e.g. "=")
- array: an array of values (e.g. "in")
- range: a range value [min, max] (e.g. "between")
- none: no value needed (e.g. "null")
- subquery: a subquery condition (e.g. "exists" - an optional nested rule group)
