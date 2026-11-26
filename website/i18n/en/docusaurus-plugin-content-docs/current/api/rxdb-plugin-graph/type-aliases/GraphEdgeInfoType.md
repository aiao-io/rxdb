---
sidebar_label: 'GraphEdgeInfoType⟨TFilter⟩'
---

# GraphEdgeInfoType`<TFilter>`

```ts
type GraphEdgeInfoType<TFilter> =
  'weight' extends keyof TFilter ?
    'properties' extends keyof TFilter ?
      EdgeInfoFull<EdgePropsOf<TFilter>>
    : EdgeInfoWithWeight
  : 'properties' extends keyof TFilter ? EdgeInfoWithProperties<EdgePropsOf<TFilter>>
  : EdgeInfo;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L113)

## Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-tfilter"></a> `TFilter` _extends_ [`EdgeFilterOptions`](EdgeFilterOptions.md) |
