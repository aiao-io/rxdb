# PersistedStateRegistry

Defined in: [packages/utils/src/@browser/persisted-state.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L173)

A persistent state registry keyed by two levels: `namespace` / `name`.

## Remarks

This is the **framework-agnostic kernel** behind the three-framework `useState` / `usePersistedState`: key escaping, legacy key migration, type tag validation, the persistence semantics of `undefined`, and observability of write failures are all defined exactly once here (RVU-010). The framework side only wraps [PersistedStateEntry](../interfaces/PersistedStateEntry.md) in its own reactive container (Angular `Signal`, Vue `Ref`, React `useSyncExternalStore`).

Uses a **nested Map** with one level for namespace and one for name, so keys can never collide within a process (RAN-005).

In non-browser environments (SSR, Node) it neither reads nor writes `localStorage`; state degrades to a plain in-memory value, so server-side rendering never throws for lack of `localStorage`.

Does not listen for `storage` events yet, so it does **not sync across tabs**: writes from another tab are not reflected in this instance.

## Example

```ts
const registry = new PersistedStateRegistry({ onError: console.error });
const theme = registry.entry('my-app', 'theme', 'dark');

theme.subscribe(() => render(theme.get()));
theme.set('light'); // persists to 'my-app:theme' and notifies subscribers
```

## Constructors

### Constructor

```ts
new PersistedStateRegistry(options?): PersistedStateRegistry;
```

Defined in: [packages/utils/src/@browser/persisted-state.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L180)

#### Parameters

| Parameter  | Type                                                                              | Description                                                                         |
| ---------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `options?` | [`PersistedStateRegistryOptions`](../interfaces/PersistedStateRegistryOptions.md) | See [PersistedStateRegistryOptions](../interfaces/PersistedStateRegistryOptions.md) |

#### Returns

`PersistedStateRegistry`

## Methods

### entry() \{#entry\}

```ts
entry<T>(
   namespace,
   name,
   initialValue
): PersistedStateEntry<T>;
```

Defined in: [packages/utils/src/@browser/persisted-state.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L198)

Gets (creating if necessary) the state entry for a key.

#### Type Parameters

| Type Parameter                    | Description      |
| --------------------------------- | ---------------- |
| <a id="type-parameter-t"></a> `T` | State value type |

#### Parameters

| Parameter      | Type     | Description                                                                                                                 |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `namespace`    | `string` | Namespace; combined with `name` after each is escaped to form the persistence key                                           |
| `name`         | `string` | Key name                                                                                                                    |
| `initialValue` | `T`      | Initial value that takes effect **only on first registration**; when a value already exists on disk, the on-disk value wins |

#### Returns

[`PersistedStateEntry`](../interfaces/PersistedStateEntry.md)&lt;`T`&gt;

Always returns the **same** [PersistedStateEntry](../interfaces/PersistedStateEntry.md) object for the same `namespace + name`

#### Throws

Thrown when the same key was previously registered with a different **value type** (RAN-010)

#### Remarks

On first creation, the resolved initial value is **written to disk immediately**: this makes the "initial value as the contract" visible on disk, and lets an `undefined` initial value clean up a possibly stale legacy key.

---

### find() \{#find\}

```ts
find<T>(namespace, name):
  | PersistedStateEntry<T>
  | undefined;
```

Defined in: [packages/utils/src/@browser/persisted-state.ts:227](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L227)

Looks up a registered state entry; returns `undefined` if none.

#### Type Parameters

| Type Parameter                      | Description      |
| ----------------------------------- | ---------------- |
| <a id="type-parameter-t-1"></a> `T` | State value type |

#### Parameters

| Parameter   | Type     | Description |
| ----------- | -------- | ----------- |
| `namespace` | `string` | Namespace   |
| `name`      | `string` | Key name    |

#### Returns

\| [`PersistedStateEntry`](../interfaces/PersistedStateEntry.md)&lt;`T`&gt;
\| `undefined`

The **same** object handed out by [PersistedStateRegistry.entry](#entry) when registered, otherwise `undefined`

#### Remarks

Lookup only, no creation: does not read disk, does not register, and does not validate type tags — types are guarded by `entry()` at registration time. For callers that "have no initial value and cannot create one here": when the React binding subscribes after a hydrate commit, the key may already be registered elsewhere, and it must not re-validate the type against a stale initial value.
