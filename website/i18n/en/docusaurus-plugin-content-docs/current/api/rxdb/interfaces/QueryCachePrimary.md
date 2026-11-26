---
sidebar_label: 'QueryCachePrimary⟨T⟩'
---

# QueryCachePrimary`<T>`

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L38)

The primary repository under the QueryCache strategy.

## Remarks

It stands on the **facade axis** (`implements IRepository`), which is why it is still one of those called
`*Repository`; the only thing it adds over an ordinary primary repository is
[QueryCachePrimary.invalidateInflight](#invalidateinflight) — remote invalidation reports must invalidate
in-flight queries before returning (US-023 D13), and that is a concept only a read cache has.

## Extends

- [`IRepository`](IRepository.md)&lt;`T`&gt;

## Type Parameters

| Type Parameter                                                                            | Description |
| ----------------------------------------------------------------------------------------- | ----------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | Entity type |

## Methods

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L35)

Counts entities.

#### Parameters

| Parameter | Type                                                                                   | Description                                         |
| --------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `options` | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"countOptions"`&gt; | Query options (see [CountOptions](CountOptions.md)) |

#### Returns

`Promise`&lt;`number`&gt;

The number of rows matching the condition.

#### Inherited from

[`IRepository`](IRepository.md).[`count`](IRepository.md#count)

---

### create() \{#create\}

```ts
create(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L43)

Creates an entity.

#### Parameters

| Parameter | Type                      | Description                                                                                     |
| --------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | Entity instance (usually created via [EntityManager.instantiate](EntityManager.md#instantiate)) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after persistence; it is **not** the same reference as the argument (the implementation may swap in a new instance).

#### Inherited from

[`IRepository`](IRepository.md).[`create`](IRepository.md#create)

---

### find() \{#find\}

```ts
find(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L27)

Queries multiple entities.

#### Parameters

| Parameter | Type                                                                                  | Description                                       |
| --------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `options` | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"findOptions"`&gt; | Query options (see [FindOptions](FindOptions.md)) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

An array of the entities matching the condition; an empty array when nothing matches (**does not** throw).

#### Remarks

Returns entity instances (with the state machine), not raw data — subsequent `save()` / `remove()`
operations by the caller reuse the same state object, avoiding "context lost right after the query".

#### Inherited from

[`IRepository`](IRepository.md).[`find`](IRepository.md#find)

---

### invalidateInflight() \{#invalidateinflight\}

```ts
invalidateInflight(): void;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L46)

Invalidates the sync queries that are in flight right now.

#### Returns

`void`

#### Remarks

After the call, the batch of sync queries already sent out but not yet returned must not write their
results back to the local projection: what they queried is the remote state from **before** the invalidation.

---

### remove() \{#remove\}

```ts
remove(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L60)

Deletes an entity.

#### Parameters

| Parameter | Type                      | Description                            |
| --------- | ------------------------- | -------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | The entity to delete (located by `id`) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after deletion (fields cleared, `local` set to `false`).

#### Inherited from

[`IRepository`](IRepository.md).[`remove`](IRepository.md#remove)

---

### update() \{#update\}

```ts
update(entity, patch): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L52)

Updates an entity.

#### Parameters

| Parameter | Type                                       | Description                                                    |
| --------- | ------------------------------------------ | -------------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt;                  | The entity to update (provides the `id` and the latest fields) |
| `patch`   | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | Field-level patch; fields not listed are left unchanged        |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after persistence.

#### Inherited from

[`IRepository`](IRepository.md).[`update`](IRepository.md#update)
