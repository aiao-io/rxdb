# CompiledConditionalUniqueIndex

Defined in: [packages/rxdb/src/entity/conditional-unique-index.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/conditional-unique-index.ts#L28)

The compiled conditional unique index: name, columns, and the where predicate, shared by the index DDL of both backends and the drift comparison.

## Properties

### columns \{#columns\}

```ts
columns: readonly string[];
```

Defined in: [packages/rxdb/src/entity/conditional-unique-index.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/conditional-unique-index.ts#L32)

The physical column names of the index columns (in declaration order).

---

### name \{#name\}

```ts
name: string;
```

Defined in: [packages/rxdb/src/entity/conditional-unique-index.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/conditional-unique-index.ts#L30)

The deterministic index name (starting with `uq_`, containing the definition hash).

---

### normalized \{#normalized\}

```ts
normalized: boolean;
```

Defined in: [packages/rxdb/src/entity/conditional-unique-index.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/conditional-unique-index.ts#L34)

Whether the columns take part in the comparison by the `normalized` measure (`lower(COALESCE(CAST(column AS TEXT), ''))`).

---

### where \{#where\}

```ts
where: string;
```

Defined in: [packages/rxdb/src/entity/conditional-unique-index.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/conditional-unique-index.ts#L36)

A where predicate built only from literals (can be embedded directly into `WHERE ...`).
