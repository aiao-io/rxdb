---
sidebar_label: "GraphQueryResult⟨T⟩"
---

# GraphQueryResult`<T>`

```ts
type GraphQueryResult<T> = T[] & object;
```

Defined in: rxdb-plugin-graph/dist/graph-repository.interface.d.ts:118

Graph query array with a resource-truncation flag.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Type Declaration

### truncated?

```ts
readonly truncated?: boolean;
```

True when the real result exceeds this limit, or when the path search hit an internal resource cap.
