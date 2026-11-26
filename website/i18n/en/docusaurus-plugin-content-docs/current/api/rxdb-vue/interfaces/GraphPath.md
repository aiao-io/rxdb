---
sidebar_label: 'GraphPath⟨T⟩'
---

# GraphPath`<T>`

Defined in: rxdb-plugin-graph/dist/graph-repository.interface.d.ts:255

Graph path result

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Properties

### edges \{#edges\}

```ts
edges: object[];
```

Defined in: rxdb-plugin-graph/dist/graph-repository.interface.d.ts:264

Array of edges on the path (in order)

#### properties?

```ts
properties?:
  | GraphEdgePropertiesRecord
  | null;
```

#### sourceId

```ts
sourceId: string;
```

#### targetId

```ts
targetId: string;
```

#### weight?

```ts
weight?: number | null;
```

---

### length \{#length\}

```ts
length: number;
```

Defined in: rxdb-plugin-graph/dist/graph-repository.interface.d.ts:273

Path length (hop count)

---

### nodes \{#nodes\}

```ts
nodes: (InstanceType < T) > [];
```

Defined in: rxdb-plugin-graph/dist/graph-repository.interface.d.ts:260

Array of nodes on the path (in order)
Includes the source node and the target node

---

### totalWeight? \{#totalweight\}

```ts
totalWeight?: number;
```

Defined in: rxdb-plugin-graph/dist/graph-repository.interface.d.ts:277

Total weight (if edge weights are enabled)
