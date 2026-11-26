# rxdb-vue

`@aiao/rxdb-vue` connects the live queries of `@aiao/rxdb` to the Vue 3 Composition API. The package provides dependency injection, reactive query hooks and cursor-based infinite scroll; it contains no UI components.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-vue rxjs vue
```

`vue >= 3.5` and `rxjs ^7.8` are peer dependencies.

## Providing the database

Call `provideRxDB` in an ancestor component that renders business components:

```vue
<script lang="ts" setup>
import { provideRxDB } from '@aiao/rxdb-vue';
import { database } from './database';
import TodoList from './TodoList.vue';

provideRxDB(database);
</script>

<template>
  <TodoList />
</template>
```

Synchronous consumers can use:

```ts
import { injectRxDB, useRxDB, useRxDBOptional } from '@aiao/rxdb-vue';

const optionalDatabase = injectRxDB(); // RxDB | undefined; with no provider there is a Vue warning in dev
const maybe = useRxDBOptional(); // Same as above, but no warning when the provider is missing — an optional read may legitimately have no provider
const database = useRxDB(); // No provider / not ready each throws a distinct message; creation failures rethrow the creation error as-is
```

### Async initialization

`provideRxDB` accepts `RxDBInput`: beyond the cross-framework `RxDBSource` (an instance, a `Promise`, or a factory returning either), Vue additionally accepts `Ref<RxDB | undefined>` and `undefined`.

The `Promise` / factory forms are for scenarios like "pick the backend dynamically per runtime environment" — a static import would pull the desktop branch into the web bundle:

```ts
provideRxDB(async () => {
  const { setupDesktop } = await import('./setup-desktop');
  return setupDesktop();
});
```

The `Ref` form is Vue-specific: the caller holds it and decides when to fill it in.

```ts
import type { RxDB } from '@aiao/rxdb';
import { provideRxDB, useRxDBRef } from '@aiao/rxdb-vue';
import { shallowRef } from 'vue';

const databaseRef = shallowRef<RxDB>();
provideRxDB(databaseRef);

const database = useRxDBRef();
// database.value updates after initialization completes
```

`injectRxDBRef()` is the optional variant; it returns `undefined` when there is no provider. Components that may legitimately lack a provider can call `injectRxDBRef(true)`, which also avoids the injection warning in dev mode. `useInfiniteScroll` waits when a provider exists but the database is still `undefined`, and loads automatically once the ref is ready.

**Lifecycle ownership: the provider only destroys what it created.** When you pass a factory or a `Promise`, the instance is awaited by the provider, which is responsible for calling `destroy()` when the scope is torn down; when you pass a ready instance or your own `Ref`, it belongs to the caller and the provider does not touch it — otherwise a module-level singleton could be disconnected by the unmount of some child component, and nobody would reconnect it. This rule is identical verbatim across all three frameworks.

## Reactive queries

The Observables returned by the entities' static query methods drive Vue reactive resources:

```ts
import { useCount, useFind, useGet } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const todo = useGet(Todo, 'todo-1');
const todos = useFind(Todo, {
  where: `{ combinator: 'and', rules: [] }`
});
const count = useCount(Todo, {
  where: `{ combinator: 'and', rules: [] }`
});
```

Each query resource exposes:

- `value`: the most recent successful result; the old value is kept while a re-query is in flight (stale-while-revalidate);
- `isLoading`: whether a query round is in progress;
- `error`: normalized `Error | undefined`;
- `hasValue`: whether `value` belongs to the **current** query conditions — it drops back to `false` as soon as a re-query starts and only becomes `true` when the new value arrives;
- `isEmpty`: whether the successful result is empty; `undefined` when no result has been returned or on error.

To judge "the current value is trustworthy", look at `hasValue`, not `value !== defaultValue`.

### Resources are reactive objects — don't destructure them directly

The basic query hooks return a `reactive` object whose fields are plain reactive properties and **not** `Ref`s. Destructuring directly only reads a one-time snapshot that never updates afterwards:

```ts
const todo = useGet(Todo, 'todo-1'); // ✅ Hold it as a whole; templates use todo.value / todo.isLoading
const { value } = toRefs(useGet(Todo, 'todo-1')); // ✅ toRefs first, then destructure
const { value } = useGet(Todo, 'todo-1'); // ❌ One-time snapshot; later values emitted by the Observable do not update it
```

`useInfiniteScroll`'s return shape is different (its members are `ComputedRef`s themselves, so destructuring is safe) — don't extrapolate between the two.

### Query parameters

Query parameters can be passed as values directly, or as `Ref`, `ComputedRef` or a getter (the `UseOptions<T>` type is exported). Parameters are compared **by content**, not by reference: mutating fields of a `reactive` object in place triggers a re-query, while swapping in a structurally equivalent new object does not re-subscribe. The cost is that options must be serializable — functions, `Symbol`s or class instances cause a `TypeError` (except cursor-pagination `after` / `before` entities, which are compared by projecting the `orderBy` fields).

When a re-query starts, `isLoading` is set to `true`, `error`/`hasValue`/`isEmpty` are reset synchronously, and `value` keeps the old value. Angular and React share the same contract.

Under SSR (no `window`) no subscription is made and the resource stays in its initial `isLoading: true` state; after client hydration, querying proceeds normally. Subscriptions are cleaned up automatically when the component unmounts.

Basic query APIs:

- `useGet`
- `useFindOne`
- `useFindOneOrFail`
- `useFind`
- `useFindByCursor`
- `useFindAll`
- `useCount`

Graph APIs: `useGraphNeighbors`, `useCountNeighbors`, `useGraphPaths`. Entities still need the corresponding RxDB graph capability installed and configured.

Tree queries (`useFindDescendants`, `useCountDescendants`, `useFindAncestors`, `useCountAncestors`) are not in this package; they are provided by [`@aiao/rxdb-plugin-tree-vue`](../rxdb-plugin-tree-vue/README.md).

## Infinite scroll

```ts
import { useInfiniteScroll } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const list = useInfiniteScroll(Todo, {
  where: { combinator: 'and', rules: [] },
  orderBy: [
    { field: 'createdAt', sort: 'desc' },
    `{ field: 'id', sort: 'desc' }`
  ],
  limit: 50
});

