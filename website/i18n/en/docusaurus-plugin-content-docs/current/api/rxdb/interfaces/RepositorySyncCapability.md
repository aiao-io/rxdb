# RepositorySyncCapability

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L95)

The sync capabilities of a sync type

## Properties

### offlineWrite \{#offlinewrite\}

```ts
readonly offlineWrite: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L116)

Whether writes can land locally first when the remote is unreachable and be replayed after the connection recovers

#### Remarks

Orthogonal to [RepositorySyncCapability.push](#push): `querycache`'s remote contract is pure REST
(`create` / `update` / `delete` / `findByIds` / `fetchMetadata`) with no changelog
endpoints, but it has a local row cache to write to and an outbox queue to replay.

***

### pull \{#pull\}

```ts
readonly pull: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L97)

Whether pulling from the remote is possible

***

### push \{#push\}

```ts
readonly push: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L106)

Whether the changelog push pipeline can be used (`remoteAdapter.mergeChanges`)

#### Remarks

This field asks about the **pipeline**, not "whether local changes can reach the remote". For offline write push-back see
[RepositorySyncCapability.offlineWrite](#offlinewrite).
