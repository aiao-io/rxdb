# SyncProgress

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L19)

Sync progress signal

An interrupted sync (`RxDBPartialSyncError`) and a sync that "ran to completion but did nothing" cannot be told apart from counts like `pulled` / `applied` alone:

- a round that only backfilled the `remoteId` of its own pushed changes and only advanced the watermark also has `applied` equal to 0, but the write has already committed and a retry must continue from the new watermark;
- when remote changes are compacted and cancel out entirely, `pulled > 0` yet no entity data was rewritten — the undo history is still valid and must not be cleared.

The two semantics are therefore split into independent boolean signals; callers consume them by meaning rather than guessing from counts.

## Extended by

- [`PullResult`](PullResult.md)
- [`PullRepositoryResult`](PullRepositoryResult.md)
- [`SyncRepositoryResult`](SyncRepositoryResult.md)

## Properties

### historyInvalidated \{#historyinvalidated\}

```ts
historyInvalidated: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L32)

Whether remote changes rewrote local entity data

When true, the undo/redo history boundary has been invalidated and the undo history must be cleared.

---

### persistedProgress \{#persistedprogress\}

```ts
persistedProgress: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L25)

Whether any write has been persisted (watermark advancement / `remoteId` backfill / change application — any one of them)

When true, part of this sync's results will **not** be rolled back, and a retry must continue from the current watermark.
