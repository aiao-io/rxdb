---
sidebar_label: 'EntityListController⟨T⟩'
---

# EntityListController`<T>`

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:82

Shared controller for list filtering, pagination, selection, and data state.

## Extended by

- [`QueryTableController`](QueryTableController.md)

## Type Parameters

| Type Parameter                                                                                    | Default type                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Constructors

### Constructor

```ts
new EntityListController<T>(options?): EntityListController<T>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:86

#### Parameters

| Parameter  | Type                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| `options?` | [`EntityListControllerOptions`](../interfaces/EntityListControllerOptions.md)&lt;`T`&gt; |

#### Returns

`EntityListController`&lt;`T`&gt;

## Accessors

### snapshot \{#snapshot\}

#### Get Signature

```ts
get snapshot(): EntityListSnapshot<T>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:85

Reads the current list state; entity instances keep their original methods.

##### Returns

[`EntityListSnapshot`](../interfaces/EntityListSnapshot.md)&lt;`T`&gt;

## Methods

### clearSelection() \{#clearselection\}

```ts
clearSelection(): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:126

Clears the current selection.

#### Returns

`void`

---

### create() \{#create\}

```ts
create(data): Promise<T>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:116

Creates an entity; when a query data source exists, reloads the current page after a successful save.

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `data`    | `Record`&lt;`string`, `unknown`&gt; |

#### Returns

`Promise`&lt;`T`&gt;

#### Remarks

Without a data source, an unconstrained view (the first page with no query and no ordering) matches the default list's `id desc` (UUID v7, newest first):
the new record is placed first and the page size is kept; the oldest record pushed out of this page is removed together with its selection; a constrained view cannot determine the new record's position, so it clears the current page and waits for the host to supply data.

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:128

Aborts queries and removes subscriptions; late results after disposal never write back.

#### Returns

`void`

---

### refresh() \{#refresh\}

```ts
refresh(loader?): Promise<readonly T[]>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:110

Executes the current query; keeps the old page while refreshing, replaces it on success, and keeps the old page and exposes the error on failure.

#### Parameters

| Parameter | Type                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loader?` | (`context`) => \| [`EntityListLoadResult`](../interfaces/EntityListLoadResult.md)&lt;`T`&gt; \| `Promise`&lt;[`EntityListLoadResult`](../interfaces/EntityListLoadResult.md)&lt;`T`&gt;&gt; |

#### Returns

`Promise`&lt;readonly `T`[]&gt;

---

### remove() \{#remove\}

```ts
remove(ids): Promise<void>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:120

Deletes entities; on partial success, first converges the successful items, then reports the failed items via AggregateError.

#### Parameters

| Parameter | Type                |
| --------- | ------------------- |
| `ids`     | readonly `string`[] |

#### Returns

`Promise`&lt;`void`&gt;

---

### select() \{#select\}

```ts
select(ids): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:122

Selects entities that exist in the current page, automatically deduplicating and filtering unknown IDs.

#### Parameters

| Parameter | Type                |
| --------- | ------------------- |
| `ids`     | readonly `string`[] |

#### Returns

`void`

---

### setCapabilities() \{#setcapabilities\}

```ts
setCapabilities(capabilities): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:108

Replaces the existing capability constraints; subsequent write actions are judged against the new constraints.

#### Parameters

| Parameter      | Type                                                                       |
| -------------- | -------------------------------------------------------------------------- |
| `capabilities` | [`EntityCapabilities`](../interfaces/EntityCapabilities.md) \| `undefined` |

#### Returns

`void`

---

### setError() \{#seterror\}

```ts
setError(error): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:106

Exposes errors from the host data source or write actions.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `error`   | `unknown` |

#### Returns

`void`

---

### setLoading() \{#setloading\}

```ts
setLoading(loading): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:104

Updates the data source loading state managed by the host.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `loading` | `boolean` |

#### Returns

`void`

---

### setPage() \{#setpage\}

```ts
setPage(page, pageSize?): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:100

Sets the zero-based page number and page size, discarding the old page; does nothing when identical to the current page.

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `page`      | `number` |
| `pageSize?` | `number` |

#### Returns

`void`

---

### setQuery() \{#setquery\}

```ts
setQuery(query): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:96

Switches the query and clears the old page and pending requests; refresh can then be called to fetch data; does nothing when the query is structurally identical to the current one.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `query`   | `unknown` |

#### Returns

`void`

---

### setRecords() \{#setrecords\}

```ts
setRecords(records, total?): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:102

Replaces the current page with host records, optionally providing the total count.

#### Parameters

| Parameter | Type           |
| --------- | -------------- |
| `records` | readonly `T`[] |
| `total?`  | `number`       |

#### Returns

`void`

---

### setSorts() \{#setsorts\}

```ts
setSorts(sorts): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:98

Replaces the ordering rules and returns to the first page, discarding the old query results.

#### Parameters

| Parameter | Type                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `sorts`   | readonly [`OrderBy`](../../rxdb/interfaces/OrderBy.md)&lt;`string`&gt;[] |

#### Returns

`void`

---

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:88

Subscribes to subsequent state changes and returns an unsubscribe function.

#### Parameters

| Parameter  | Type                      |
| ---------- | ------------------------- |
| `listener` | `ListListener`&lt;`T`&gt; |

#### Returns

() => `void`

---

### syncInput() \{#syncinput\}

```ts
syncInput(input): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:94

Synchronizes host inputs, forwarding only the items that actually changed relative to the previous input (the construction options the first time).

#### Parameters

| Parameter | Type                                                               |
| --------- | ------------------------------------------------------------------ |
| `input`   | [`EntityListInput`](../type-aliases/EntityListInput.md)&lt;`T`&gt; |

#### Returns

`void`

#### Remarks

Applied in the order query, ordering, pagination, records, capabilities, so new records in the same input batch are not cleared by a subsequent page change.
When query, ordering, pagination, and records are omitted, the current state is kept; capabilities are synced as-is from the input, and omitting them removes the constraint.

---

### toggleSelection() \{#toggleselection\}

```ts
toggleSelection(id): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:124

Toggles an entity's selection state.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`void`

---

### update() \{#update\}

```ts
update(id, changes): Promise<T>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:118

Updates an entity; concurrent updates to the same entity execute in call order and preserve instance methods.

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `id`      | `string`                            |
| `changes` | `Record`&lt;`string`, `unknown`&gt; |

#### Returns

`Promise`&lt;`T`&gt;
