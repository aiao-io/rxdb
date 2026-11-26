# PushResult

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L96)

Push operation result

## Properties

### compacted \{#compacted\}

```ts
compacted: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L119)

The number of changes compacted/discarded
For example: INSERT → DELETE changes are discarded

***

### failed \{#failed\}

```ts
failed: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L113)

The number of changes that failed to push

***

### failures \{#failures\}

```ts
failures: SyncFailure[];
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L134)

All repositories that failed in this push (in repository order); an empty array when nothing failed

Same convention as [PullResult.failures](PullResult.md#failures): in multi-repository aggregation neither keep only the first error,
nor convert "one repository failed" into `failed += 1` — the unit of `failed` is **change entries**,
and mixing repository counts into it directly breaks `originalCount = pushed + failed + rejected + compacted`.

***

### originalCount \{#originalcount\}

```ts
originalCount: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L125)

The original change count before compaction
Relation: originalCount = pushed + failed + rejected + compacted

***

### pushed \{#pushed\}

```ts
pushed: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L100)

The number of changes accepted (applied) by the remote (after compaction)

***

### rejected \{#rejected\}

```ts
rejected: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L108)

The number of changes rejected by the remote and already marked locally (after compaction, same convention as `pushed`)

#### Remarks

Rejection is terminal: these changes have crossed the watermark and will not be pushed again; see `SyncState.lastRejections` for details.
