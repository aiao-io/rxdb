# createSearchBackend()

```ts
function createSearchBackend(id): SearchBackend;
```

Defined in: [packages/rxdb-plugin-search/src/backend/backend-registry.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/backend-registry.ts#L114)

Constructs a backend instance by backend identifier.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`SearchBackendId`](../type-aliases/SearchBackendId.md) | Backend identifier |

## Returns

[`SearchBackend`](../interfaces/SearchBackend.md)

Backend instance
