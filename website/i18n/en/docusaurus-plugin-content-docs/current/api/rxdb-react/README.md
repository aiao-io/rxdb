# rxdb-react

`@aiao/rxdb-react` connects the reactive repository queries of `@aiao/rxdb` to React 19.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-react react react-dom rxjs
```

## Provider

`RxDBProvider`'s `db` accepts `RxDBSource`: an instance, a `Promise`, or a factory returning either. The three framework packages accept the same union type. `db` is still **required** — when it is missing, the error must be able to point out "you did not provide a database" rather than pointing people who are using the Provider back at the Provider.

```tsx
import type { RxDB } from '@aiao/rxdb';
import { RxDBProvider } from '@aiao/rxdb-react';

interface AppProps {
  db: RxDB;
}

export function App({ db }: AppProps) {
  return (
    <RxDBProvider db={db}>
      <Routes />
    </RxDBProvider>
  );
}
```

The async forms are for scenarios like "pick the backend dynamically per runtime environment" — a static import would pull the desktop branch into the web bundle:

```tsx
// Note: a non-instance source must be a stable reference (a module-level constant or wrapped in useMemo).
// Creating a new factory on every render makes the Provider rebuild the database over and over.
const source = useMemo(() => async () => (await import('./setup-desktop')).setupDesktop(), []);

<RxDBProvider db={source}>…</RxDBProvider>;
```

There are two ways to read, differing only in "what to do when not ready":

```tsx
const database = useRxDB(); // Throws when not ready; creation failures rethrow the creation error as-is
const maybe = useRxDBOptional(); // Returns undefined when there is no Provider or it is not ready; for rendering loading states
const hasProvider = useHasRxDBProvider(); // Only answers whether a Provider exists, regardless of readiness or creation failures
```

`useRxDBOptional()`'s `undefined` cannot tell apart "no Provider" and "a Provider exists but is still resolving (or has failed)"; pair it with `useHasRxDBProvider()` when you need to branch: the former runs as an independent form (e.g. a form passing data through directly), the latter renders a loading state and intercepts operations that depend on the database.

**Lifecycle ownership: the Provider only destroys what it created.** When you pass a factory or a `Promise`, the instance is awaited by the Provider, which is responsible for calling `destroy()` on unmount; when you pass a ready instance, it belongs to the caller and the Provider does not touch it — otherwise `StrictMode`'s double mount (mount → unmount → mount) would disconnect the caller's module-level singleton, leaving a dead database that nobody reconnects. This rule is identical verbatim across all three frameworks.

**Being hidden by `<Activity>` is equivalent to a disconnect.** Hiding, like unmounting, runs effect cleanup, and the Provider cannot tell the two apart during cleanup, so it can only follow the ownership rule above and destroy the database it holds (`destroy()` is terminal; after destruction it cannot connect again). On re-show, the factory is called again and builds a new database; a `Promise` cannot be re-evaluated and would only resolve to that already-destroyed instance again — the Provider will not hand it out, and instead makes `useRxDB()` throw an error explaining why (`useRxDBOptional()` returns `undefined`). So for a Provider that may be hidden by `<Activity>`, pass a factory (each call creates a new database) or an instance you hold yourself; a factory handing back an instance the Provider has already destroyed is treated as an error too.

When `db` changes, from the first commit of the new source the subtree only ever gets what belongs to the new source: before an async source resolves, reads see not-ready — they never read the old database or the old source's creation error first.

Use `makeRxDBProvider<T>()` to create an independent Provider/hook pair when you need multiple isolated database contexts.

## Query hooks

All query hooks return `{ value, error, isLoading, isEmpty, hasValue }`. Query parameters can be passed as values directly, or as functions returning the parameters. A parameter function may be called multiple times within one render and must return structurally equal values each time; non-idempotent functions throw a `TypeError`, preventing infinite re-renders. Structurally equal inline parameters do not re-subscribe; when the parameter semantics change, the old subscription is cancelled and a new query starts.

- `useGet`
- `useFindOne`
- `useFindOneOrFail`
- `useFind`
- `useFindByCursor`
- `useFindAll`
- `useCount`
- `useGraphNeighbors`
- `useCountNeighbors`
- `useGraphPaths`

Tree query hooks (`useFindDescendants`, `useCountDescendants`, `useFindAncestors`, `useCountAncestors`) are not in this package; they are provided by [`@aiao/rxdb-plugin-tree-react`](../rxdb-plugin-tree-react/README.md).

Query failures use stale-while-error semantics: `value` keeps the last successful value, `error` holds the original `Error`, `hasValue` becomes `false`, and `isEmpty` becomes `undefined`.

## Infinite scroll

`useInfiniteScroll` loads pages through the repository's `findByCursor` and returns `{ value, error, isLoading, isEmpty, hasMore, loadMore, refresh }`.

```tsx
const todos = useInfiniteScroll(Todo, {
  where: { combinator: 'and', rules: [] },
  orderBy: [
    { field: 'createdAt', sort: 'desc' },
    `{ field: 'id', sort: 'asc' }`
  ],
  limit: 50
});
```

`loadMore()` does not re-request while loading or when there is no next page. `refresh()` cancels the existing page subscriptions and reloads from the first page.

## Async actions

`useAction` wraps an async function into an action with an in-flight state:

```tsx
const save = useAction((todo: Todo) => repository.save(todo));

