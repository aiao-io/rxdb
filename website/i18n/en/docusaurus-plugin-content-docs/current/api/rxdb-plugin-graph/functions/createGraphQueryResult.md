# createGraphQueryResult()

```ts
function createGraphQueryResult<T>(items, truncated): GraphQueryResult<T>;
```

Defined in: [rxdb-plugin-graph/src/graph-query-result.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-query-result.ts#L4)

Attaches a non-enumerable truncation state to the array while preserving the existing array comparison and serialization behavior.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter   | Type      |
| ----------- | --------- |
| `items`     | `T`[]     |
| `truncated` | `boolean` |

## Returns

[`GraphQueryResult`](../type-aliases/GraphQueryResult.md)&lt;`T`&gt;
