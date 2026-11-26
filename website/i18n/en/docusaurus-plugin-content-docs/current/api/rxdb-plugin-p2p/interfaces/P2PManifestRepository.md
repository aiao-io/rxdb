# P2PManifestRepository

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L65)

The manifest repository interface for the sync layer to adapt.

## Properties

### findHolders \{#findholders\}

```ts
readonly findHolders: (contentHash) => 
  | readonly P2PManifestRecord[]
  | Promise<readonly P2PManifestRecord[]>;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L71)

All holder records of a content.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contentHash` | `string` |

#### Returns

  \| readonly [`P2PManifestRecord`](P2PManifestRecord.md)[]
  \| `Promise`&lt;readonly [`P2PManifestRecord`](P2PManifestRecord.md)[]&gt;

***

### revoke \{#revoke\}

```ts
readonly revoke: (contentHash, holderId, revokedAt?) => void | Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L69)

Revokes a holder record; `revokedAt` is the revocation moment on the holder's clock.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contentHash` | `string` |
| `holderId` | `string` |
| `revokedAt?` | `number` |

#### Returns

`void` \| `Promise`&lt;`void`&gt;

***

### upsert \{#upsert\}

```ts
readonly upsert: (record) => void | Promise<void>;
```

Defined in: [packages/rxdb-plugin-p2p/src/discovery.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/discovery.ts#L67)

Writes a holder record.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `record` | [`P2PManifestRecord`](P2PManifestRecord.md) |

#### Returns

`void` \| `Promise`&lt;`void`&gt;
