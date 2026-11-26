---
sidebar_label: 'GraphQueryResult⟨T⟩'
---

# GraphQueryResult`<T>`

```ts
type GraphQueryResult<T> = T[] & object;
```

Defined in: [rxdb-plugin-graph/src/graph-repository.interface.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/graph-repository.interface.ts#L145)

Graph query array with resource truncation state.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Type Declaration

### truncated?

```ts
readonly truncated?: boolean;
```

True when the real result exceeds this limit, or the path search hits the internal resource cap.