return (
  <button disabled={save.isPending} onClick={() => save.execute(todo)}>
    `{save.isPending ? 'Saving…' : 'Save'}`
  </button>
);
```

`isPending` is a **concurrency counter**, not a boolean switch: it stays true while N calls are in flight, until the last one settles; the counter is decremented in `finally`, so failures reset it correctly too. Deduplication and cancellation are deliberately not implemented — repeated clicks really execute multiple times, and errors are rejected to the caller as-is.

`execute`'s function identity is stable across renders and can go directly into the dependency arrays of `useEffect` / `useCallback`; what it calls is always the function passed in the latest committed render — including when called inside the same commit's layout effects (including a parent's); suspended or discarded concurrent renders that never commit do not overwrite it.

## Persisted state

`usePersistedState` persists a piece of state to `localStorage`; the same `namespace + name` shares the same piece of state:

```tsx
const theme = usePersistedState('my-app', 'theme', 'dark');

return <button onClick={() => theme.setValue('light')}>{theme.value}</button>;
```

- The `initialValue` passed by later calls is ignored, but still participates in **type tag** validation — changing the value type for the same key throws directly instead of silently cross-typing.
- `namespace` and `name` are escaped separately in the key, so they cannot collide with each other; legacy keys containing `:` or `%` are migrated once on first read.
- It has **snapshot** semantics: mutating fields of an object in place neither re-renders nor persists; you must `setValue` as a whole. `setValue`'s identity is stable across renders.
- Subscription goes through `useSyncExternalStore`, so no torn snapshots are read under concurrent rendering or `StrictMode`.
- A write failure **does not throw**; the in-memory value updates normally, and the failure is exposed via `persistError` — that is the only way to know the data was not persisted.
- Under SSR it neither reads nor writes `localStorage`, and does not register in the in-process registry: the server snapshot is always this call's `initialValue`, sequential or concurrent requests are invisible to each other, and changing the value type for the same key across requests does not throw either; hydration aligns the server HTML with the same snapshot, and only switches to the on-disk value after commit. It does not listen to the `storage` event yet, so it does not sync across tabs.

## Live entity changes

Entities are mutable-in-place class instances whose references never change, so React's props/state comparison cannot see their field changes. `useEntityChange` connects the entity's `patches$` into the render dependencies:

```tsx
// Re-renders only after input pauses for 200ms
const live = useEntityChange(todo, { debounceTime: 200 });

