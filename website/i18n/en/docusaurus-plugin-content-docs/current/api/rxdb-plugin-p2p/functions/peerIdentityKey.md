# peerIdentityKey()

```ts
function peerIdentityKey(identity): string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/identity.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/identity.ts#L20)

The stable key of an identity, used for per-peer registration and deduplication; the key differs whenever the user, device or instance differs.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `identity` | [`P2PPeerIdentity`](../interfaces/P2PPeerIdentity.md) |

## Returns

`string`
