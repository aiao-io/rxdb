---
sidebar_label: "EdgeFilterOptionsWithProperties⟨EdgeProperties⟩"
---

# EdgeFilterOptionsWithProperties`<EdgeProperties>`

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L52)

Edge filter conditions (with properties)

## Extends

- [`EdgeFilterOptions`](../type-aliases/EdgeFilterOptions.md)

## Extended by

- [`EdgeFilterOptionsFull`](EdgeFilterOptionsFull.md)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
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