list.loadMore();
list.refresh();
```

`useInfiniteScroll` returns:

- `value: ComputedRef<T[]>`
- `isEmpty: ComputedRef<boolean>`
- `isLoading: ComputedRef<boolean>`
- `error: ComputedRef<Error | undefined>`
- `hasMore: ComputedRef<boolean>`
- `loadMore()` and `refresh()`

All fields are read-only `ComputedRef`s and can be destructured safely. `hasMore` is decided by the last page: it is always `false` when the page capacity is non-positive (`limit <= 0` or `NaN`), and a stream that completes without ever emitting data also converges to `false`, so automatic bottom-hitting never re-fires unboundedly. `error` passes through the underlying `Error` as-is.

The first screen loads after the component mounts; subsequent pages automatically carry the last entity of the previous page as `after`. When the options change or the asynchronously provided database changes, the old pagination subscription is cleaned up and reloading starts from the first page. Live Observables of already-loaded pages may keep updating their page, but only the latest pagination request ends the global loading or updates `hasMore`.

## Async actions

`useAction` wraps an async function into an action with an in-flight state:

```vue
<script lang="ts" setup>
import { useAction } from '@aiao/rxdb-vue';

const save = useAction((todo: Todo) => repository.save(todo));
</script>

<template>
  <button :disabled="save.isPending.value" @click="save.execute(todo)">
    `{{ save.isPending.value ? 'Saving…' : 'Save' }}`
  </button>
</template>
```

`isPending` is a **concurrency counter**, not a boolean switch: it stays true while N calls are in flight, until the last one settles; the counter is decremented in `finally`, so failures reset it correctly too. Deduplication and cancellation are deliberately not implemented — repeated clicks really execute multiple times, and errors are rejected to the caller as-is.

## Persisted state

`usePersistedState` persists a piece of state to `localStorage`; the same `namespace + name` always returns the same `Ref`:

```ts
import { usePersistedState } from '@aiao/rxdb-vue';

const theme = usePersistedState('my-app', 'theme', 'dark');

