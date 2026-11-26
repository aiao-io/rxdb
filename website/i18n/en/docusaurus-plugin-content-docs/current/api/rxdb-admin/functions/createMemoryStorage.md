# createMemoryStorage()

```ts
function createMemoryStorage(initial?): StorageLike;
```

Defined in: [storage.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/storage.ts#L16)

Creates an in-memory store, for SSR, tests, or in-session persistence when storage is unavailable.

## Parameters

| Parameter  | Type                                                 | Description           |
| ---------- | ---------------------------------------------------- | --------------------- |
| `initial?` | `Readonly`&lt;`Record`&lt;`string`, `string`&gt;&gt; | The initial contents. |

## Returns

[`StorageLike`](../interfaces/StorageLike.md)

The in-memory store.
