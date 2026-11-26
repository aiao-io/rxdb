# RemoteRxDBBranchRepository

Defined in: [packages/rxdb/src/system/types.remote.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L23)

Remote repository interface for RxDBBranch

## Methods

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: [packages/rxdb/src/system/types.remote.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L35)

count query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`CountOptions`](CountOptions.md)&lt;*typeof* [`RxDBBranch`](../classes/RxDBBranch.md), [`RxDBBranchRuleGroup`](../type-aliases/RxDBBranchRuleGroup.md)&gt; | Query options |

#### Returns

`Promise`&lt;`number`&gt;

Returns the number of query results

***

### create() \{#create\}

```ts
create(entity): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/types.remote.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L42)

Creates an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | [`RxDBBranch`](../classes/RxDBBranch.md) | The entity to create |

#### Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)&gt;

Returns the created entity

***

### find() \{#find\}

```ts
find(options): Promise<RxDBBranch[]>;
```

Defined in: [packages/rxdb/src/system/types.remote.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L29)

find query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindOptions`](FindOptions.md)&lt;*typeof* [`RxDBBranch`](../classes/RxDBBranch.md), [`RxDBBranchRuleGroup`](../type-aliases/RxDBBranchRuleGroup.md), [`RxDBBranchOrderByField`](../type-aliases/RxDBBranchOrderByField.md)&gt; | Query options |

#### Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)[]&gt;

Returns the query result array

***

### remove() \{#remove\}

```ts
remove(entity): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/types.remote.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L60)

Removes an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | [`RxDBBranch`](../classes/RxDBBranch.md) | The entity to remove |

#### Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)&gt;

Returns the removed entity

***

### update() \{#update\}

```ts
update(entity, patch): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/types.remote.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.remote.ts#L50)

Updates an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | [`RxDBBranch`](../classes/RxDBBranch.md) | The entity to update |
| `patch` | `Partial`&lt;`InstanceType`&lt;*typeof* [`RxDBBranch`](../classes/RxDBBranch.md)&gt;&gt; | Update data |

#### Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)&gt;

Returns the updated entity
