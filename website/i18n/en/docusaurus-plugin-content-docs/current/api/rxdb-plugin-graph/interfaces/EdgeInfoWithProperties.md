---
sidebar_label: "EdgeInfoWithProperties⟨EdgeProperties⟩"
---

# EdgeInfoWithProperties`<EdgeProperties>`

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L88)

Edge information (with properties)

## Extends

- [`EdgeInfo`](EdgeInfo.md)

## Extended by

- [`EdgeInfoFull`](EdgeInfoFull.md)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-edgeproperties"></a> `EdgeProperties` | [`GraphEdgePropertiesRecord`](../type-aliases/GraphEdgePropertiesRecord.md) |

## Properties

### direction \{#direction\}

```ts
direction: "in" | "out";
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L75)

#### Inherited from

[`EdgeInfo`](EdgeInfo.md).[`direction`](EdgeInfo.md#direction)

***

### properties \{#properties\}

```ts
properties: EdgeProperties | null;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L89)

***

### sourceId \{#sourceid\}

```ts
sourceId: string;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L73)

#### Inherited from

[`EdgeInfo`](EdgeInfo.md).[`sourceId`](EdgeInfo.md#sourceid)

***

### targetId \{#targetid\}

```ts
targetId: string;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L74)

#### Inherited from

[`EdgeInfo`](EdgeInfo.md).[`targetId`](EdgeInfo.md#targetid)
