# PushRepositoryResult

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:555](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L555)

Push repository result

## Properties

### compacted \{#compacted\}

```ts
compacted: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:598](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L598)

The number of changes compacted/discarded

***

### error? \{#error\}

```ts
error?: Error;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:569](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L569)

The error message when the repository sync fails

***

### failed \{#failed\}

```ts
failed: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:593](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L593)

The number of changes that failed to push

***

### failures \{#failures\}

```ts
failures: SyncFailure[];
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:619](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L619)

All repositories that failed to sync in this call (including the target repository itself), in execution order

#### Remarks

Required rather than optional: an optional field would make callers write `result.failures ?? []` as a fallback,
but "field missing" and "no failures" are two different things. Skipped by policy (`skipped`) does not count as a failure,
and does not enter this list.

***

### originalCount \{#originalcount\}

```ts
originalCount: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:604](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L604)

The original count of unpushed changes (before compaction)
Relation: originalCount = pushed + failed + rejected + compacted

***

### pushed \{#pushed\}

```ts
pushed: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:579](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L579)

The number of changes accepted (applied) by the remote (after compaction)

***

### rejected \{#rejected\}

```ts
rejected: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:588](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L588)

The number of changes rejected by the remote and already marked locally (after compaction, same convention as `pushed`)

#### Remarks

Counted only when the receipt is persisted together with the watermark; 0 when not persisted (a batch failed, the local commit failed, or it was blocked by a dependency) —
those entries count into `failed` and are re-pushed as-is next round.

***

### relatedResults? \{#relatedresults\}

```ts
relatedResults?: PushRepositoryResult[];
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:609](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L609)

The results of related repositories (when includeRelated=true)

***

### repository \{#repository\}

```ts
repository: RepositoryIdentifier;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:559](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L559)

Repository identifier

***

### skipped? \{#skipped\}

```ts
skipped?: string;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:574](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L574)

The reason the repository was skipped

***

### success? \{#success\}

```ts
success?: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:564](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L564)

Whether the repository sync succeeded
