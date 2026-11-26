# SubqueryBuilderProps

Defined in: [packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx#L26)

Props of [SubqueryBuilder](../functions/SubqueryBuilder.md).

## Properties

### fields \{#fields\}

```ts
fields: FieldMetadata[];
```

Defined in: [packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx#L28)

Field list.

---

### initialQuery? \{#initialquery\}

```ts
initialQuery?: QueryBuilderRuleGroup<Record<string, unknown>>;
```

Defined in: [packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx#L30)

Initial query (applied only once).

---

### maxDepth? \{#maxdepth\}

```ts
maxDepth?: number;
```

Defined in: [packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx#L32)

Maximum nesting level, defaults to `3`.

---

### onQueryChange? \{#onquerychange\}

```ts
onQueryChange?: (query) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx#L34)

Query change event (outputs undefined when there are no rules).

#### Parameters

| Parameter | Type                                                                           |
| --------- | ------------------------------------------------------------------------------ |
| `query`   | \| \{ `combinator`: `"and"` \| `"or"`; `rules`: `unknown`[]; \} \| `undefined` |

#### Returns

`void`

---

### onValidationChange? \{#onvalidationchange\}

```ts
onValidationChange?: (result) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/subquery-builder/subquery-builder.tsx#L36)

Validation state change event.

#### Parameters

| Parameter | Type                                      |
| --------- | ----------------------------------------- |
| `result`  | [`ValidationResult`](ValidationResult.md) |

#### Returns

`void`
