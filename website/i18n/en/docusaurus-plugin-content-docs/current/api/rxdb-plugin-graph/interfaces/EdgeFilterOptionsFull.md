---
sidebar_label: 'EdgeFilterOptionsFull⟨EdgeProperties⟩'
---

# EdgeFilterOptionsFull`<EdgeProperties>`

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L66)

Edge filter conditions (weight + properties)

## Extends

- [`EdgeFilterOptionsWithWeight`](EdgeFilterOptionsWithWeight.md)
- [`EdgeFilterOptionsWithProperties`](EdgeFilterOptionsWithProperties.md)&lt;`EdgeProperties`&gt;

## Type Parameters

| Type Parameter                                              | Default type                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| <a id="type-parameter-edgeproperties"></a> `EdgeProperties` | [`GraphEdgePropertiesRecord`](../type-aliases/GraphEdgePropertiesRecord.md) |

## Properties

### properties? \{#properties\}

```ts
properties?: EdgeProperties;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L60)

Edge property filter (simple key-value matching)

#### Example

```ts
{ category: 'business', type: 'partner' }
```

#### Remarks

Only equality matching is supported; no range/fuzzy queries

#### Inherited from

[`EdgeFilterOptionsWithProperties`](EdgeFilterOptionsWithProperties.md).[`properties`](EdgeFilterOptionsWithProperties.md#properties)

---

### weight? \{#weight\}

```ts
weight?: object;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L46)

Weight range filter

#### max?

```ts
max?: number;
```

#### min?

```ts
min?: number;
```

#### Example

```ts
{ min: 1, max: 10 }
```

#### Inherited from

[`EdgeFilterOptionsWithWeight`](EdgeFilterOptionsWithWeight.md).[`weight`](EdgeFilterOptionsWithWeight.md#weight)
