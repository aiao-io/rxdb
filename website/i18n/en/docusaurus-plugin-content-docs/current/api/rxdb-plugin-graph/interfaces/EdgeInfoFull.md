---
sidebar_label: 'EdgeInfoFull⟨EdgeProperties⟩'
---

# EdgeInfoFull`<EdgeProperties>`

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L95)

Edge information (weight + properties)

## Extends

- [`EdgeInfoWithWeight`](EdgeInfoWithWeight.md)
- [`EdgeInfoWithProperties`](EdgeInfoWithProperties.md)&lt;`EdgeProperties`&gt;

## Type Parameters

| Type Parameter                                              | Default type                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| <a id="type-parameter-edgeproperties"></a> `EdgeProperties` | [`GraphEdgePropertiesRecord`](../type-aliases/GraphEdgePropertiesRecord.md) |

## Properties

### direction \{#direction\}

```ts
direction: 'in' | 'out';
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L75)

#### Inherited from

[`EdgeInfoWithWeight`](EdgeInfoWithWeight.md).[`direction`](EdgeInfoWithWeight.md#direction)

---

### properties \{#properties\}

```ts
properties: EdgeProperties | null;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L89)

#### Inherited from

[`EdgeInfoWithProperties`](EdgeInfoWithProperties.md).[`properties`](EdgeInfoWithProperties.md#properties)

---

### sourceId \{#sourceid\}

```ts
sourceId: string;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L73)

#### Inherited from

[`EdgeInfoWithWeight`](EdgeInfoWithWeight.md).[`sourceId`](EdgeInfoWithWeight.md#sourceid)

---

### targetId \{#targetid\}

```ts
targetId: string;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L74)

#### Inherited from

[`EdgeInfoWithWeight`](EdgeInfoWithWeight.md).[`targetId`](EdgeInfoWithWeight.md#targetid)

---

### weight \{#weight\}

```ts
weight: number | null;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L82)

#### Inherited from

[`EdgeInfoWithWeight`](EdgeInfoWithWeight.md).[`weight`](EdgeInfoWithWeight.md#weight)
