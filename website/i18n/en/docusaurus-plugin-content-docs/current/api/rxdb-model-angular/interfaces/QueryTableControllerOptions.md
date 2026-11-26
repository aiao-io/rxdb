---
sidebar_label: 'QueryTableControllerOptions⟨T⟩'
---

# QueryTableControllerOptions`<T>`

Defined in: packages/rxdb-model/dist/entity-table/headless.d.ts:9

Initial list state and data source actions of the query table.

## Extends

- [`EntityListControllerOptions`](EntityListControllerOptions.md)&lt;`T`&gt;

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

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`capabilities`](EntityListControllerOptions.md#capabilities)

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

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`load`](EntityListControllerOptions.md#load)

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

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`onCreate`](EntityListControllerOptions.md#oncreate)

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

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`onDelete`](EntityListControllerOptions.md#ondelete)

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

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`onUpdate`](EntityListControllerOptions.md#onupdate)

---

### page? \{#page\}

```ts
readonly page?: number;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:68

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`page`](EntityListControllerOptions.md#page)

---

### pageSize? \{#pagesize\}

```ts
readonly pageSize?: number;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:69

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`pageSize`](EntityListControllerOptions.md#pagesize)

---

### query? \{#query\}

```ts
readonly query?: unknown;
```

Defined in: packages/rxdb-model/dist/entity-table/headless.d.ts:10

#### Overrides

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`query`](EntityListControllerOptions.md#query)

---

### records? \{#records\}

```ts
readonly records?: readonly T[];
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:70

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`records`](EntityListControllerOptions.md#records)

---

### sorts? \{#sorts\}

```ts
readonly sorts?: readonly OrderBy<string>[];
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:67

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`sorts`](EntityListControllerOptions.md#sorts)
