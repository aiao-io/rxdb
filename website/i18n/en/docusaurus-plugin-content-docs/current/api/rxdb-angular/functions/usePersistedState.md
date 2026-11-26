# usePersistedState()

```ts
function usePersistedState<T>(
   namespace, 
   name, 
   initialValue, 
   options?
): PersistedState<T>;
```

Defined in: [rxdb-angular/src/use-persisted-state.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-persisted-state.ts#L69)

Creates (or reuses) a namespaced state persisted to `localStorage`.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | State value type |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `namespace` | `string` | State namespace |
| `name` | `string` | Key name; combined with `namespace`, each escaped, to form the persistence key |
| `initialValue` | `T` | Initial value that only takes effect **on first registration**; when a value already exists on disk, the on-disk value wins |
| `options?` | `CreateSignalOptions`&lt;`T`&gt; | Options passed to Angular `signal()`, effective only on first registration |

## Returns

[`PersistedState`](../interfaces/PersistedState.md)&lt;`T`&gt;

See [PersistedState](../interfaces/PersistedState.md)

## Throws

Thrown when the same `namespace + name` was previously registered with a different **value type** (RAN-010)

## Example

```ts
const theme = usePersistedState('my-app', 'theme', 'dark');

theme.value.set('light'); // persisted to 'my-app:theme'
```

## Remarks

**Must be called in an Angular injection context** — the registry is a root service.

This is a **flat-signature adaptation** of [useState](useState.md), not a second persistence implementation: the registry, key format, migration and failure semantics are exactly the same; `usePersistedState(ns, name, init).value` and `useState(ns)(name).signal(init)` return the same signal, and the two forms can be mixed.

It exists for cross-framework signature alignment (RVU-010): React's rules of hooks do not allow "calling a hook from a method of a returned object", so the curried form of `useState(ns)(name).signal(init)` cannot be reproduced on the React side — hence all three frameworks converge on this flat signature.

Equivalent implementations across all three frameworks: Vue `usePersistedState` (`Ref`), React `usePersistedState` (snapshot + setter). The core of the Vue / React side is `@aiao/utils`'s `PersistedStateRegistry`, which has the **same key format** as this implementation but holds its own in-memory state — when mixing two frameworks on the same page, on-disk data interoperates but in-memory values do not.
