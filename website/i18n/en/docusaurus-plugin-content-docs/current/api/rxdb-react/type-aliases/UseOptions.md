---
sidebar_label: 'UseOptions⟨T⟩'
---

# UseOptions`<T>`

```ts
type UseOptions<T> = T | (() => T);
```

Defined in: [rxdb-react/src/query-options.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/query-options.ts#L13)

Option forms accepted by React query hooks.

## Type Parameters

| Type Parameter                    | Description        |
| --------------------------------- | ------------------ |
| <a id="type-parameter-t"></a> `T` | Query option type. |

## Remarks

A factory may be evaluated multiple times within one render and must return a structurally equal result each time; otherwise the query hook throws a `TypeError` synchronously. Options are compared by content rather than by reference; legal entity cursors are projected by the query ordering fields, while other class instances, functions, `Symbol`s and other non-serializable values are rejected.
