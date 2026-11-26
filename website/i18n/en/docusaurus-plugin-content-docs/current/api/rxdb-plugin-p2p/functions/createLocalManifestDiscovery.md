# createLocalManifestDiscovery()

```ts
function createLocalManifestDiscovery(store): P2PPeerDiscovery;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L48)

Creates a discovery implementation usable offline from the local manifest repository.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `store` | [`P2PManifestStore`](../classes/P2PManifestStore.md) |

## Returns

[`P2PPeerDiscovery`](../interfaces/P2PPeerDiscovery.md)
