# resolveSearchBackend()

```ts
function resolveSearchBackend(adapter): SearchBackend;
```

Defined in: [packages/rxdb-plugin-search/src/backend/backend-registry.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/backend-registry.ts#L125)

Resolves the search backend for the current adapter; throws when unavailable.

## Parameters

| Parameter | Type                    | Description                                            |
| --------- | ----------------------- | ------------------------------------------------------ |
| `adapter` | `string` \| `undefined` | adapter key read from `rxdb.config.sync.local.adapter` |

## Returns

[`SearchBackend`](../interfaces/SearchBackend.md)

Backend instance

## Throws

When the adapter is unregistered or registered as `unverified`
