# SyncStateResource

Defined in: [rxdb-angular/src/use-sync-state.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-sync-state.ts#L24)

Return value of [useSyncState](../functions/useSyncState.md).

## Remarks

Fields map one-to-one to the core's `SyncState`, each wrapped in its own `Signal`: when the template only reads `online`, a change to `pendingCount` does not make it re-evaluate.

Equivalent implementations across all three frameworks: React `useSyncState` (render snapshot), Vue `useSyncState` (`ComputedRef`); field names and semantics are exactly the same, only the container shape differs.

## Properties

### lastConflict \{#lastconflict\}

```ts
readonly lastConflict: Signal<SyncConflict | null>;
```

Defined in: [rxdb-angular/src/use-sync-state.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-sync-state.ts#L34)

The previous conflict decision; **not** cleared by later successes, it is a historical fact.

***

### lastError \{#lasterror\}

```ts
readonly lastError: Signal<Error | null>;
```

Defined in: [rxdb-angular/src/use-sync-state.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-sync-state.ts#L32)

The previous push failure; cleared after one successful round.

***

### lastRejections \{#lastrejections\}

```ts
readonly lastRejections: Signal<readonly SyncRejection[]>;
```

Defined in: [rxdb-angular/src/use-sync-state.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-sync-state.ts#L36)

The rejection list produced by the most recent round with rejected pushes; **not** cleared by later successes, replaced wholesale when the next round has rejections.

***

### online \{#online\}

```ts
readonly online: Signal<boolean>;
```

Defined in: [rxdb-angular/src/use-sync-state.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-sync-state.ts#L26)

Whether the remote is currently reachable.

***

### pendingCount \{#pendingcount\}

```ts
readonly pendingCount: Signal<number>;
```

Defined in: [rxdb-angular/src/use-sync-state.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-sync-state.ts#L28)

Changes not yet pushed to the remote, summed across both push paths (changelog pending + QueryCache outbox).

***

### syncing \{#syncing\}

```ts
readonly syncing: Signal<boolean>;
```

Defined in: [rxdb-angular/src/use-sync-state.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-sync-state.ts#L30)

Whether a push round is in progress.
