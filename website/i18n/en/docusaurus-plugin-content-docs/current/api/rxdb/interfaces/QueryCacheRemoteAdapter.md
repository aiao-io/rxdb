# QueryCacheRemoteAdapter

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L33)

QueryCache adapter interface (remote)

## Methods

### create()? \{#create\}

```ts
create?<T>(entityName, data): Observable<T>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L39)

Creates an entity (optional - needed for write operations)

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entityName` | `string` |
| `data` | `T` |

#### Returns

`Observable`&lt;`T`&gt;

***

### delete()? \{#delete\}

```ts
delete?(entityName, ids): Observable<void>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L43)

Deletes entities (optional - needed for write operations)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entityName` | `string` |
| `ids` | `string` \| `string`[] |

#### Returns

`Observable`&lt;`void`&gt;

***

### fetchMetadata() \{#fetchmetadata\}

```ts
fetchMetadata<TEntity>(entityName, query): Observable<QueryCacheEntityMetadata[]>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L35)

Fetches entity metadata satisfying the query conditions

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-tentity"></a> `TEntity` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entityName` | `string` |
| `query` | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`TEntity`&gt; |

#### Returns

`Observable`&lt;[`QueryCacheEntityMetadata`](QueryCacheEntityMetadata.md)[]&gt;

***

### findByIds() \{#findbyids\}

```ts
findByIds<T>(entityName, ids): Observable<T[]>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L37)

Fetches full data in bulk by ID

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entityName` | `string` |
| `ids` | `string`[] |

#### Returns

`Observable`&lt;`T`[]&gt;

***

### update()? \{#update\}

```ts
update?<T>(
   entityName, 
   id, 
   data
): Observable<T>;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L41)

Updates an entity (optional - needed for write operations)

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entityName` | `string` |
| `id` | `string` |
| `data` | `Partial`&lt;`T`&gt; |

#### Returns

`Observable`&lt;`T`&gt;
