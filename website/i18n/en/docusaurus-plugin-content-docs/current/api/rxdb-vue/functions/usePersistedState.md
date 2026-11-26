# usePersistedState()

```ts
function usePersistedState<T>(
   namespace, 
   name, 
   initialValue
): PersistedState<T>;
```

Defined in: [rxdb-vue/src/use-persisted-state.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-persisted-state.ts#L150)

Creates (or reuses) a namespaced state persisted to `localStorage`.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | State value type |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `namespace` | `string` | State namespace |
| `name` | `string` | Key name; combined with `namespace` (each escaped separately) to form the persistence key |
| `initialValue` | `T` | Initial value that only takes effect **on first registration**; when a value already exists on disk, the on-disk value wins |

## Returns

[`PersistedState`](../interfaces/PersistedState.md)&lt;`T`&gt;

See [PersistedState](../interfaces/PersistedState.md)

## Throws

Throws when the same `namespace + name` was previously registered with a different **value type**

## Example

```ts
const theme = usePersistedState('my-app', 'theme', 'dark');

theme.value.value = 'light'; // Immediately persisted to 'my-app:theme'
```

## Remarks

The same `namespace + name` always returns the same piece of state: two call sites see each other, and neither holds a stale copy that overwrites the other's on-disk data. The `initialValue` passed by later calls is ignored, but still participates in **type tag** validation — changing the value type for the same key throws directly instead of silently cross-typing.

`namespace` and `name` may contain arbitrary characters: each is escaped separately in the persistence key, so they cannot collide with each other; legacy keys containing `:` or `%` are migrated once to the new key on first read.

In non-browser environments (SSR) it neither reads nor writes `localStorage`; the state degrades to a pure in-memory value and never throws. On the client, the on-disk value is restored at setup time, so the first frame of hydration is the on-disk value: if it differs from the server-rendered `initialValue`, Vue reports a hydration mismatch and patches the DOM to the client value. To keep the first screen consistent with the server HTML, defer rendering that depends on this value until after `onMounted`, or add `data-allow-mismatch` (Vue 3.5+) to the corresponding node. The React side aligns first via `getServerSnapshot` and then switches; the same cannot be done here — the same key is always the same `Ref`, so a per-call-site hydration snapshot cannot be provided. During server rendering (inside setup or `app.runWithContext`) state is isolated per request: the same key is shared within one request and invisible across sequential or concurrent requests; calling outside these two contexts yields process-level state, so the server should not put request-related values there.

It does not listen to the `storage` event yet, so it does **not sync across tabs**.

Equivalent implementations on the other two frameworks: Angular `usePersistedState` (`WritableSignal`), React `usePersistedState` (snapshot + setter). The persistence core is the shared `@aiao/utils` `PersistedStateRegistry`, with the key format identical across all three frameworks.
