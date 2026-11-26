---
sidebar_label: 'QueryTableController⟨T⟩'
---

# QueryTableController`<T>`

Defined in: packages/rxdb-model/dist/entity-table/headless.d.ts:13

Query, pagination, ordering and selection state for QueryTable; rendering can be fully taken over by the consumer.

## Extends

- [`EntityListController`](EntityListController.md)&lt;`T`&gt;

## Type Parameters

| Type Parameter                                                                                    | Default type                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Constructors

### Constructor

```ts
new QueryTableController<T>(options?): QueryTableController<T>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:86

#### Parameters

| Parameter  | Type                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| `options?` | [`EntityListControllerOptions`](../interfaces/EntityListControllerOptions.md)&lt;`T`&gt; |

#### Returns

`QueryTableController`&lt;`T`&gt;

#### Inherited from

[`EntityListController`](EntityListController.md).[`constructor`](EntityListController.md#constructor)

## Accessors

### snapshot \{#snapshot\}

#### Get Signature

```ts
get snapshot(): QueryTableSnapshot<T>;
```

Defined in: packages/rxdb-model/dist/entity-table/headless.d.ts:14

Reads the current list state; entity instances keep their original methods.

##### Returns

[`QueryTableSnapshot`](../interfaces/QueryTableSnapshot.md)&lt;`T`&gt;

#### Overrides

[`EntityListController`](EntityListController.md).[`snapshot`](EntityListController.md#snapshot)

## Methods

### clearSelection() \{#clearselection\}

```ts
clearSelection(): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:126

Clears the current selection.

#### Returns

`void`

#### Inherited from

[`EntityListController`](EntityListController.md).[`clearSelection`](EntityListController.md#clearselection)

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
the new record is placed at the top while keeping the page size, and the oldest record pushed out of this page is removed along with its selection; a constrained view cannot tell where the new record belongs, so it clears the current page and waits for the host to supply data.

#### Inherited from

[`EntityListController`](EntityListController.md).[`create`](EntityListController.md#create)

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:128

Aborts the query and removes subscriptions; late results after disposal never write back.

#### Returns

`void`

#### Inherited from

[`EntityListController`](EntityListController.md).[`dispose`](EntityListController.md#dispose)

---

### refresh() \{#refresh\}

```ts
refresh(loader?): Promise<readonly T[]>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:110

Executes the current query; keeps the old page during refresh, replaces it on success, and keeps it while exposing the error on failure.

#### Parameters

| Parameter | Type                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loader?` | (`context`) => \| [`EntityListLoadResult`](../interfaces/EntityListLoadResult.md)&lt;`T`&gt; \| `Promise`&lt;[`EntityListLoadResult`](../interfaces/EntityListLoadResult.md)&lt;`T`&gt;&gt; |

#### Returns

`Promise`&lt;readonly `T`[]&gt;

#### Inherited from

[`EntityListController`](EntityListController.md).[`refresh`](EntityListController.md#refresh)

---

### remove() \{#remove\}

```ts
remove(ids): Promise<void>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:120

Deletes entities; on partial success, first collects the successful items, then reports the failed items via AggregateError.

#### Parameters

| Parameter | Type                |
| --------- | ------------------- |
| `ids`     | readonly `string`[] |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`EntityListController`](EntityListController.md).[`remove`](EntityListController.md#remove)

---

### select() \{#select\}

```ts
select(ids): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:122

Selects entities present in the current page, deduplicating and filtering unknown IDs automatically.

#### Parameters

| Parameter | Type                |
| --------- | ------------------- |
| `ids`     | readonly `string`[] |

#### Returns

`void`

#### Inherited from

[`EntityListController`](EntityListController.md).[`select`](EntityListController.md#select)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`setCapabilities`](EntityListController.md#setcapabilities)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`setError`](EntityListController.md#seterror)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`setLoading`](EntityListController.md#setloading)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`setPage`](EntityListController.md#setpage)

---

### setQuery() \{#setquery\}

```ts
setQuery(query): void;
```

Defined in: packages/rxdb-model/dist/entity-table/headless.d.ts:15

Switches the query and clears the old page and pending requests; refresh can then be called to fetch data; does nothing when structurally identical to the current query.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `query`   | `unknown` |

#### Returns

`void`

#### Overrides

[`EntityListController`](EntityListController.md).[`setQuery`](EntityListController.md#setquery)

---

### setRecords() \{#setrecords\}

```ts
setRecords(records, total?): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:102

Replaces the current page with host records, optionally providing the total.

#### Parameters

| Parameter | Type           |
| --------- | -------------- |
| `records` | readonly `T`[] |
| `total?`  | `number`       |

#### Returns

`void`

#### Inherited from

[`EntityListController`](EntityListController.md).[`setRecords`](EntityListController.md#setrecords)

---

### setSorts() \{#setsorts\}

```ts
setSorts(sorts): void;
```

Defined in: packages/rxdb-model/dist/entity-table/headless.d.ts:16

Replaces the ordering rules and returns to the first page, discarding old query results.

#### Parameters

| Parameter | Type                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `sorts`   | readonly [`OrderBy`](../../rxdb/interfaces/OrderBy.md)&lt;`string`&gt;[] |

#### Returns

`void`

#### Overrides

[`EntityListController`](EntityListController.md).[`setSorts`](EntityListController.md#setsorts)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`subscribe`](EntityListController.md#subscribe)

---

### syncInput() \{#syncinput\}

```ts
syncInput(input): void;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:94

Syncs host input, forwarding only the items that actually changed relative to the previous input (the construction options the first time).

#### Parameters

| Parameter | Type                                                               |
| --------- | ------------------------------------------------------------------ |
| `input`   | [`EntityListInput`](../type-aliases/EntityListInput.md)&lt;`T`&gt; |

#### Returns

`void`

#### Remarks

Applied in the order query, ordering, pagination, records, capabilities; new records in the same input batch are not wiped out by a subsequent page change.
When query, ordering, pagination or records are absent, the current state is kept; capabilities are synced as-is from the input, and when absent, no longer constrain.

#### Inherited from

[`EntityListController`](EntityListController.md).[`syncInput`](EntityListController.md#syncinput)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`toggleSelection`](EntityListController.md#toggleselection)

---

### update() \{#update\}

```ts
update(id, changes): Promise<T>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:118

Updates an entity; concurrent updates to the same entity run in call order and keep instance methods.

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `id`      | `string`                            |
| `changes` | `Record`&lt;`string`, `unknown`&gt; |

#### Returns

`Promise`&lt;`T`&gt;

#### Inherited from

[`EntityListController`](EntityListController.md).[`update`](EntityListController.md#update)
