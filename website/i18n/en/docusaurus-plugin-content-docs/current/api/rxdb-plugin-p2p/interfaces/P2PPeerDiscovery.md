# P2PPeerDiscovery

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L38)

The discovery seam callable from mDNS/TCP runtimes; browser implementations use signaling instead.

## Properties

### close? \{#close\}

```ts
readonly close?: () => void | Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L44)

Releases discovery resources.

#### Returns

`void` \| `Promise`&lt;`void`&gt;

---

### connect \{#connect\}

```ts
readonly connect: (record, signal?) => Promise<unknown>;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L42)

Connects to (probes) a holder; rejects when the record is revoked or the peer is unreachable.

#### Parameters

| Parameter | Type                                        |
| --------- | ------------------------------------------- |
| `record`  | [`P2PManifestRecord`](P2PManifestRecord.md) |
| `signal?` | `AbortSignal`                               |

#### Returns

`Promise`&lt;`unknown`&gt;

---

### discover \{#discover\}

```ts
readonly discover: (contentHash, signal?) => AsyncIterable<P2PManifestRecord>;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L40)

Lists the peers declaring that they hold a content; a record does not mean the peer is online right now.

#### Parameters

| Parameter     | Type          |
| ------------- | ------------- |
| `contentHash` | `string`      |
| `signal?`     | `AbortSignal` |

#### Returns

`AsyncIterable`&lt;[`P2PManifestRecord`](P2PManifestRecord.md)&gt;
