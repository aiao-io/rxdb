# createWebStorage()

```ts
function createWebStorage(kind, host?): StorageLike;
```

Defined in: [storage.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/storage.ts#L56)

Wraps browser storage.

## Parameters

| Parameter | Type                     | Default value | Description                               |
| --------- | ------------------------ | ------------- | ----------------------------------------- |
| `kind`    | `"session"` \| `"local"` | `undefined`   | `local` or `session`.                     |
| `host?`   | `WebStorageHost`         | `globalThis`  | The host object, `globalThis` by default. |

## Returns

[`StorageLike`](../interfaces/StorageLike.md)

The storage implementation.

## Remarks

When the host lacks the storage (SSR / Node) or accessing it itself throws (SecurityError in private mode), it degrades to an in-memory store; when an error is thrown during reads or writes (quota, permissions), reads return `null` and writes are swallowed.
