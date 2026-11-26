---
sidebar_label: 'QueryBuilderSnapshot⟨T⟩'
---

# QueryBuilderSnapshot`<T>`

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:6

Query builder snapshot.

## Type Parameters

| Type Parameter                    | Default type                        |
| --------------------------------- | ----------------------------------- |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Properties

### fields \{#fields\}

```ts
readonly fields: readonly FieldMetadata[];
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:8

---

### query \{#query\}

```ts
readonly query: RuleGroup<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:9

---

### readonly \{#readonly\}

```ts
readonly readonly: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:12

---

### state \{#state\}

```ts
readonly state: QueryBuilderState<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:7

---

### valid \{#valid\}

```ts
readonly valid: boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:11

---

### validation \{#validation\}

```ts
readonly validation: ValidationResult;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:10
