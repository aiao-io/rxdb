# lookupSearchBackendDescriptor()

```ts
function lookupSearchBackendDescriptor(adapter): SearchBackendDescriptor | undefined;
```

Defined in: [packages/rxdb-plugin-search/src/backend/backend-registry.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/backend-registry.ts#L104)

Looks up a registry entry.

## Parameters

| Parameter | Type                    | Description  |
| --------- | ----------------------- | ------------ |
| `adapter` | `string` \| `undefined` | adapter name |

## Returns

\| [`SearchBackendDescriptor`](../interfaces/SearchBackendDescriptor.md)
\| `undefined`

Registry entry; `undefined` when not registered at all
