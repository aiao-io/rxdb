# getSyncCapability()

```ts
function getSyncCapability(syncType): RepositorySyncCapability;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:190](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L190)

Reads the capabilities of a given sync type.

## Parameters

| Parameter  | Type                                                          | Description   |
| ---------- | ------------------------------------------------------------- | ------------- |
| `syncType` | [`RepositorySyncType`](../type-aliases/RepositorySyncType.md) | The sync type |

## Returns

[`RepositorySyncCapability`](../interfaces/RepositorySyncCapability.md)

The capabilities of this type in both pull and push directions.

## Example

```ts
getSyncCapability('remote'); // `{ pull: true,  push: false, offlineWrite: false }`
getSyncCapability('querycache'); // `{ pull: true,  push: false, offlineWrite: true }`
getSyncCapability('local'); // `{ pull: false, push: false, offlineWrite: false }`
```
