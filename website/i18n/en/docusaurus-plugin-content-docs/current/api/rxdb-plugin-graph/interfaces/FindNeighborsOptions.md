---
sidebar_label: "FindNeighborsOptions⟨T, U, V⟩"
---

# FindNeighborsOptions`<T, U, V>`

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L153)

Graph neighbor query options (basic)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) | [`EntityType`](../../rxdb/type-aliases/EntityType.md) |
| <a id="type-parameter-u"></a> `U` | [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;`T`&gt; |
| <a id="type-parameter-v"></a> `V` *extends* [`EdgeFilterOptions`](../type-aliases/EdgeFilterOptions.md) | [`EdgeFilterOptions`](../type-aliases/EdgeFilterOptions.md) |

## Properties

### direction? \{#direction\}

```ts
direction?: "in" | "out" | "both";
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L170)

Query direction
- 'in': in-edge neighbors (nodes pointing at the current node)
- 'out': out-edge neighbors (nodes pointed to from the current node)
- 'both': neighbors in both directions (default)

#### Default

```ts
'both'
```

***

### edgeWhere? \{#edgewhere\}

```ts
edgeWhere?: V;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L224)

Edge filter conditions
Applied to the properties of connecting edges (weight, custom properties, etc.)

#### Example

```typescript
// Only query high-weight neighbors (requires weight enabled)
edgeWhere: `{ weight: { min: 5 } }`

// Only query relations of a specific category
edgeWhere: `{ properties: { category: 'business' } }`
```

***

### entityId \{#entityid\}

```ts
entityId: EntityStaticType<T, "idType">;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:161](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L161)

ID of the starting node

***

### level? \{#level\}

```ts
level?: number;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L203)

Maximum number of hops (excludes the starting node)
- 0: query no neighbors (findNeighbors returns an empty array, countNeighbors returns 0)
- 1: only direct neighbors (1 hop)
- 2: 1-hop + 2-hop neighbors
- 3: 1-hop + 2-hop + 3-hop neighbors

#### Default

```ts
1
```

#### Minimum

0

#### Maximum

100

#### Remarks

- **The result excludes the starting node itself**
- When level \< 0, it is normalized to 1
- When level \> 100, it is capped at 100 (to prevent performance issues)
- Results are deduplicated automatically (when the same node is reachable via different paths, only the shortest path is returned)

#### Example

```typescript
// Find direct friends (1 hop)
findNeighbors({ entityId: 'user1', level: 1 })
// returns: [{ node: friend1, edge: {...}, level: 1 }, ...]

// Find friends of friends (2nd-degree connections, 1 hop + 2 hops)
findNeighbors({ entityId: 'user1', level: 2 })
// returns: [
//   { node: friend1, edge: {...}, level: 1 },      // 1 hop
//   { node: friendOfFriend, edge: {...}, level: 2 } // 2 hops
// ]
```

***

### limit? \{#limit\}

```ts
limit?: number;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L231)

Maximum number of nodes returned by findNeighbors; countNeighbors ignores this field.

#### Default

```ts
1000
```

#### Maximum

10000

***

### where? \{#where\}

```ts
where?: U;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:209](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L209)

Node filter conditions
Applied to the properties of neighbor nodes
