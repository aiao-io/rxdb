# OperatorDefinition

Defined in: packages/rxdb-model/dist/query-builder/models/operator.interface.d.ts:7

Operator definition
Contains the operator's metadata and constraints

## Properties

### applicableTypes \{#applicabletypes\}

```ts
applicableTypes: PropertyType[];
```

Defined in: packages/rxdb-model/dist/query-builder/models/operator.interface.d.ts:30

Field types the operator applies to

---

### key \{#key\}

```ts
key: OperatorName;
```

Defined in: packages/rxdb-model/dist/query-builder/models/operator.interface.d.ts:11

Operator key (uses RxDB's OperatorName)

---

### label \{#label\}

```ts
label: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/operator.interface.d.ts:15

Display label (supports internationalization)

---

### labelKey? \{#labelkey\}

```ts
labelKey?: string;
```

Defined in: packages/rxdb-model/dist/query-builder/models/operator.interface.d.ts:17

Key in the built-in label catalog; a custom label always takes precedence.

---

### valueType \{#valuetype\}

```ts
valueType: 'array' | 'single' | 'range' | 'none' | 'subquery';
```

Defined in: packages/rxdb-model/dist/query-builder/models/operator.interface.d.ts:26

Value type

- single: a single value (e.g. "=")
- array: an array of values (e.g. "in")
- range: a range value [min, max] (e.g. "between")
- none: no value needed (e.g. "null")
- subquery: a subquery condition (e.g. "exists" - an optional nested rule group)
