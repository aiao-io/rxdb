# SyncStateResource

Defined in: [rxdb-vue/src/use-sync-state.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-sync-state.ts#L18)

The return value of [useSyncState](../functions/useSyncState.md).

## Remarks

Fields map one-to-one to the core's `SyncState`, each wrapped in its own `ComputedRef`: members can be destructured safely, and when a template only reads `online`, changes to `pendingCount` do not make it re-evaluate.

Equivalent implementations on the other two frameworks: Angular `useSyncState` (`Signal`), React `useSyncState` (render snapshot), with identical field names and semantics — only the container shape differs.

## Properties

### lastConflict \{#lastconflict\}

```ts
readonly lastConflict: ComputedRef<SyncConflict | null>;
```

Defined in: [rxdb-vue/src/use-sync-state.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-sync-state.ts#L28)

The previous conflict resolution; **not** cleared by later successes — it is a historical fact.

***

### lastError \{#lasterror\}

```ts
readonly lastError: ComputedRef<Error | null>;
```

Defined in: [rxdb-vue/src/use-sync-state.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-sync-state.ts#L26)

The previous push failure; cleared after one successful round.

***

### lastRejections \{#lastrejections\}

```ts
readonly lastRejections: ComputedRef<readonly SyncRejection[]>;
```

Defined in: [rxdb-vue/src/use-sync-state.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-sync-state.ts#L30)

The rejection list produced by the most recent round that had rejected pushes; **not** cleared by later successes, and replaced as a whole when the next round has rejections.

***

### online \{#online\}

```ts
readonly online: ComputedRef<boolean>;
```

Defined in: [rxdb-vue/src/use-sync-state.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-sync-state.ts#L20)

Whether the remote is currently reachable.

***

### pendingCount \{#pendingcount\}

```ts
readonly pendingCount: ComputedRef<number>;
```

Defined in: [rxdb-vue/src/use-sync-state.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-sync-state.ts#L22)

Total changes across both push paths that have not reached the remote yet (changelog pending + QueryCache outbound).

***

### syncing \{#syncing\}

```ts
readonly syncing: ComputedRef<boolean>;
```

Defined in: [rxdb-vue/src/use-sync-state.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-sync-state.ts#L24)

Whether a push round is in progress.
