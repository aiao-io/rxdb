# RxDBAdapterBase

Defined in: [packages/rxdb/src/rxdb-adapter.ts:376](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L376)

Database adapter base class

## Extended by

- [`RxDBAdapterLocalBase`](RxDBAdapterLocalBase.md)
- [`RxDBAdapterRemoteBase`](RxDBAdapterRemoteBase.md)

## Constructors

### Constructor

```ts
new RxDBAdapterBase(rxdb): RxDBAdapterBase;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L380)

#### Parameters

| Parameter | Type              |
| --------- | ----------------- |
| `rxdb`    | [`RxDB`](RxDB.md) |

#### Returns

`RxDBAdapterBase`

## Properties

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:378](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L378)

---

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterBase, RepositoryInstance<EntityType>>>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:377](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L377)

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L380)

## Methods

### getRepository() \{#getrepository\}

```ts
abstract getRepository<T, RT>(EntityType): RT;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:382](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L382)

#### Type Parameters

| Type Parameter                                                                                         | Default type                                             |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md)              | -                                                        |
| <a id="type-parameter-rt"></a> `RT` _extends_ [`IRepository`](../interfaces/IRepository.md)&lt;`T`&gt; | [`IRepository`](../interfaces/IRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter    | Type |
| ------------ | ---- |
| `EntityType` | `T`  |

#### Returns

`RT`

---

### repository() \{#repository\}

```ts
protected repository<RT>(repositoryName, RepositoryClass): void;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:384](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L384)

#### Type Parameters

| Type Parameter                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-rt-1"></a> `RT` _extends_ [`RepositoryInstance`](../interfaces/RepositoryInstance.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt; |

#### Parameters

| Parameter         | Type                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `repositoryName`  | `string`                                                                                                         |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterBase`, `RT`&gt; |

#### Returns

`void`