return <div>{live.value?.title}</div>;
```

`debounceTime` and `auditTime` are in milliseconds and, when both are set, take effect **in series** (order `debounceTime → auditTime`); only **positive finite values** take effect: `0`, negative values, `NaN`, and `Infinity` all mean disabled, and when both are disabled patches pass through synchronously. `revision` records the number of patches received and keeps accumulating across entity switches; `error` is reset when the entity or time window switches.

## Cross-framework API comparison

Same feature, same API is a hard constraint of this repository; framework conventions allow differences in container shape and naming, but not missing capabilities:

| Capability        | React                                   | Angular                                                | Vue                                  |
| ----------------- | --------------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| Queries           | `useGet` / `useFind` / …                | Same names                                             | Same names                           |
| Infinite scroll   | `useInfiniteScroll`                     | `useInfiniteScroll`                                    | `useInfiniteScroll`                  |
| Async actions     | `useAction` → render snapshot           | `useAction` → `Signal<boolean>`                        | `useAction` → `ComputedRef<boolean>` |
| Persisted state   | `usePersistedState` → snapshot + `setValue` | `usePersistedState` / `useState` → `WritableSignal<T>` | `usePersistedState` → `Ref<T>`       |
| Live entity changes | `useEntityChange`                     | `RxDBEntityChangeDirective` (`markForCheck`)           | `useEntityChange`                    |

The time-window logic (`withTimeWindows`) and the persistence core (`PersistedStateRegistry`) live in `@aiao/utils` and are shared by all three frameworks, so their semantics cannot drift apart. Angular's `usePersistedState` is a flat-signature adaptation of the existing `useState`; it has the **same key format** as the Vue / React sides but holds its own in-memory state.

## Fileoverview

RxDB React integration package
Provides the React Hooks interface for RxDB databases

## Interfaces

| Interface | Description |
| ------ | ------ |
| [ActionResource](interfaces/ActionResource.md) | The return value of [useAction](functions/useAction.md). |
| [EntityChangeOptions](interfaces/EntityChangeOptions.md) | Time-window configuration of [useEntityChange](functions/useEntityChange.md). |
| [EntityChangeResource](interfaces/EntityChangeResource.md) | The result of bridging entity patches into React rendering. |
| [GraphPath](interfaces/GraphPath.md) | Graph path result |
| [InfiniteScrollResource](interfaces/InfiniteScrollResource.md) | - |
| [NeighborResult](interfaces/NeighborResult.md) | Graph neighbor query result (basic) |
| [PersistedState](interfaces/PersistedState.md) | The persisted state of a given `namespace + name`. |
| [ProviderProps](interfaces/ProviderProps.md) | The props of [RxDBProvider](variables/RxDBProvider.md). |
| [RxDBProviderSet](interfaces/RxDBProviderSet.md) | A set of mutually isolated RxDB Providers and read hooks. |
| [RxDBResource](interfaces/RxDBResource.md) | The resource snapshot returned by React query hooks in the current render. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [GraphQueryResult](type-aliases/GraphQueryResult.md) | Graph query array with a resource-truncation flag. |
| [RxDBProviderType](type-aliases/RxDBProviderType.md) | RxDB Provider component type. |
| [RxDBSource](type-aliases/RxDBSource.md) | Database forms accepted by `RxDBProvider`: an instance, a Promise, or a factory returning either. |
| [SyncStateResource](type-aliases/SyncStateResource.md) | The sync state snapshot returned by [useSyncState](functions/useSyncState.md) in the current render. |
| [UseOptions](type-aliases/UseOptions.md) | Option forms accepted by React query hooks. |
| [UseRxDB](type-aliases/UseRxDB.md) | Hook type that reads RxDB from an explicit parameter or the nearest Provider; throws when not ready. |
| [UseRxDBOptional](type-aliases/UseRxDBOptional.md) | Hook type that reads RxDB from an explicit parameter or the nearest Provider; returns `undefined` when not ready. |

## Variables

| Variable | Description |
| ------ | ------ |
| [RxDBProvider](variables/RxDBProvider.md) | The default RxDB Provider; `db` may be an instance, a Promise or a factory; see [RxDBSource](type-aliases/RxDBSource.md). |
| [useHasRxDBProvider](variables/useHasRxDBProvider.md) | Whether there is a nearest [RxDBProvider](variables/RxDBProvider.md) in the component tree. |
| [useRxDB](variables/useRxDB.md) | Reads the explicitly passed RxDB, or the nearest [RxDBProvider](variables/RxDBProvider.md). |
| [useRxDBOptional](variables/useRxDBOptional.md) | Reads the explicitly passed RxDB, or the nearest [RxDBProvider](variables/RxDBProvider.md), returning `undefined` when unavailable. |

## Functions

| Function | Description |
| ------ | ------ |
| [makeRxDBProvider](functions/makeRxDBProvider.md) | Creates an isolated RxDB React context and access hook. |
| [useAction](functions/useAction.md) | Wraps an async function into an action with an in-flight state. |
| [useCount](functions/useCount.md) | Counts the matching entities. |
| [useCountNeighbors](functions/useCountNeighbors.md) | Counts the neighbors of a graph entity. |
| [useEntityChange](functions/useEntityChange.md) | Bridges the entity's patch stream into React rendering so in-place mutations are reflected in the view in real time. |
| [useFind](functions/useFind.md) | Finds multiple matching entities. |
| [useFindAll](functions/useFindAll.md) | Finds all entities. |
| [useFindByCursor](functions/useFindByCursor.md) | Finds entities using cursor pagination. |
| [useFindOne](functions/useFindOne.md) | Finds the first matching entity. |
| [useFindOneOrFail](functions/useFindOneOrFail.md) | Finds the first matching entity, writing the error into the resource when the repository finds none. |
| [useGet](functions/useGet.md) | Gets a single entity by ID. |
| [useGraphNeighbors](functions/useGraphNeighbors.md) | Finds the neighbors of a graph entity. |
| [useGraphPaths](functions/useGraphPaths.md) | Finds the paths between graph entities. |
| [useInfiniteScroll](functions/useInfiniteScroll.md) | Provides infinite scroll state using RxDB cursor queries. |
| [usePersistedState](functions/usePersistedState.md) | Creates (or reuses) a namespaced state persisted to `localStorage`. |
| [useRepositoryQuery](functions/useRepositoryQuery.md) | Connects an entity static repository's Observable query into the React render lifecycle. |
| [useSyncState](functions/useSyncState.md) | Reads the current database's sync state. |
