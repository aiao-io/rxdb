# rewriteOpfsProxyWorkerUrl()

```ts
function rewriteOpfsProxyWorkerUrl(scriptUrl, opfsProxyPath): string | URL;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L134)

Rewrites sqlite3's built-in OPFS proxy worker URL to a user-provided path.

Used for scenarios where the bundler outputs the worker script to a non-default location; non-proxy URLs are returned unchanged.

## Parameters

| Parameter       | Type              | Description                                                         |
| --------------- | ----------------- | ------------------------------------------------------------------- |
| `scriptUrl`     | `string` \| `URL` | The original worker URL (from sqlite3's internal `new Worker(...)`) |
| `opfsProxyPath` | `string`          | The user-specified replacement path                                 |

## Returns

`string` \| `URL`

The replaced URL (or the original value when it does not match)
