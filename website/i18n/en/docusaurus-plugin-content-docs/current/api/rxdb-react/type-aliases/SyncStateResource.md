# SyncStateResource

```ts
type SyncStateResource = Readonly<SyncState>;
```

Defined in: [rxdb-react/src/use-sync-state.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-sync-state.ts#L21)

The sync state snapshot returned by [useSyncState](../functions/useSyncState.md) in the current render.

## Remarks

Fields map one-to-one to the core's `SyncState`, and their values are plain read-only values that can be destructured directly. `lastRejections` is the rejection list produced by the most recent round that had rejected pushes; it is not cleared by later successes and is replaced as a whole when the next round has rejections.

When the state is unchanged, the **reference is stable** (the same object is reused across renders), so it can safely go into the dependency arrays of `useEffect` / `useMemo`.

Equivalent implementations on the other two frameworks: Angular `useSyncState` (`Signal`), Vue `useSyncState` (`ComputedRef`), with identical field names and semantics — only the container shape differs.
