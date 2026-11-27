---
sidebar_label: 'FindPathsOptions⟨T, U, V⟩'
---

# FindPathsOptions`<T, U, V>`

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:237](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L237)

Graph path query options (basic)

## Type Parameters

| Type Parameter                                                                                          | Default type                                                |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md)       | [`EntityType`](../../rxdb/type-aliases/EntityType.md)       |
| <a id="type-parameter-u"></a> `U`                                                                       | [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;`T`&gt;    |
| <a id="type-parameter-v"></a> `V` _extends_ [`EdgeFilterOptions`](../type-aliases/EdgeFilterOptions.md) | [`EdgeFilterOptions`](../type-aliases/EdgeFilterOptions.md) |

## Properties

### direction? \{#direction\}

```ts
direction?: "in" | "out" | "both";
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:259](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L259)

Query direction

- 'in': in-edge paths
- 'out': out-edge paths
- 'both': paths in both directions (default)

#### Default

```ts
'both';
```

---

### edgeWhere? \{#edgewhere\}

```ts
edgeWhere?: V;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:291](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L291)

Edge constraint conditions
Applied to all edges along the path

#### Example

```typescript
// Only travel on highways
edgeWhere: `{ properties: { roadType: 'highway' } }`;

// Avoid congested segments (requires weight enabled)
edgeWhere: `{ weight: { max: 10 } }`;
```

---

### fromId \{#fromid\}

```ts
fromId: EntityStaticType<T, 'idType'>;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L245)

Source node ID

---

### limit? \{#limit\}

```ts
limit?: number;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:298](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L298)

Maximum number of paths returned.

#### Default

```ts
1000;
```

#### Maximum

10000

---

### maxDepth? \{#maxdepth\}

```ts
maxDepth?: number;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L270)

Maximum search depth (to prevent over-searching)

#### Default

```ts
10;
```

#### Maximum

100

#### Remarks

Path search complexity grows exponentially with depth
Adjust this value based on the actual density of the graph

---

### toId \{#toid\}

```ts
toId: EntityStaticType<T, 'idType'>;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:250](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L250)

Target node ID

---

### where? \{#where\}

```ts
where?: U;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:276](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L276)

Node constraint conditions
Applied to all intermediate nodes along the path
