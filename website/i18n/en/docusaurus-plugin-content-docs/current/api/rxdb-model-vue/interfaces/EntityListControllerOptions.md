---
sidebar_label: 'EntityListControllerOptions⟨T⟩'
---

# EntityListControllerOptions`<T>`

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:65

Initial state of the list, the query data source, and persistence actions.

## Extended by

- [`QueryTableControllerOptions`](QueryTableControllerOptions.md)

## Type Parameters

| Type Parameter                                                                                    | Default type                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Properties

### capabilities? \{#capabilities\}

```ts
readonly capabilities?: EntityCapabilities;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:71

---

### load? \{#load\}

```ts
readonly load?: (context) =>
  | EntityListLoadResult<T>
  | Promise<EntityListLoadResult<T>>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:73

Query data source; stale return values are discarded automatically.

#### Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `context` | [`EntityListLoadContext`](EntityListLoadContext.md) |

#### Returns

\| [`EntityListLoadResult`](EntityListLoadResult.md)&lt;`T`&gt;
\| `Promise`&lt;[`EntityListLoadResult`](EntityListLoadResult.md)&lt;`T`&gt;&gt;

---

### onCreate? \{#oncreate\}

```ts
readonly onCreate?: (data) => T | Promise<T>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:74

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `data`    | `Record`&lt;`string`, `unknown`&gt; |

#### Returns

`T` \| `Promise`&lt;`T`&gt;

---

### onDelete? \{#ondelete\}

```ts
readonly onDelete?: (record) => void | Promise<void>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:76

#### Parameters

| Parameter | Type |
| --------- | ---- |
| `record`  | `T`  |

#### Returns

`void` \| `Promise`&lt;`void`&gt;

---

### onUpdate? \{#onupdate\}

```ts
readonly onUpdate?: (record, changes) => void | T | Promise<void | T>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:75

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `record`  | `T`                                 |
| `changes` | `Record`&lt;`string`, `unknown`&gt; |

#### Returns

`void` \| `T` \| `Promise`&lt;`void` \| `T`&gt;

---

### page? \{#page\}

```ts
readonly page?: number;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:68

---

### pageSize? \{#pagesize\}

```ts
readonly pageSize?: number;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:69

---

### query? \{#query\}

```ts
readonly query?: unknown;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:66

---

### records? \{#records\}

```ts
readonly records?: readonly T[];
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:70

---

### sorts? \{#sorts\}

```ts
readonly sorts?: readonly OrderBy<string>[];
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:67
