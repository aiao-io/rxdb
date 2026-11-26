# GraphEdgePropertyValue

```ts
type GraphEdgePropertyValue = string | number | boolean | Date;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L15)

Edge property value type

## Remarks

Date is serialized to an ISO string on storage, and query results return ISO strings; when filtering, a Date object can be passed directly (matched internally by ISO string)
