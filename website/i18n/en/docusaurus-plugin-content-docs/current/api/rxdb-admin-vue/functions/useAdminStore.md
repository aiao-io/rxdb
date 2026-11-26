# useAdminStore()

```ts
function useAdminStore<T>(store): Readonly<Ref<T>>;
```

Defined in: [context.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-vue/src/context.ts#L24)

Subscribes to a shell store and returns a read-only ref that updates with it; auto-unsubscribes when the component unmounts (scope released).
The value is held in a `shallowRef`: snapshots in the store are immutable and need not — and should not — be deeply proxied by Vue (menu icons are component objects).

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                                       | Description                              |
| --------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| `store`   | [`ReadableStore`](../../rxdb-admin/interfaces/ReadableStore.md)&lt;`T`&gt; | Any readable store exposed by the shell. |

## Returns

`Readonly`&lt;`Ref`&lt;`T`&gt;&gt;

A read-only ref of the current value.
