---
sidebar_label: 'IGraphRepository⟨T, V, EdgeInfoType⟩'
---

# IGraphRepository`<T, V, EdgeInfoType>`

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:335](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L335)

Graph repository interface (basic)

## Extends

- [`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

## Type Parameters

| Type Parameter                                                                                          | Default type                                                           |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md)       | -                                                                      |
| <a id="type-parameter-v"></a> `V` _extends_ [`EdgeFilterOptions`](../type-aliases/EdgeFilterOptions.md) | [`EdgeFilterOptionsFull`](EdgeFilterOptionsFull.md)                    |
| <a id="type-parameter-edgeinfotype"></a> `EdgeInfoType`                                                 | [`GraphEdgeInfoType`](../type-aliases/GraphEdgeInfoType.md)&lt;`V`&gt; |

## Methods

### addEdge() \{#addedge\}

```ts
addEdge(
   from,
   to,
   weight?,
   properties?
): Promise<void>;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:443](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L443)

Adds an edge

#### Parameters

| Parameter     | Type                                                                                    | Description                                                                  |
| ------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `from`        | `InstanceType`&lt;`T`&gt;                                                               | Source node                                                                  |
| `to`          | `InstanceType`&lt;`T`&gt;                                                               | Target node                                                                  |
| `weight?`     | `number` \| `null`                                                                      | Edge weight (requires features.graph.weight enabled in the metadata)         |
| `properties?` | \| [`GraphEdgeProperties`](../type-aliases/GraphEdgeProperties.md)&lt;`V`&gt; \| `null` | Edge properties (requires features.graph.properties enabled in the metadata) |

#### Returns

`Promise`&lt;`void`&gt;

#### Example

```typescript
await User.addEdge(userA, userB, 8, {
  category: 'colleague',
  since: '2024-01-01'
});
```

---

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

### countNeighbors() \{#countneighbors\}

```ts
countNeighbors(options): Promise<number>;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:394](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L394)

Counts neighbor nodes

#### Parameters

| Parameter | Type                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `options` | [`FindNeighborsOptions`](FindNeighborsOptions.md)&lt;`T`, [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;`T`&gt;, `V`&gt; |

#### Returns

`Promise`&lt;`number`&gt;

Neighbor count (excludes the starting node)

#### Remarks

Counting rules are the same as findNeighbors, but with better performance (no need to return full node data)

#### Example

```typescript
// Count friends
const count = await User.countNeighbors({
  entityId: 'user1',
  level: 1
});
```

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

### findNeighbors() \{#findneighbors\}

```ts
findNeighbors(options): Promise<GraphQueryResult<NeighborResult<T, EdgeInfoType>>>;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:373](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L373)

Finds neighbor nodes (with edge information)

#### Parameters

| Parameter | Type                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `options` | [`FindNeighborsOptions`](FindNeighborsOptions.md)&lt;`T`, [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;`T`&gt;, `V`&gt; |

#### Returns

`Promise`&lt;[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;[`NeighborResult`](NeighborResult.md)&lt;`T`, `EdgeInfoType`&gt;&gt;&gt;

Array of neighbor nodes; each element contains the node and edge information

#### Remarks

- The result **excludes the starting node** (traversal carries a visited path; cycles/back-edges never flow back)
- Results are deduplicated by node: when the same node is reachable via different paths, only the smallest level is kept; when multiple edges exist at the same shortest level, the edge with the smallest weight is returned (for unweighted graphs, chosen stably by edge endpoint ids)
- Default ordering: level ascending, weight ascending, node id ascending

#### Example

```typescript
// Find direct friends
const neighbors = await User.findNeighbors({
  entityId: 'user1',
  level: 1
});
// neighbors[0].node => the neighbor node
// neighbors[0].edge => `{ sourceId, targetId, direction, weight, properties }`
// neighbors[0].level => 1

// Find high-weight business partners (2nd-degree connections)
const partners = await User.findNeighbors({
  entityId: 'user1',
  level: 2,
  edgeWhere: {
    weight: { min: 5 },
    properties: `{ category: 'business' }`
  }
});
```

---

### findPaths() \{#findpaths\}

```ts
findPaths(options): Promise<GraphQueryResult<GraphPath<T>>>;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:425](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L425)

Finds all paths between two nodes

#### Parameters

| Parameter | Type                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| `options` | [`FindPathsOptions`](FindPathsOptions.md)&lt;`T`, [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;`T`&gt;, `V`&gt; |

#### Returns

`Promise`&lt;[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;[`GraphPath`](GraphPath.md)&lt;`T`&gt;&gt;&gt;

Path array, ordered by length and weight

#### Remarks

- Returns all acyclic paths (no node repeats)
- When `fromId === toId`, what is returned are **real cycles** (like `A→B→A`), without the degenerate 0-length path; the start itself does not constitute a path, so in this scenario every result has `length` ≥ 1
- Ordering rule: first by path length ascending, ties by total weight ascending (smaller weight first)
- maxDepth limits the search depth to prevent exponential blowup
- The edge array contains full edge information (direction, weight, properties)

#### Example

```typescript
// Find the shortest paths between cities
const paths = await City.findPaths({
  fromId: 'beijing',
  toId: 'shanghai',
  maxDepth: 5,
  edgeWhere: `{ properties: { roadType: 'highway' } }`
});
// paths[0] => the shortest path
// paths[0].nodes => [Beijing, Tianjin, Shanghai]
// paths[0].edges => [{ sourceId, targetId, weight, properties }, ...]
// paths[0].length => 2 (traverses 2 edges)
// paths[0].totalWeight => 500 (total weight)
```

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

### removeEdge() \{#removeedge\}

```ts
removeEdge(from, to): Promise<void>;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:459](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L459)

Removes an edge

#### Parameters

| Parameter | Type                      | Description |
| --------- | ------------------------- | ----------- |
| `from`    | `InstanceType`&lt;`T`&gt; | Source node |
| `to`      | `InstanceType`&lt;`T`&gt; | Target node |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

For undirected graphs, removes both directional edges at once

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
