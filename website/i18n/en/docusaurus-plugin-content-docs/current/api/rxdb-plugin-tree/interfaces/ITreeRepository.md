---
sidebar_label: 'ITreeRepository⟨T⟩'
---

# ITreeRepository`<T>`

Defined in: [rxdb-plugin-tree/src/repository/tree-repository.interface.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/tree-repository.interface.ts#L47)

Tree repository interface

## Extends

- [`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Methods

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: rxdb/dist/repository/repository.interface.d.ts:33

Counts entities

#### Parameters

| Parameter | Type                                                                                           | Description                                                               |
| --------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"countOptions"`&gt; | Query options (see [CountOptions](../../rxdb/interfaces/CountOptions.md)) |

#### Returns

`Promise`&lt;`number`&gt;

Number of rows matching the condition

#### Inherited from

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`count`](../../rxdb/interfaces/IRepository.md#count)

---

### countAncestors() \{#countancestors\}

```ts
countAncestors(options): Promise<number>;
```

Defined in: [rxdb-plugin-tree/src/repository/tree-repository.interface.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/tree-repository.interface.ts#L82)

Counts ancestor nodes

#### Parameters

| Parameter | Type                                               |
| --------- | -------------------------------------------------- |
| `options` | [`FindTreeOptions`](FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`number`&gt;

#### Remarks

- With entityId specified: **excludes the current node**, counts only the ancestors
- Without entityId: the number of root nodes

---

### countDescendants() \{#countdescendants\}

```ts
countDescendants(options): Promise<number>;
```

Defined in: [rxdb-plugin-tree/src/repository/tree-repository.interface.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/tree-repository.interface.ts#L64)

Counts descendant entities

#### Parameters

| Parameter | Type                                               |
| --------- | -------------------------------------------------- |
| `options` | [`FindTreeOptions`](FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`number`&gt;

#### Remarks

- With entityId specified: **excludes the current node**, counts only the descendants
- Without entityId: the total of all root nodes and their descendants

---

### create() \{#create\}

```ts
create(entity): Promise<InstanceType<T>>;
```

Defined in: rxdb/dist/repository/repository.interface.d.ts:40

Creates an entity

#### Parameters

| Parameter | Type                      | Description                                                                                                          |
| --------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | Entity instance (usually created by [EntityManager.instantiate](../../rxdb/interfaces/EntityManager.md#instantiate)) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after persistence; **not** the same reference as the input (implementations may swap in a new instance)

#### Inherited from

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`create`](../../rxdb/interfaces/IRepository.md#create)

---

### find() \{#find\}

```ts
find(options): Promise<InstanceType<T>[]>;
```

Defined in: rxdb/dist/repository/repository.interface.d.ts:26

Finds multiple entities

#### Parameters

| Parameter | Type                                                                                          | Description                                                             |
| --------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findOptions"`&gt; | Query options (see [FindOptions](../../rxdb/interfaces/FindOptions.md)) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

Array of entities matching the condition; an empty array when nothing matches (does **not** throw)

#### Remarks

Returns entity instances (with the state machine), not bare data — later `save()` / `remove()` calls on the caller side reuse the same state object, avoiding "context lost right after the query".

#### Inherited from

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`find`](../../rxdb/interfaces/IRepository.md#find)

---

### findAncestors() \{#findancestors\}

```ts
findAncestors(options): Promise<InstanceType<T>[]>;
```

Defined in: [rxdb-plugin-tree/src/repository/tree-repository.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/tree-repository.interface.ts#L73)

Finds ancestor nodes

#### Parameters

| Parameter | Type                                               |
| --------- | -------------------------------------------------- |
| `options` | [`FindTreeOptions`](FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Remarks

- With entityId specified: current node + ancestor nodes
- Without entityId: all root nodes (the starting points are all roots; roots have no ancestors above them)

---

### findDescendants() \{#finddescendants\}

```ts
findDescendants(options): Promise<InstanceType<T>[]>;
```

Defined in: [rxdb-plugin-tree/src/repository/tree-repository.interface.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/tree-repository.interface.ts#L55)

Finds descendant entities

#### Parameters

| Parameter | Type                                               |
| --------- | -------------------------------------------------- |
| `options` | [`FindTreeOptions`](FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Remarks

- With entityId specified: current node + descendant nodes
- Without entityId: returns all root nodes and their descendants

---

### remove() \{#remove\}

```ts
remove(entity): Promise<InstanceType<T>>;
```

Defined in: rxdb/dist/repository/repository.interface.d.ts:55

Deletes an entity

#### Parameters

| Parameter | Type                      | Description                            |
| --------- | ------------------------- | -------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | The entity to delete (located by `id`) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after deletion (fields cleared, `local` set to `false`)

#### Inherited from

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`remove`](../../rxdb/interfaces/IRepository.md#remove)

---

### update() \{#update\}

```ts
update(entity, patch): Promise<InstanceType<T>>;
```

Defined in: rxdb/dist/repository/repository.interface.d.ts:48

Updates an entity

#### Parameters

| Parameter | Type                                       | Description                                                |
| --------- | ------------------------------------------ | ---------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt;                  | The entity to update (provides `id` and the latest fields) |
| `patch`   | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | Field-level patch; fields not listed are untouched         |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after persistence

#### Inherited from

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`update`](../../rxdb/interfaces/IRepository.md#update)
