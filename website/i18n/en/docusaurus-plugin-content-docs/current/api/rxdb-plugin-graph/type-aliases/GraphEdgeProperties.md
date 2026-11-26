---
sidebar_label: "GraphEdgeProperties⟨TFilter⟩"
---

# GraphEdgeProperties`<TFilter>`

```ts
type GraphEdgeProperties<TFilter> = "properties" extends keyof TFilter ? EdgePropsOf<TFilter> : never;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L110)

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-tfilter"></a> `TFilter` *extends* [`EdgeFilterOptions`](EdgeFilterOptions.md) |
