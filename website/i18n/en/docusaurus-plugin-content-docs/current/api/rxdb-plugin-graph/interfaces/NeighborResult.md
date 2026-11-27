---
sidebar_label: 'NeighborResult⟨T, EdgeInfoType⟩'
---

# NeighborResult`<T, EdgeInfoType>`

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L124)

Graph neighbor query result (basic)

## Type Parameters

| Type Parameter                                                                                    | Default type              |
| ------------------------------------------------------------------------------------------------- | ------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) | -                         |
| <a id="type-parameter-edgeinfotype"></a> `EdgeInfoType`                                           | [`EdgeInfo`](EdgeInfo.md) |

## Properties

### edge \{#edge\}

```ts
edge: EdgeInfoType;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L133)

Edge information

---

### level \{#level\}

```ts
level: number;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L141)

Number of hops (distance from the starting node)

- 1: direct neighbor (1 hop)
- 2: 2-hop neighbor
- 3: 3-hop neighbor

---

### node \{#node\}

```ts
node: InstanceType<T>;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L128)

Neighbor node
