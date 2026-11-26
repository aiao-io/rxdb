# UIRule

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L10)

A UI rule (a loose type, used inside query builder components).

## Description

Since Rule\<T\> is a union type, partial updates are hard to handle in UI components.
This type provides loose field types to make UI component manipulation easier.

## Properties

### field \{#field\}

```ts
field: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L19)

The field name

---

### id \{#id\}

```ts
id: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L14)

The rule's unique identifier

---

### operator \{#operator\}

```ts
operator: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L24)

The operator

---

### value? \{#value\}

```ts
value?: unknown;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L29)

The rule value (optional)

---

### where? \{#where\}

```ts
where?: QueryBuilderRuleGroup<Record<string, unknown>>;
```

Defined in: [packages/rxdb-model/src/query-builder/models/query-builder-state.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/query-builder-state.ts#L33)

The subquery condition of the EXISTS/NOT EXISTS operators
