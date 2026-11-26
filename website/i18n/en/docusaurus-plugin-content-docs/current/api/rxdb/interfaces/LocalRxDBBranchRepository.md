# LocalRxDBBranchRepository

Defined in: [packages/rxdb/src/system/types.local.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L25)

Local repository interface for RxDBBranch

## Methods

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: [packages/rxdb/src/system/types.local.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L37)

count query

#### Parameters

| Parameter | Type                                                                                                                                                        | Description   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`CountOptions`](CountOptions.md)&lt;_typeof_ [`RxDBBranch`](../classes/RxDBBranch.md), [`RxDBBranchRuleGroup`](../type-aliases/RxDBBranchRuleGroup.md)&gt; | Query options |

#### Returns

`Promise`&lt;`number`&gt;

Returns the number of query results

---

### create() \{#create\}

```ts
create(entity): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/types.local.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L44)

Create an entity

#### Parameters

| Parameter | Type                                     | Description          |
| --------- | ---------------------------------------- | -------------------- |
| `entity`  | [`RxDBBranch`](../classes/RxDBBranch.md) | The entity to create |

#### Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)&gt;

Returns the created entity

---

### find() \{#find\}

```ts
find(options): Promise<RxDBBranch[]>;
```

Defined in: [packages/rxdb/src/system/types.local.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L31)

find query

#### Parameters

| Parameter | Type                                                                                                                                                                                                                             | Description   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`FindOptions`](FindOptions.md)&lt;_typeof_ [`RxDBBranch`](../classes/RxDBBranch.md), [`RxDBBranchRuleGroup`](../type-aliases/RxDBBranchRuleGroup.md), [`RxDBBranchOrderByField`](../type-aliases/RxDBBranchOrderByField.md)&gt; | Query options |

#### Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)[]&gt;

Returns the array of query results

---

### remove() \{#remove\}

```ts
remove(entity): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/types.local.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L62)

Delete an entity

#### Parameters

| Parameter | Type                                     | Description          |
| --------- | ---------------------------------------- | -------------------- |
| `entity`  | [`RxDBBranch`](../classes/RxDBBranch.md) | The entity to delete |

#### Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)&gt;

Returns the deleted entity

---

### update() \{#update\}

```ts
update(entity, patch): Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/types.local.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/types.local.ts#L52)

Update an entity

#### Parameters

| Parameter | Type                                                                                     | Description          |
| --------- | ---------------------------------------------------------------------------------------- | -------------------- |
| `entity`  | [`RxDBBranch`](../classes/RxDBBranch.md)                                                 | The entity to update |
| `patch`   | `Partial`&lt;`InstanceType`&lt;_typeof_ [`RxDBBranch`](../classes/RxDBBranch.md)&gt;&gt; | Update data          |

#### Returns

`Promise`&lt;[`RxDBBranch`](../classes/RxDBBranch.md)&gt;

Returns the updated entity
