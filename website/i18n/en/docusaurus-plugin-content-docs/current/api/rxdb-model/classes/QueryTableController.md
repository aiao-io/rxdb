---
sidebar_label: 'QueryTableController⟨T⟩'
---

# QueryTableController`<T>`

Defined in: [packages/rxdb-model/src/entity-table/headless.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/headless.ts#L22)

Query, pagination, ordering, and selection state of QueryTable; rendering can be fully taken over by the consumer.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L127)

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

Defined in: [packages/rxdb-model/src/entity-table/headless.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/headless.ts#L23)

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:405](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L405)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`create`](EntityListController.md#create)

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:410](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L410)

Aborts the query and removes subscriptions; late results after disposal are not written back.

#### Returns

`void`

#### Inherited from

[`EntityListController`](EntityListController.md).[`dispose`](EntityListController.md#dispose)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`refresh`](EntityListController.md#refresh)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`remove`](EntityListController.md#remove)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`select`](EntityListController.md#select)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`setCapabilities`](EntityListController.md#setcapabilities)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`setError`](EntityListController.md#seterror)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`setLoading`](EntityListController.md#setloading)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`setPage`](EntityListController.md#setpage)

---

### setQuery() \{#setquery\}

```ts
setQuery(query): void;
```

Defined in: [packages/rxdb-model/src/entity-table/headless.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/headless.ts#L26)

Switches the query and clears the old page and pending requests; refresh can then be called to fetch data; does nothing when structurally the same as the current query.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L213)

Replaces the current page with host records, optionally providing the total count at the same time.

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

Defined in: [packages/rxdb-model/src/entity-table/headless.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/headless.ts#L29)

Replaces the ordering rules and returns to the first page, discarding the old query results.

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

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L145)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`syncInput`](EntityListController.md#syncinput)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`toggleSelection`](EntityListController.md#toggleselection)

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

#### Inherited from

[`EntityListController`](EntityListController.md).[`update`](EntityListController.md#update)
