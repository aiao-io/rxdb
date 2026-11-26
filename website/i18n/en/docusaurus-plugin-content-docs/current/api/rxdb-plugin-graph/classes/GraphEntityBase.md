# GraphEntityBase

Defined in: [rxdb-plugin-graph/src/GraphEntityBase.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/GraphEntityBase.ts#L26)

Graph entity decorator configuration
Defines the edge relations and traversal capabilities required by the graph structure

## Extends

- [`EntityBase`](../../rxdb/classes/EntityBase.md)

## Constructors

### Constructor

```ts
new GraphEntityBase(initData?): GraphEntityBase;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:117

Entity base class constructor
Subclasses enhance this constructor through the Entity decorator

#### Parameters

| Parameter   | Type      |
| ----------- | --------- |
| `initData?` | `unknown` |

#### Returns

`GraphEntityBase`

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`constructor`](../../rxdb/classes/EntityBase.md#constructor)

## Properties

### createdAt \{#createdat\}

```ts
readonly createdAt: Date;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:36

Creation time
Automatically set to the current time when the entity is created

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdAt`](../../rxdb/classes/EntityBase.md#createdat)

---

### createdBy? \{#createdby\}

```ts
readonly createdBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:46

Creator ID
Records the user ID that created this entity

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdBy`](../../rxdb/classes/EntityBase.md#createdby)

---

### id \{#id\}

```ts
readonly id: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:31

Entity unique identifier
An auto-generated UUID serving as the primary key

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`id`](../../rxdb/classes/EntityBase.md#id)

---

### remove \{#remove\}

```ts
remove: () => Promise<GraphEntityBase>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:97

Deletes

#### Returns

`Promise`&lt;`GraphEntityBase`&gt;

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`remove`](../../rxdb/classes/EntityBase.md#remove)

---

### reset \{#reset\}

```ts
reset: () => void;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:101

Resets data

#### Returns

`void`

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`reset`](../../rxdb/classes/EntityBase.md#reset)

---

### save \{#save\}

```ts
save: () => Promise<GraphEntityBase>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:110

Saves the entity.

#### Returns

`Promise`&lt;`GraphEntityBase`&gt;

#### Remarks

This entry point does not hold a transaction executor and re-enters the adapter queue. Awaiting this method inside a transaction callback waits for the current transaction to finish; use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository) instead. For full dos and don'ts, see [RxDBAdapterLocalBase.transaction](../../rxdb/classes/RxDBAdapterLocalBase.md#transaction).

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`save`](../../rxdb/classes/EntityBase.md#save)

---

### updatedAt \{#updatedat\}

```ts
readonly updatedAt: Date;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:41

Update time
Automatically set to the current time when the entity is created or updated

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedAt`](../../rxdb/classes/EntityBase.md#updatedat)

---

### updatedBy? \{#updatedby\}

```ts
readonly updatedBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:51

Updater ID
Records the user ID that last updated this entity

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedBy`](../../rxdb/classes/EntityBase.md#updatedby)

---

### addEdge \{#addedge\}

```ts
static addEdge: <T>(this, from, to, weight?, properties?) => Promise<void>;
```

Defined in: [rxdb-plugin-graph/src/GraphEntityBase.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/GraphEntityBase.ts#L124)

Adds an edge

#### Type Parameters

| Type Parameter                  |
| ------------------------------- |
| `T` _extends_ `GraphEntityBase` |

#### Parameters

| Parameter     | Type                                                                                     | Description                |
| ------------- | ---------------------------------------------------------------------------------------- | -------------------------- |
| `this`        | new () => `T`                                                                            | -                          |
| `from`        | `T`                                                                                      | Source node                |
| `to`          | `T`                                                                                      | Target node                |
| `weight?`     | `number` \| `null`                                                                       | Edge weight (optional)     |
| `properties?` | \| [`GraphEdgePropertiesRecord`](../type-aliases/GraphEdgePropertiesRecord.md) \| `null` | Edge properties (optional) |

#### Returns

`Promise`&lt;`void`&gt;

#### Example

```typescript
const userA = new User();
const userB = new User();
await User.addEdge(userA, userB, 8, { category: 'colleague' });
```

---

### count \{#count\}

```ts
static count: <T>(this, options) => Observable<number>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:93

Counts entities

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                         | Description                                  |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| `this`    | new () => `T`                                                                | -                                            |
| `options` | [`CountOptions`](../../rxdb/interfaces/CountOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`number`&gt;

The count wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`count`](../../rxdb/classes/EntityBase.md#count)

---

### countNeighbors \{#countneighbors\}

```ts
static countNeighbors: <T, U>(this, options) => Promise<number>;
```

Defined in: [rxdb-plugin-graph/src/GraphEntityBase.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/GraphEntityBase.ts#L68)

Counts neighbor nodes

#### Type Parameters

| Type Parameter                  | Default type |
| ------------------------------- | ------------ |
| `T` _extends_ `GraphEntityBase` | -            |
| `U` _extends_ `object`          | `object`     |

#### Parameters

| Parameter | Type                                                                                                                                                          | Description            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `this`    | new () => `T`                                                                                                                                                 | -                      |
| `options` | [`FindNeighborsOptions`](../interfaces/FindNeighborsOptions.md)&lt;new () => `T`, [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;new () => `T`&gt;, `U`&gt; | Neighbor query options |

#### Returns

`Promise`&lt;`number`&gt;

Promise of the neighbor count

#### Example

```typescript
// Count friends
User.countNeighbors$({ entityId: 'user1', level: 1 }).subscribe(count => {
  console.log(`friend count: ${count}`);
});
```

---

### countNeighbors$ \{#countneighbors-1\}

```ts
static countNeighbors$: <T, U>(this, options) => Observable<number>;
```

Defined in: [rxdb-plugin-graph/src/GraphEntityBase.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/GraphEntityBase.ts#L74)

Reactive version of counting neighbor nodes.

#### Type Parameters

| Type Parameter                  | Default type |
| ------------------------------- | ------------ |
| `T` _extends_ `GraphEntityBase` | -            |
| `U` _extends_ `object`          | `object`     |

#### Parameters

| Parameter | Type                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                                                                                                 |
| `options` | [`FindNeighborsOptions`](../interfaces/FindNeighborsOptions.md)&lt;new () => `T`, [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;new () => `T`&gt;, `U`&gt; |

#### Returns

`Observable`&lt;`number`&gt;

---

### find \{#find\}

```ts
static find: <T>(this, options) => Observable<T[]>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:75

Finds multiple entities

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                       | Description                                                       |
| --------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `this`    | new () => `T`                                                              | -                                                                 |
| `options` | [`FindOptions`](../../rxdb/interfaces/FindOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition, limit, offset, etc. |

#### Returns

`Observable`&lt;`T`[]&gt;

The entity instance array wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`find`](../../rxdb/classes/EntityBase.md#find)

---

### findAll \{#findall\}

```ts
static findAll: <T>(this, options) => Observable<T[]>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:81

Finds all entities

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                             | Description                                                          |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                    | -                                                                    |
| `options` | [`FindAllOptions`](../../rxdb/interfaces/FindAllOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition and ordering (no limit) |

#### Returns

`Observable`&lt;`T`[]&gt;

The entity instance array wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findAll`](../../rxdb/classes/EntityBase.md#findall)

---

### findByCursor \{#findbycursor\}

```ts
static findByCursor: <T>(this, options) => Observable<T[]>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:87

Paginated query via cursor

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                                       | Description                                                               |
| --------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                              | -                                                                         |
| `options` | [`FindByCursorOptions`](../../rxdb/interfaces/FindByCursorOptions.md)&lt;new () => `T`&gt; | Cursor pagination options, including orderBy and the before/after cursors |

#### Returns

`Observable`&lt;`T`[]&gt;

The entity instance array wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findByCursor`](../../rxdb/classes/EntityBase.md#findbycursor)

---

### findNeighbors \{#findneighbors\}

```ts
static findNeighbors: <T, U>(this, options) => Promise<GraphQueryResult<NeighborResult<new () => T, GraphEdgeInfoType<U>>>>;
```

Defined in: [rxdb-plugin-graph/src/GraphEntityBase.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/GraphEntityBase.ts#L43)

Finds neighbor nodes (with edge information)

#### Type Parameters

| Type Parameter                  | Default type |
| ------------------------------- | ------------ |
| `T` _extends_ `GraphEntityBase` | -            |
| `U` _extends_ `object`          | `object`     |

#### Parameters

| Parameter | Type                                                                                                                                                          | Description                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `this`    | new () => `T`                                                                                                                                                 | -                                                                                    |
| `options` | [`FindNeighborsOptions`](../interfaces/FindNeighborsOptions.md)&lt;new () => `T`, [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;new () => `T`&gt;, `U`&gt; | Neighbor query options, including the starting node, direction, number of hops, etc. |

#### Returns

`Promise`&lt;[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;[`NeighborResult`](../interfaces/NeighborResult.md)&lt;new () => `T`, [`GraphEdgeInfoType`](../type-aliases/GraphEdgeInfoType.md)&lt;`U`&gt;&gt;&gt;&gt;

Promise of the neighbor result

#### Example

```typescript
// Find direct friends
User.findNeighbors$({ entityId: 'user1', level: 1 }).subscribe(neighbors => {
  neighbors.forEach(n => {
    console.log(n.node.name, n.edge.weight, n.level);
  });
});
```

---

### findNeighbors$ \{#findneighbors-1\}

```ts
static findNeighbors$: <T, U>(this, options) => Observable<GraphQueryResult<NeighborResult<new () => T, GraphEdgeInfoType<U>>>>;
```

Defined in: [rxdb-plugin-graph/src/GraphEntityBase.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/GraphEntityBase.ts#L49)

Reactive version of finding neighbor nodes.

#### Type Parameters

| Type Parameter                  | Default type |
| ------------------------------- | ------------ |
| `T` _extends_ `GraphEntityBase` | -            |
| `U` _extends_ `object`          | `object`     |

#### Parameters

| Parameter | Type                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                                                                                                 |
| `options` | [`FindNeighborsOptions`](../interfaces/FindNeighborsOptions.md)&lt;new () => `T`, [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;new () => `T`&gt;, `U`&gt; |

#### Returns

`Observable`&lt;[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;[`NeighborResult`](../interfaces/NeighborResult.md)&lt;new () => `T`, [`GraphEdgeInfoType`](../type-aliases/GraphEdgeInfoType.md)&lt;`U`&gt;&gt;&gt;&gt;

---

### findOne \{#findone\}

```ts
static findOne: <T>(this, options) => Observable<T | null>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:63

Finds one entity

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                             | Description                                  |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| `this`    | new () => `T`                                                                    | -                                            |
| `options` | [`FindOneOptions`](../../rxdb/interfaces/FindOneOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`T` \| `null`&gt;

The entity instance or null wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findOne`](../../rxdb/classes/EntityBase.md#findone)

---

### findOneOrFail \{#findoneorfail\}

```ts
static findOneOrFail: <T>(this, options) => Observable<T>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:69

Finds one entity, throws when none is found

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                                         | Description                                  |
| --------- | -------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `this`    | new () => `T`                                                                                | -                                            |
| `options` | [`FindOneOrFailOptions`](../../rxdb/interfaces/FindOneOrFailOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`T`&gt;

The entity instance wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findOneOrFail`](../../rxdb/classes/EntityBase.md#findoneorfail)

---

### findPaths \{#findpaths\}

```ts
static findPaths: <T, U>(this, options) => Promise<GraphQueryResult<GraphPath<new () => T>>>;
```

Defined in: [rxdb-plugin-graph/src/GraphEntityBase.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/GraphEntityBase.ts#L98)

Finds all paths between two nodes

#### Type Parameters

| Type Parameter                  | Default type |
| ------------------------------- | ------------ |
| `T` _extends_ `GraphEntityBase` | -            |
| `U` _extends_ `object`          | `object`     |

#### Parameters

| Parameter | Type                                                                                                                                                  | Description                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                                                                                         | -                                                                       |
| `options` | [`FindPathsOptions`](../interfaces/FindPathsOptions.md)&lt;new () => `T`, [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;new () => `T`&gt;, `U`&gt; | Path query options, including the start, the end, the depth limit, etc. |

#### Returns

`Promise`&lt;[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;[`GraphPath`](../interfaces/GraphPath.md)&lt;new () => `T`&gt;&gt;&gt;

Promise of the path result

#### Example

```typescript
// Find paths between cities
City.findPaths$({
  fromId: 'beijing',
  toId: 'shanghai',
  maxDepth: 5
}).subscribe(paths => {
  paths[0].nodes.forEach(city => console.log(city.name));
  console.log(`path length: ${paths[0].length}`);
});
```

---

### findPaths$ \{#findpaths-1\}

```ts
static findPaths$: <T, U>(this, options) => Observable<GraphQueryResult<GraphPath<new () => T>>>;
```

Defined in: [rxdb-plugin-graph/src/GraphEntityBase.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/GraphEntityBase.ts#L104)

Reactive version of finding paths.

#### Type Parameters

| Type Parameter                  | Default type |
| ------------------------------- | ------------ |
| `T` _extends_ `GraphEntityBase` | -            |
| `U` _extends_ `object`          | `object`     |

#### Parameters

| Parameter | Type                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                                                                                         |
| `options` | [`FindPathsOptions`](../interfaces/FindPathsOptions.md)&lt;new () => `T`, [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;new () => `T`&gt;, `U`&gt; |

#### Returns

`Observable`&lt;[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;[`GraphPath`](../interfaces/GraphPath.md)&lt;new () => `T`&gt;&gt;&gt;

---

### get \{#get\}

```ts
static get: <T>(this, id) => Observable<T>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:57

Gets an entity by id

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type          | Description                    |
| --------- | ------------- | ------------------------------ |
| `this`    | new () => `T` | -                              |
| `id`      | `T`\[`"id"`\] | The entity's unique identifier |

#### Returns

`Observable`&lt;`T`&gt;

The entity instance wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`get`](../../rxdb/classes/EntityBase.md#get)

---

### removeEdge \{#removeedge\}

```ts
static removeEdge: <T>(this, from, to) => Promise<void>;
```

Defined in: [rxdb-plugin-graph/src/GraphEntityBase.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/GraphEntityBase.ts#L143)

Removes an edge

#### Type Parameters

| Type Parameter                  |
| ------------------------------- |
| `T` _extends_ `GraphEntityBase` |

#### Parameters

| Parameter | Type          | Description |
| --------- | ------------- | ----------- |
| `this`    | new () => `T` | -           |
| `from`    | `T`           | Source node |
| `to`      | `T`           | Target node |

#### Returns

`Promise`&lt;`void`&gt;

#### Example

```typescript
await User.removeEdge(userA, userB);
```
