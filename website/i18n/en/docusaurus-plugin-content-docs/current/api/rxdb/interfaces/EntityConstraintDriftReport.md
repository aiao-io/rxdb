# EntityConstraintDriftReport

Defined in: [packages/rxdb/src/system/constraint-drift.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L28)

Drift comparison input for one entity table.

## Properties

### actual \{#actual\}

```ts
actual: readonly string[];
```

Defined in: [packages/rxdb/src/system/constraint-drift.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L38)

Actual constraint names in the database (already filtered to the comparison scope by the adapter)

***

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/system/constraint-drift.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L30)

Entity name (the `name` in the metadata)

***

### expected \{#expected\}

```ts
expected: readonly string[];
```

Defined in: [packages/rxdb/src/system/constraint-drift.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L36)

Constraint names deterministically generated from the metadata (`ck_` / `uq_` / `ex_`, assembled by the adapter in this dialect's object shape)

***

### tableMissing \{#tablemissing\}

```ts
tableMissing: boolean;
```

Defined in: [packages/rxdb/src/system/constraint-drift.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L34)

The table itself does not exist in the catalog (missing table). Reported separately from "table exists but constraints differ" (fail-fast).

***

### tableName \{#tablename\}

```ts
tableName: string;
```

Defined in: [packages/rxdb/src/system/constraint-drift.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/constraint-drift.ts#L32)

Table name (the `tableName` in the metadata)
