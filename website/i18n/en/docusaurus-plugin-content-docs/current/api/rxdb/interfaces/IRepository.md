---
sidebar_label: "IRepository⟨T⟩"
---

# IRepository`<T>`

Defined in: [packages/rxdb/src/repository/repository.interface.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L16)

Data repository management interface

One IRepository corresponds to all CRUD + query capabilities of **one** entity.
Adapters (`rxdb-adapter-sqlite` / `-pglite` / `-supabase` / `-sqliteai`)
provide implementations of this interface through [AdapterRepositoryConstructor](../type-aliases/AdapterRepositoryConstructor.md),
and `Repository` ([Repository](../classes/Repository.md)) layers "sync + transactions + cache" on top.

## Remarks

**No merging**: writes are per-entity; callers needing transactions go through [TransactionExecutor](TransactionExecutor.md);
**No subscriptions**: this interface only promises pull-style results in the form of `Promise`s, with live notifications carried separately by [QueryManager](QueryManager.md)'s `Observable` — letting the two APIs do their own jobs and letting callers pick as needed.

## Extended by

- [`QueryCachePrimary`](QueryCachePrimary.md)
- [`IGraphRepository`](../../rxdb-plugin-graph/interfaces/IGraphRepository.md)
- [`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md)

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

## Methods

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L35)

Counts entities

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"countOptions"`&gt; | Query options (see [CountOptions](CountOptions.md)) |

#### Returns

`Promise`&lt;`number`&gt;

Number of rows satisfying the conditions

***

### create() \{#create\}

```ts
create(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L43)

Create an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity instance (usually created by [EntityManager.instantiate](EntityManager.md#instantiate)) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after persistence; **not** the same reference as the argument (implementations may swap in a new instance)

***

### find() \{#find\}

```ts
find(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L27)

Finds multiple entities

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"findOptions"`&gt; | Query options (see [FindOptions](FindOptions.md)) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

Array of entities satisfying the conditions; returns an empty array on no match (**does not** throw)

#### Remarks

Returns entity instances (with the state machine), not bare data — callers' subsequent `save()` / `remove()` operations reuse the same state object, avoiding "losing context the moment a query comes back".

***

### remove() \{#remove\}

```ts
remove(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L60)

Delete an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity to delete (located by `id`) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after deletion (fields cleared, `local` set to `false`)

***

### update() \{#update\}

```ts
update(entity, patch): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L52)

Update an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity to update (provides `id` and the latest fields) |
| `patch` | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | Field-level patch; fields not listed are untouched |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after persistence
