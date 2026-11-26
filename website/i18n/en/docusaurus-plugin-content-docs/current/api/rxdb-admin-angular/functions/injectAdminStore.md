# injectAdminStore()

```ts
function injectAdminStore<T>(store): Signal<T>;
```

Defined in: [rxdb-admin-angular/src/context.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/context.ts#L61)

Bridges a readable store of the shell into a signal: templates / `computed` depending on it recompute when the value changes; unsubscribes when the current injection context is destroyed.
Must be called in an injection context (constructor or field initializer).

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                                       | Description                              |
| --------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| `store`   | [`ReadableStore`](../../rxdb-admin/interfaces/ReadableStore.md)&lt;`T`&gt; | Any readable store exposed by the shell. |

## Returns

`Signal`&lt;`T`&gt;

Read-only signal, with the current snapshot of the store as the initial value.
