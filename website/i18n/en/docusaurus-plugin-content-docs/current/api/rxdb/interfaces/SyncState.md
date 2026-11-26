# SyncState

Defined in: [packages/rxdb/src/sync-state.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L79)

Sync state snapshot.

## Properties

### lastConflict \{#lastconflict\}

```ts
lastConflict: SyncConflict | null;
```

Defined in: [packages/rxdb/src/sync-state.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L89)

The last conflict decision; it is not cleared by later successes — it is a historical fact.

***

### lastError \{#lasterror\}

```ts
lastError: Error | null;
```

Defined in: [packages/rxdb/src/sync-state.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L87)

The last push failure; cleared after one successful round.

***

### lastRejections \{#lastrejections\}

```ts
lastRejections: readonly SyncRejection[];
```

Defined in: [packages/rxdb/src/sync-state.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L97)

The rejection list produced by the most recent round of pushes that had rejections.

#### Remarks

Like [SyncState.lastConflict](#lastconflict), it is not cleared by later successes; when the next round has
rejections it is replaced as a whole, not merged. For the complete list across restarts, look at rows in
`RxDBChange` whose `rejectedAt` is not empty.

***

### online \{#online\}

```ts
online: boolean;
```

Defined in: [packages/rxdb/src/sync-state.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L81)

Whether the remote is currently reachable.

***

### pendingCount \{#pendingcount\}

```ts
pendingCount: number;
```

Defined in: [packages/rxdb/src/sync-state.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L83)

The number of changes across both push paths that have still not been pushed to the remote.

***

### syncing \{#syncing\}

```ts
syncing: boolean;
```

Defined in: [packages/rxdb/src/sync-state.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-state.ts#L85)

Whether a push round is in progress.