theme.value.value = 'light'; // Immediately persisted to 'my-app:theme'
```

- The `initialValue` passed by later calls is ignored, but still participates in **type tag** validation — changing the value type for the same key throws directly instead of silently cross-typing.
- `namespace` and `name` are escaped separately in the key, so they cannot collide with each other; legacy keys containing `:` or `%` are migrated once on first read.
- It has `shallowRef` semantics: mutating fields of an object in place triggers neither reactivity nor persistence; you must assign a new value as a whole.
- A write failure **does not throw**; the in-memory value updates normally, and the failure is exposed via `persistError` — that is the only way to know the data was not persisted.
- Under SSR it neither reads nor writes `localStorage`, degrading to a pure in-memory value isolated per request (inside setup or `app.runWithContext`): the same key is shared within one request and invisible across requests. It does not listen to the `storage` event yet, so it does not sync across tabs.
- On the client, the disk value is read at setup time, so the first frame of hydration is the on-disk value: if it differs from the server-rendered `initialValue`, Vue reports a hydration mismatch and patches the DOM to the client value. To keep the first screen consistent with the server HTML, defer rendering that depends on this value until after `onMounted`, or add `data-allow-mismatch` (Vue 3.5+) to the corresponding node.

## Live entity changes

Entities are mutable-in-place class instances whose references never change, so Vue's reactivity system cannot see their field changes. `useEntityChange` connects the entity's `patches$` into the render dependencies:

```vue
<script lang="ts" setup>
import { useEntityChange } from '@aiao/rxdb-vue';

const props = defineProps<{ todo: Todo }>();
// Re-renders only after input pauses for 200ms; destructure value into a top-level Ref so the template auto-unwraps it
const { value: todo } = useEntityChange(() => props.todo, { debounceTime: 200 });
</script>

<template>
  <div>{{ todo?.title }}</div>
