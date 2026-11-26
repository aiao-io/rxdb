---
sidebar_label: "QueryManager⟨T⟩"
---

# QueryManager`<T>`

Defined in: [packages/rxdb/src/repository/QueryManager.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.ts#L171)

Query cache manager

Used to manage the caching and execution of query tasks
- Records the dependency relationships of observed tables according to query conditions
- Uniformly decides when to compute in JS and when to re-execute SQL, reducing the difficulty of adapter development
- In the future, configures rules in the Repository for pull/push with the remote

Core functions:
1. Query result caching: reuse cached results for the same query conditions
2. Subscription management: manages subscriptions and unsubscriptions of multiple observers
3. Automatic cleanup: automatically cleans up the cache when there are no observers
4. Reactive refresh: supports manual refresh and automatic refresh of query results

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

## Properties

### EntityType \{#entitytype\}

```ts
protected readonly EntityType: T;
```

Defined in: [packages/rxdb/src/repository/QueryManager.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.ts#L204)

The entity type, used to identify the entity currently managed

***

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/repository/QueryManager.ts:203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.ts#L203)

The RxDB instance, used to access the database and event system

## Methods

### createTask() \{#createtask\}

```ts
createTask<RT>(taskOptions): QueryTask<T, RT>;
```

Defined in: [packages/rxdb/src/repository/QueryManager.ts:236](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.ts#L236)

Creates a query task

This method creates or reuses a cached query task based on the query options
- Uses the hash of the query type and options as the cache key
- If the same query already exists in the cache, returns the cached task directly
- Each query task manages multiple observers, and cleans itself up automatically when the last observer unsubscribes

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-rt"></a> `RT` | `unknown` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `taskOptions` | `CreateTaskOptions`&lt;`T`, `RT`&gt; | Query task options |

#### Returns

[`QueryTask`](../classes/QueryTask.md)&lt;`T`, `RT`&gt;

The query task object, containing result$ for subscribing to query results

***

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb/src/repository/QueryManager.ts:211](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.ts#L211)

#### Returns

`void`

***

### hasDependency() \{#hasdependency\}

```ts
hasDependency(entityType): boolean;
```

Defined in: [packages/rxdb/src/repository/QueryManager.ts:258](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.ts#L258)

Whether this manager currently has a query depending on the given entity type (US-023).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityType` | [`EntityType`](../type-aliases/EntityType.md) | The entity type to test |

#### Returns

`boolean`

`true` when the key exists in the dependency count table

#### Remarks

The dependency set is derived from each task's `where` (see `entity_type_dependencies`), so "a query of A
referencing B" shows up here as A's manager holding a count for B. This repository's own entity type is
counted once at construction and is always `true`.

Internal interface: used by `Repository` to decide whether an invalidation report should go further; not part of the public API.

***

### refreshAllTasks() \{#refreshalltasks\}

```ts
refreshAllTasks(): void;
```

Defined in: [packages/rxdb/src/repository/QueryManager.ts:292](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.ts#L292)

Reruns all query tasks (US-314 B1.4).

#### Returns

`void`

#### Remarks

This instance has remounted a business table set, and every result may have been swapped — there is no such thing as "only rerun the related ones".
Internal interface: called by `Repository.refreshAllQueries`; not part of the public API.

***

### refreshDependentTasks() \{#refreshdependenttasks\}

```ts
refreshDependentTasks(entityTypes): void;
```

Defined in: [packages/rxdb/src/repository/QueryManager.ts:274](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.ts#L274)

Reruns the query tasks depending on one of the given entity types (US-023).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityTypes` | `ReadonlySet`&lt;[`EntityType`](../type-aliases/EntityType.md)&gt; | The set of entity types reported invalidated |

#### Returns

`void`

#### Remarks

Matches at **task granularity** instead of rerunning the whole table in one sweep: `QueryTask.relationEntityTypes` is that task's
own dependency set (necessarily containing its own entity type at construction), and only tasks whose set intersects the input rerun. On one repository,
queries with different `where` clauses only go back to the remote when they genuinely reference a reported entity.

Internal interface: called by `Repository`'s invalidation listener; not part of the public API.

***

### registerMergeCreateFn() \{#registermergecreatefn\}

```ts
registerMergeCreateFn(taskType, fn): void;
```

Defined in: [packages/rxdb/src/repository/QueryManager.ts:296](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.ts#L296)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `taskType` | `string` |
| `fn` | `MergeQueryTaskCreateFn`&lt;`T`&gt; |

#### Returns

`void`

***

### registerMergeRemoveFn() \{#registermergeremovefn\}

```ts
registerMergeRemoveFn(taskType, fn): void;
```

Defined in: [packages/rxdb/src/repository/QueryManager.ts:304](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.ts#L304)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `taskType` | `string` |
| `fn` | `MergeQueryTaskRemoveFn`&lt;`T`&gt; |

#### Returns

`void`

***

### registerMergeUpdateFn() \{#registermergeupdatefn\}

```ts
registerMergeUpdateFn(taskType, fn): void;
```

Defined in: [packages/rxdb/src/repository/QueryManager.ts:300](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.ts#L300)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `taskType` | `string` |
| `fn` | `MergeQueryTaskUpdateFn`&lt;`T`&gt; |

#### Returns

`void`
