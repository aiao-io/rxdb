# SyncRepositoryResult

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:625](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L625)

Sync repository result.

## Extends

- [`SyncProgress`](SyncProgress.md)

## Properties

### historyInvalidated \{#historyinvalidated\}

```ts
historyInvalidated: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L32)

Whether remote changes rewrote local entity data.

When true, the undo/redo history boundary is no longer valid and the undo history must be cleared.

#### Inherited from

[`SyncProgress`](SyncProgress.md).[`historyInvalidated`](SyncProgress.md#historyinvalidated)

---

### persistedProgress \{#persistedprogress\}

```ts
persistedProgress: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L25)

Whether any write has been persisted (watermark advance / `remoteId` backfill / change application —
any one of them).

When true, part of this sync's results will **not** be rolled back, and a retry continues from the current watermark.

#### Inherited from

[`SyncProgress`](SyncProgress.md).[`persistedProgress`](SyncProgress.md#persistedprogress)

---

### pullResult \{#pullresult\}

```ts
pullResult: PullRepositoryResult;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:629](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L629)

Pull result.

---

### pushResult \{#pushresult\}

```ts
pushResult: PushRepositoryResult;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:634](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L634)

Push result.
