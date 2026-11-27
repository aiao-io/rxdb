---
sidebar_label: 'NeighborResult⟨T, EdgeInfoType⟩'
---

# NeighborResult`<T, EdgeInfoType>`

Defined in: rxdb-plugin-graph/dist/graph-repository.interface.d.ts:100

Graph neighbor query result (basic)

## Type Parameters

| Type Parameter                                                                                    | Default type                                                 |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) | -                                                            |
| <a id="type-parameter-edgeinfotype"></a> `EdgeInfoType`                                           | [`EdgeInfo`](../../rxdb-plugin-graph/interfaces/EdgeInfo.md) |

## Properties

### edge \{#edge\}

```ts
edge: EdgeInfoType;
```

Defined in: rxdb-plugin-graph/dist/graph-repository.interface.d.ts:108

Edge information

---

### level \{#level\}

```ts
level: number;
```

Defined in: rxdb-plugin-graph/dist/graph-repository.interface.d.ts:115

Number of hops (distance from the starting node)

- 1: direct neighbor (1 hop)
- 2: 2-hop neighbor
- 3: 3-hop neighbor

---

### node \{#node\}

```ts
node: InstanceType<T>;
```

Defined in: rxdb-plugin-graph/dist/graph-repository.interface.d.ts:104

Neighbor node
