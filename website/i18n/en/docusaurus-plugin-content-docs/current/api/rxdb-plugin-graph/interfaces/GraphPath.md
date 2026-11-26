---
sidebar_label: "GraphPath⟨T⟩"
---

# GraphPath`<T>`

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:304](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L304)

Graph path result

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Properties

### edges \{#edges\}

```ts
edges: object[];
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:314](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L314)

Edge array along the path (in order)

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

***

### length \{#length\}

```ts
length: number;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:324](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L324)

Path length (number of hops)

***

### nodes \{#nodes\}

```ts
nodes: InstanceType<T>[];
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:309](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L309)

Node array along the path (in order)
Includes the source node and the target node

***

### totalWeight? \{#totalweight\}

```ts
totalWeight?: number;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:329](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L329)

Total weight (when edge weights are enabled)
