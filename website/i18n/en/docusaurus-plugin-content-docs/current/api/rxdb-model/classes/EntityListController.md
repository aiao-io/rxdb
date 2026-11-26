---
sidebar_label: 'EntityListController⟨T⟩'
---

# EntityListController`<T>`

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L98)

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L127)

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L123)

Reads the current list state; entity instances keep their original methods.

##### Returns

[`EntityListSnapshot`](../interfaces/EntityListSnapshot.md)&lt;`T`&gt;

## Methods

### clearSelection() \{#clearselection\}

```ts
clearSelection(): void;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:405](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L405)

Clears the current selection.

#### Returns

`void`

---

### create() \{#create\}

```ts
create(data): Promise<T>;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:284](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L284)

Creates an entity; reloads the current page after a successful save when a query data source exists.

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `data`    | `Record`&lt;`string`, `unknown`&gt; |

#### Returns

`Promise`&lt;`T`&gt;

#### Remarks

Without a data source, an unconstrained view (the first page with no query and no ordering) matches the default list's `id desc` (UUID v7, newest first):
the new record goes first and the page size is preserved, so the oldest record pushed off this page is removed together with its selection; a constrained view cannot tell where the new record belongs, so it clears the current page and waits for the host to supply data.

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:410](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L410)

Aborts the query and removes subscriptions; late results after disposal are not written back.

#### Returns

`void`

---

### refresh() \{#refresh\}

```ts
refresh(loader?): Promise<readonly T[]>;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L242)

Runs the current query; keeps the old page while refreshing, replaces it on success, and keeps the old page while exposing the error on failure.

#### Parameters

| Parameter | Type                                                                                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loader?` | \| ((`context`) => \| [`EntityListLoadResult`](../interfaces/EntityListLoadResult.md)&lt;`T`&gt; \| `Promise`&lt;[`EntityListLoadResult`](../interfaces/EntityListLoadResult.md)&lt;`T`&gt;&gt;) \| `undefined` |

#### Returns

`Promise`&lt;readonly `T`[]&gt;

---

### remove() \{#remove\}

```ts
remove(ids): Promise<void>;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:349](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L349)

Deletes entities; on partial success, converges the successful items first and then reports the failed items with an AggregateError.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:392](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L392)

Selects entities that exist in the current page, deduplicating and filtering out unknown IDs automatically.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:235](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L235)

Replaces the existing capability constraints; subsequent write actions are judged by the new constraints.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L229)

Exposes an error from the host data source or a write action.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L223)

Updates the host-managed data source loading state.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L201)

Sets the zero-based page number and page size, discarding the old page; does nothing when it is the same as the current page.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L177)

Switches the query and clears the old page and pending requests; refresh can then be called to fetch data; does nothing when structurally the same as the current query.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L213)

Replaces the current page with host records, optionally providing the total count at the same time.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L187)

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L145)

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L155)

Syncs the host input, forwarding only the items that really changed relative to the previous input (the construction options the first time).

#### Parameters

| Parameter | Type                                                               |
| --------- | ------------------------------------------------------------------ |
| `input`   | [`EntityListInput`](../type-aliases/EntityListInput.md)&lt;`T`&gt; |

#### Returns

`void`

#### Remarks

Applied in the order of query, ordering, pagination, records, capabilities, so new records in the same batch of input are not cleared by the subsequent page change.
When query, ordering, pagination, or records are omitted the current state is kept; capabilities are synced as-is from the input, so omitting them removes the constraint.

---

### toggleSelection() \{#toggleselection\}

```ts
toggleSelection(id): void;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:399](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L399)

Toggles the selection state of one entity.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:309](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L309)

Updates an entity; concurrent updates of the same entity run in call order and keep the instance methods.

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `id`      | `string`                            |
| `changes` | `Record`&lt;`string`, `unknown`&gt; |

#### Returns

`Promise`&lt;`T`&gt;
