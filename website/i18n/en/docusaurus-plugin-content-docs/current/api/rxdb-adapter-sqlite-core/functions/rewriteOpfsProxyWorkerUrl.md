# rewriteOpfsProxyWorkerUrl()

```ts
function rewriteOpfsProxyWorkerUrl(scriptUrl, opfsProxyPath): string | URL;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L134)

Rewrites sqlite3's built-in OPFS proxy worker URL to a user-provided path.

Used for scenarios where the bundler outputs the worker script to a non-default location; non-proxy URLs are returned as-is.

## Parameters

| Parameter       | Type              | Description                                                     |
| --------------- | ----------------- | --------------------------------------------------------------- |
| `scriptUrl`     | `string` \| `URL` | Original worker URL (from sqlite3's internal `new Worker(...)`) |
| `opfsProxyPath` | `string`          | Alternative path specified by the user                          |

## Returns

`string` \| `URL`

The replaced URL (the original value when it does not match)