</template>
```

Templates must read the entity through the returned `value` (destructured into the top-level `todo` in the example above); reading fields of the original instance directly does not re-render. The return value is a plain object, so without destructuring you must write `live.value.value?.title`: templates only auto-unwrap top-level `Ref`s, and `live.value?.title` reads the `Ref` itself, leaving the title always empty. `debounceTime` and `auditTime` are in milliseconds and, when both are set, take effect **in series** (order `debounceTime → auditTime`); only **positive finite values** take effect: `0`, negative values, `NaN`, and `Infinity` all mean disabled, and when both are disabled patches pass through synchronously. Both fields accept reactive inputs.

## Cross-framework API comparison

Same feature, same API is a hard constraint of this repository; framework conventions allow differences in container shape and naming, but not missing capabilities:

| Capability        | Vue                                  | Angular                                                | React                                   |
| ----------------- | ------------------------------------ | ------------------------------------------------------ | --------------------------------------- |
| Queries           | `useGet` / `useFind` / …             | Same names                                             | Same names                              |
| Infinite scroll   | `useInfiniteScroll`                  | `useInfiniteScroll`                                    | `useInfiniteScroll`                     |
| Async actions     | `useAction` → `ComputedRef<boolean>` | `useAction` → `Signal<boolean>`                        | `useAction` → render snapshot           |
| Persisted state   | `usePersistedState` → `Ref<T>`       | `usePersistedState` / `useState` → `WritableSignal<T>` | `usePersistedState` → snapshot + `setValue` |
| Live entity changes | `useEntityChange`                  | `RxDBEntityChangeDirective` (`markForCheck`)           | `useEntityChange`                       |

The time-window logic (`withTimeWindows`) and the persistence core (`PersistedStateRegistry`) live in `@aiao/utils` and are shared by all three frameworks, so their semantics cannot drift apart. Angular's `usePersistedState` is a flat-signature adaptation of the existing `useState`; it has the **same key format** as the Vue / React sides but holds its own in-memory state.

## Complete example

`apps/dev-rxdb-vue` in the repository shows the full integration.

## Fileoverview

RxDB Vue integration package
Provides the Vue 3 Composition API interface for RxDB databases

## Interfaces

| Interface | Description |
| ------ | ------ |
| [ActionResource](interfaces/ActionResource.md) | The wrapped async action. |
| [EntityChangeOptions](interfaces/EntityChangeOptions.md) | Time-window configuration of [useEntityChange](functions/useEntityChange.md). |
| [EntityChangeResource](interfaces/EntityChangeResource.md) | The result of bridging entity patches into Vue's reactivity system. |
| [GraphPath](interfaces/GraphPath.md) | Graph path result |
| [InfiniteScrollResource](interfaces/InfiniteScrollResource.md) | Infinite scroll resource. |
| [NeighborResult](interfaces/NeighborResult.md) | Graph neighbor query result (basic) |
| [PersistedState](interfaces/PersistedState.md) | The persisted state of a given `namespace + name`. |
| [RxDBDependencyInjection](interfaces/RxDBDependencyInjection.md) | A set of mutually isolated providers / injectors produced by [makeRxDBDependencyInjector](functions/makeRxDBDependencyInjector.md). |
| [RxDBResource](interfaces/RxDBResource.md) | The reactive resource returned by the basic query hooks. |
| [SyncStateResource](interfaces/SyncStateResource.md) | The return value of [useSyncState](functions/useSyncState.md). |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [GraphQueryResult](type-aliases/GraphQueryResult.md) | Graph query array with a resource-truncation flag. |
| [RxDBInput](type-aliases/RxDBInput.md) | Database forms accepted by `provideRxDB` (Vue superset). |
| [RxDBRef](type-aliases/RxDBRef.md) | The read-only database reference returned by the injector; `undefined` means the database is not ready yet. |
| [RxDBSource](type-aliases/RxDBSource.md) | Database forms accepted by `provideRxDB`: an instance, a Promise, or a factory returning either. |
| [UseOptions](type-aliases/UseOptions.md) | Input forms of query options: a constant, a getter, a `Ref` or a `ComputedRef`. |

## Variables

| Variable | Description |
| ------ | ------ |
| [injectRxDB](variables/injectRxDB.md) | - |
| [injectRxDBRef](variables/injectRxDBRef.md) | - |
| [provideRxDB](variables/provideRxDB.md) | - |

## Functions

| Function | Description |
| ------ | ------ |
| [makeRxDBDependencyInjector](functions/makeRxDBDependencyInjector.md) | Creates a set of type-safe RxDB Vue dependency injection functions. |
| [useAction](functions/useAction.md) | Wraps an async function into a callable action with a loading state. |
| [useCount](functions/useCount.md) | Counts the entities matching the condition |
| [useCountNeighbors](functions/useCountNeighbors.md) | Counts the neighbor entities in a graph structure |
| [useEntityChange](functions/useEntityChange.md) | Bridges the entity's patch stream into Vue's reactivity system so in-place mutations are reflected in the view in real time. |
| [useFind](functions/useFind.md) | Finds the entities matching the condition |
| [useFindAll](functions/useFindAll.md) | Finds all entities |
| [useFindByCursor](functions/useFindByCursor.md) | Finds entities using cursor pagination |
| [useFindOne](functions/useFindOne.md) | Finds a single entity matching the condition |
| [useFindOneOrFail](functions/useFindOneOrFail.md) | Finds a single entity, throws if not found |
| [useGet](functions/useGet.md) | Gets a single entity by ID |
| [useGraphNeighbors](functions/useGraphNeighbors.md) | Finds the neighbor entities in a graph structure |
| [useGraphPaths](functions/useGraphPaths.md) | Finds the paths between two entities in a graph |
| [useInfiniteScroll](functions/useInfiniteScroll.md) | Infinite scroll hook for cursor pagination. |
| [usePersistedState](functions/usePersistedState.md) | Creates (or reuses) a namespaced state persisted to `localStorage`. |
| [useRepositoryQuery](functions/useRepositoryQuery.md) | The core hook implementation for RxDB repository queries, managing reactive subscriptions and state updates. |
| [useRxDB](functions/useRxDB.md) | Gets the current ready RxDB instance. |
| [useRxDBOptional](functions/useRxDBOptional.md) | Gets the current ready RxDB instance, returning `undefined` when unavailable. |
| [useRxDBRef](functions/useRxDBRef.md) | Gets the provided reactive RxDB reference. |
| [useSyncState](functions/useSyncState.md) | Reads the current database's sync state. |
