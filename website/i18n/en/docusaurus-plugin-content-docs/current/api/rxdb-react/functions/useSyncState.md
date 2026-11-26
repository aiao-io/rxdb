# useSyncState()

```ts
function useSyncState(): SyncStateResource;
```

Defined in: [rxdb-react/src/use-sync-state.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-sync-state.ts#L51)

Reads the current database's sync state.

## Returns

[`SyncStateResource`](../type-aliases/SyncStateResource.md)

See [SyncStateResource](../type-aliases/SyncStateResource.md)

## Throws

No Provider in the component tree, the Provider has no `db`, and an async source not ready yet each throw a distinct message; when an async source fails to create, the creation error is thrown as-is (same semantics as `useRxDB`)

## Example

```tsx
const sync = useSyncState();

return sync.online ? null : <span>Offline · {sync.pendingCount} pending push</span>;
```

## Remarks

Uses `useSyncExternalStore` instead of `useState` + `useEffect`: the state source lives outside React (an RxJS stream), while the `useEffect` version renders one extra "initial value" frame after mount before switching to the real value — the panel would flash "online, 0 pending pushes" first, which is exactly the lie it must not tell. `getSnapshot` reads the object cached by the hub itself; the reference is unchanged across renders for the same state, so it causes no extra re-renders.

The third parameter (`getServerSnapshot`) reads the same snapshot as the client: the hub exists from database construction time, so there is a value to read under SSR too — no need for a separate set of server-side initial values.

When the database is unavailable it **throws instead of** returning an "everything is fine" default: that would masquerade "the panel is not connected" as "there is nothing to push" — staying silent exactly when a voice is needed most.
