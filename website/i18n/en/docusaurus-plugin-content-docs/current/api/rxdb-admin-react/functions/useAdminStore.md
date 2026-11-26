# useAdminStore()

```ts
function useAdminStore<T>(store): T;
```

Defined in: [context.tsx:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/context.tsx#L49)

Subscribes to a shell store and returns the current snapshot; re-renders when the value changes.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                                       | Description                              |
| --------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| `store`   | [`ReadableStore`](../../rxdb-admin/interfaces/ReadableStore.md)&lt;`T`&gt; | Any readable store exposed by the shell. |

## Returns

`T`

The current value.
