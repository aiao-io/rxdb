# PullResult

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L53)

Pull operation result

## Extends

- [`SyncProgress`](SyncProgress.md)

## Properties

### applied \{#applied\}

```ts
applied: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L68)

The number of changes successfully applied locally (after compaction)

---

### compacted \{#compacted\}

```ts
compacted: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L63)

The number of changes compacted/discarded
Example: an INSERT → DELETE change is discarded

---

### conflictsDeferred \{#conflictsdeferred\}

```ts
conflictsDeferred: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L83)

The number of conflicts deferred for later handling

---

### conflictsResolved \{#conflictsresolved\}

```ts
conflictsResolved: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L78)

The number of conflicts resolved automatically

---

### failures \{#failures\}

```ts
failures: SyncFailure[];
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L90)

All repositories that failed in this pull (in repository order); an empty array when nothing failed

With multi-repository aggregation you cannot keep only the first error, otherwise the failures of the later repositories would be nowhere to be found.

---

### hasMore \{#hasmore\}

```ts
hasMore: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L73)

Whether there is more data to pull

---

### historyInvalidated \{#historyinvalidated\}

```ts
historyInvalidated: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L32)

Whether any remote change rewrote local entity data

When true, the undo/redo history boundary has been invalidated and the undo history must be cleared.

#### Inherited from

[`SyncProgress`](SyncProgress.md).[`historyInvalidated`](SyncProgress.md#historyinvalidated)

---

### persistedProgress \{#persistedprogress\}

```ts
persistedProgress: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L25)

Whether any write has already been persisted (watermark advance / `remoteId` backfill / change application — any one of them)

When true, part of this sync's results will **not** be rolled back, and a retry continues from the current watermark.

#### Inherited from

[`SyncProgress`](SyncProgress.md).[`persistedProgress`](SyncProgress.md#persistedprogress)

---

### pulled \{#pulled\}

```ts
pulled: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L57)

The number of changes pulled from the remote (before compaction)
