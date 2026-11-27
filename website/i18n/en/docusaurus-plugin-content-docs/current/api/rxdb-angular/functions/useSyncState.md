# useSyncState()

```ts
function useSyncState(): SyncStateResource;
```

Defined in: [rxdb-angular/src/use-sync-state.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-sync-state.ts#L71)

Reads the current database's sync state.

## Returns

[`SyncStateResource`](../interfaces/SyncStateResource.md)

See [SyncStateResource](../interfaces/SyncStateResource.md)

## Throws

Throws when there is no `provideRxDB`, the database is not ready yet, or creation failed (same semantics as `useRxDB`)

## Example

```typescript
@Component({
  template: `
    @if (!sync.online()) {
      <span>Offline · {{ sync.pendingCount() }} pending pushes</span>
    }
  `
})
export class SyncBanner {
  readonly sync = useSyncState();
}
```

## Remarks

**Must be called in an Angular injection context** — it gets the database via `useRxDB()`, and the subscription hangs on the current `DestroyRef`, unsubscribing automatically when the injector is destroyed.

When the database cannot be obtained it **throws instead of** returning an "all fine" default: that would disguise "the panel is not connected" as "nothing pending to push" — exactly the case where it most needs to speak up.

The upstream is a stream backed by a `BehaviorSubject`, so the first read already gets the current value, making `initialValue` effectively unobservable — it still comes from the same snapshot, without introducing a second initial-value convention.
