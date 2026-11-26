# usePersistedState()

```ts
function usePersistedState<T>(namespace, name, initialValue): PersistedState<T>;
```

Defined in: [rxdb-react/src/use-persisted-state.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-persisted-state.ts#L101)

Creates (or reuses) a namespaced state persisted to `localStorage`.

## Type Parameters

| Type Parameter                    | Description      |
| --------------------------------- | ---------------- |
| <a id="type-parameter-t"></a> `T` | State value type |

## Parameters

| Parameter      | Type     | Description                                                                                                                 |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `namespace`    | `string` | State namespace                                                                                                             |
| `name`         | `string` | Key name; combined with `namespace`, each escaped, to form the persistence key                                              |
| `initialValue` | `T`      | Initial value that only takes effect **on first registration**; when a value already exists on disk, the on-disk value wins |

## Returns

[`PersistedState`](../interfaces/PersistedState.md)&lt;`T`&gt;

See [PersistedState](../interfaces/PersistedState.md)

## Throws

When the same `namespace + name` was previously registered with a different **value type**, thrown during client-side render (server-side render does not register, so no validation happens there)

## Example

```tsx
const theme = usePersistedState('my-app', 'theme', 'dark');

return <button onClick={() => theme.setValue('light')}>{theme.value}</button>;
```

## Remarks

The same `namespace + name` always maps to the same state: two components see each other, a write in one immediately re-renders the other, and neither holds a stale copy that overwrites on-disk data. `initialValue` passed by later calls is ignored, but still participates in the **type tag** validation — changing the value type for the same key throws instead of silently mixing types.

`namespace` and `name` may contain arbitrary characters: each is escaped separately in the persistence key, so they cannot collide; legacy keys containing `:` or `%` are migrated to the new key once on first read.

Subscriptions go through `useSyncExternalStore`, so no torn snapshot is ever read under concurrent rendering or `StrictMode`. Server-side rendering (`getServerSnapshot`) always returns **this call's** `initialValue`, and `persistError` is always `undefined`: `localStorage` is neither read nor written, the in-process registry is not touched (not read, not registered), consecutive or concurrent requests cannot see each other, and changing the value type for the same key across requests does not throw; within the same render, each call site of the same key renders its own initial value. Client-side hydration uses the same snapshot to align with the server HTML, and after commit switches to the registry's current value (the on-disk value or the initial value from first registration), avoiding hydration mismatches.

The `storage` event is not listened to yet, so state does **not sync across tabs**.

Equivalent implementations across all three frameworks: Angular `usePersistedState` (`WritableSignal`), Vue `usePersistedState` (`Ref`). The persistence core is the shared `@aiao/utils` `PersistedStateRegistry`, with an identical key format across all three frameworks.
