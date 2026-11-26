# PullRepositoryResult

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:485](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L485)

Pull repository result.

## Extends

- [`SyncProgress`](SyncProgress.md)

## Properties

### applied \{#applied\}

```ts
applied: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:519](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L519)

The number of changes successfully applied locally (after compaction).

***

### compacted \{#compacted\}

```ts
compacted: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:514](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L514)

The number of changes compacted/discarded.

***

### conflictsDeferred \{#conflictsdeferred\}

```ts
conflictsDeferred: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:534](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L534)

The number of conflicts deferred for manual handling.

***

### conflictsResolved \{#conflictsresolved\}

```ts
conflictsResolved: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:529](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L529)

The number of automatically resolved conflicts.

***

### error? \{#error\}

```ts
error?: Error;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:499](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L499)

The error when the repository sync failed.

***

### failures \{#failures\}

```ts
failures: SyncFailure[];
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:549](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L549)

All repositories whose sync failed in this call (including the target repository itself), in execution order.

#### Remarks

Required rather than optional: an optional field would make callers write `result.failures ?? []` as a
fallback, but "the field is missing" and "nothing failed" are two different things. Being skipped by strategy
(`skipped`) does not count as a failure and does not enter this list.

***

### hasMore \{#hasmore\}

```ts
hasMore: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:524](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L524)

Whether there are more changes to pull.

***

### historyInvalidated \{#historyinvalidated\}

```ts
historyInvalidated: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L32)

Whether remote changes rewrote local entity data.

When true, the undo/redo history boundary is no longer valid and the undo history must be cleared.

#### Inherited from

[`SyncProgress`](SyncProgress.md).[`historyInvalidated`](SyncProgress.md#historyinvalidated)

***

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

***

### pulled \{#pulled\}

```ts
pulled: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:509](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L509)

The number of changes pulled from the remote (before compaction).

***

### relatedResults? \{#relatedresults\}

```ts
relatedResults?: PullRepositoryResult[];
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:539](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L539)

Results of the related repositories (when includeRelated=true).

***

### repository \{#repository\}

```ts
repository: RepositoryIdentifier;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:489](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L489)

Repository identifier.

***

### skipped? \{#skipped\}

```ts
skipped?: string;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:504](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L504)

The reason the repository was skipped.

***

### success? \{#success\}

```ts
success?: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:494](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L494)

Whether the repository sync succeeded.
