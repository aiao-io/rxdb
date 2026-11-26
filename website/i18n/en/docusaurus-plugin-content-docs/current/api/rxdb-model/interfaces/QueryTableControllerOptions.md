---
sidebar_label: 'QueryTableControllerOptions⟨T⟩'
---

# QueryTableControllerOptions`<T>`

Defined in: [packages/rxdb-model/src/entity-table/headless.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/headless.ts#L15)

Initial list state and data source actions for the query table.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L59)

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`capabilities`](EntityListControllerOptions.md#capabilities)

---

### load? \{#load\}

```ts
readonly load?: (context) =>
  | EntityListLoadResult<T>
  | Promise<EntityListLoadResult<T>>;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L61)

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L62)

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L64)

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L63)

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L56)

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`page`](EntityListControllerOptions.md#page)

---

### pageSize? \{#pagesize\}

```ts
readonly pageSize?: number;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L57)

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`pageSize`](EntityListControllerOptions.md#pagesize)

---

### query? \{#query\}

```ts
readonly query?: unknown;
```

Defined in: [packages/rxdb-model/src/entity-table/headless.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/headless.ts#L18)

#### Overrides

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`query`](EntityListControllerOptions.md#query)

---

### records? \{#records\}

```ts
readonly records?: readonly T[];
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L58)

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`records`](EntityListControllerOptions.md#records)

---

### sorts? \{#sorts\}

```ts
readonly sorts?: readonly OrderBy<string>[];
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L55)

#### Inherited from

[`EntityListControllerOptions`](EntityListControllerOptions.md).[`sorts`](EntityListControllerOptions.md#sorts)
