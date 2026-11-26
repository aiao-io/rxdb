# P2PManifestStore

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L163)

Local manifest repository; sync adapters can map upsert/revoke calls onto an RxDB repository.

## Constructors

### Constructor

```ts
new P2PManifestStore(): P2PManifestStore;
```

#### Returns

`P2PManifestStore`

## Accessors

### size \{#size\}

#### Get Signature

```ts
get size(): number;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L168)

The number of currently registered holder records.

##### Returns

`number`

## Methods

### findHolders() \{#findholders\}

```ts
findHolders(contentHash): readonly P2PManifestRecord[];
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L224)

All holder records (copies) of a content, ordered by `updatedAt` descending; no record is ever deleted merely because time passed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `contentHash` | `string` |

#### Returns

readonly [`P2PManifestRecord`](../interfaces/P2PManifestRecord.md)[]

***

### revoke() \{#revoke\}

```ts
revoke(
   contentHash, 
   holderId, 
   revokedAt?
): boolean;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L210)

Revokes a holder record and records a tombstone that blocks older versions arriving late via sync.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `contentHash` | `string` | - |
| `holderId` | `string` | - |
| `revokedAt?` | `number` | The revocation moment on the holder's clock; when omitted, revokes the current local record |

#### Returns

`boolean`

true when the local record existed and was deleted

#### Remarks

Only records no newer than the revocation moment are deleted (an equal moment counts as revoked, consistent with [P2PManifestStore.upsert](#upsert) blocking same-moment replays):
a late-arriving old revocation cannot delete a record the holder re-registered afterwards. Tombstones only move forward per ID, taking the larger of the existing tombstone and this revocation's version, never the local clock; out-of-order or duplicate revocations cannot resurrect older records.

***

### upsert() \{#upsert\}

```ts
upsert(record): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L180)

Writes a record that has already been authenticated by the sync service.

The application publishing a local manifest must call [P2PManifestStore.upsertForSubject](#upsertforsubject)
so that the holderId is validated before entering the sync repository. Writes older than the tombstone or an existing version are ignored.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `record` | [`P2PManifestRecord`](../interfaces/P2PManifestRecord.md) |

#### Returns

`void`

#### Throws

TypeError The record does not satisfy the content-addressing rules

***

### upsertForSubject() \{#upsertforsubject\}

```ts
upsertForSubject(record, principal): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/manifest.ts:194](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/manifest.ts#L194)

An authenticated principal writes its own holder record; forging another holderId is forbidden.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `record` | [`P2PManifestRecord`](../interfaces/P2PManifestRecord.md) |
| `principal` | [`P2PPrincipal`](../interfaces/P2PPrincipal.md) |

#### Returns

`void`

#### Throws

Error The record's holderId is not derived from that principal and device
