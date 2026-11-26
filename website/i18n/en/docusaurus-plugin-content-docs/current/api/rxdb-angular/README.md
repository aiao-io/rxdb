# rxdb-angular

The Angular framework integration library, providing RxDB support for Angular applications. Reactive data flows built on Angular Signals.

## Features

- **Angular Signals integration**: query results are exposed as Signals, fitting naturally into Angular's reactive rendering
- **Reactive query hooks**: `useGet` / `useFind` / `useFindByCursor` etc., covering base/tree/graph repository queries
- **Infinite scroll**: `useInfiniteScroll` returns a signal resource (same name and shape as React/Vue); the underlying class `InfiniteScrollingList` can also be used directly
- **Change detection directive**: `RxDBEntityChangeDirective` reflects entity edits in real time under OnPush
- **Dependency injection**: fully wired into Angular's dependency injection system via `provideRxDB`
- **Type safety**: complete TypeScript type support

## When to use

- Building an Angular application that needs a local-first database
- Needing reactive data flows that integrate seamlessly with Angular Signals
- Needing an offline-first Angular application

## Installation

```bash
npm install @aiao/rxdb @aiao/rxdb-angular
# or
pnpm add @aiao/rxdb @aiao/rxdb-angular
```

## Usage

### Registering RxDB

`provideRxDB` accepts an `RxDBSource`: an instance, a `Promise`, or a factory returning either. All three framework packages accept the same union type.

```typescript
import { provideRxDB } from '@aiao/rxdb-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    // a factory / an instance / a Promise / an async factory all work
    provideRxDB(() => rxdb)
  ]
};
```

The async form is for scenarios like "the backend is chosen dynamically per runtime environment" — a static import would pull the desktop branch into the web bundle:

```typescript
provideRxDB(async () => {
  const { setupDesktop } = await import('./setup-desktop');
  return setupDesktop();
});
```

`provideRxDB` ships with an app initializer that builds the database during bootstrap before the first frame is released, so `inject(RxDB)` in components is always synchronously available. **The initializer never rejects** — bootstrap completes even when creation fails (otherwise the window would be entirely blank, and the diagnostic UI prepared for such a failure would itself be blocked by the failure), and the original exception is left to surface at read time.

When reading outside the initializer (e.g. mid-bootstrap), which entry point to use depends on "what to do when not ready":

```typescript
import { useRxDB, useRxDBOptional } from '@aiao/rxdb-angular';

const database = useRxDB(); // equivalent to inject(RxDB): throws when not ready, rethrows the creation error as-is when creation failed
const maybe = useRxDBOptional(); // returns undefined when there is no provider or it is not ready; used for rendering loading states
```

**Lifecycle ownership: the provider only destroys what it created.** With a factory or a `Promise`, the provider owns the instance it receives and is responsible for `destroy()` when the injector is destroyed; with an already-ready instance, it belongs to the caller and the provider does not touch it — otherwise a module-level singleton could be torn down by the destruction of some child injector, with nobody reconnecting it. This rule is identical, word for word, across all three frameworks.

### Querying data

```typescript
import { Component } from '@angular/core';
import { useGet, useFind } from '@aiao/rxdb-angular';

@Component({
  selector: 'app-todo',
  template: `
    @if (todo.isLoading()) {
      <span>Loading…</span>
    } @else {
      <span>{{ todo.value()?.title }}</span>
    }
  `
})
export class TodoComponent {
  readonly todo = useGet(Todo, 'todo-1');
  readonly todos = useFind(Todo, { where: { combinator: 'and', rules: [] } });
}
```

### Infinite scroll

The recommended entry point — same name and shape as `useInfiniteScroll` on the React / Vue side, released automatically with the injection context:

```typescript
@Component({/* ... */})
export class TodoListComponent {
  // Must be called in an injection context (constructor / field initializer)
  readonly todos = useInfiniteScroll(Todo, { limit: 50 });

  next() {
    this.todos.loadMore(); // no-op while isLoading is true or hasMore is false
  }
}
```

Read the signal directly in the template:

```html
@for (todo of todos.value(); track todo.id) {
<li>{{ todo.title }}</li>
} @if (todos.isLoading()) `{ <spinner /> } @if (todos.isEmpty()) { <empty-state /> }`
```

The underlying class can also be used directly:

```typescript
@Component({/* ... */})
export class TodoListComponent {
  // Must be constructed in an injection context: the class registers a destruction hook via inject(DestroyRef)
  // and sets up an effect in the constructor — a bare new inside a plain function or service method throws NG0203.
  readonly list = new InfiniteScrollingList(inject(RxDB), Todo, { limit: 50 });
}

list.loadMore(); // load the next page
list.refresh(); // discard loaded pages and refresh from the start (no-op after the host is destroyed)
```

> The class has no public `destroy()` — cleanup is handled by `DestroyRef`, which unsubscribes all page queries automatically when the host is destroyed.
> To hold an instance outside an injection context, use `runInInjectionContext(injector, () => new InfiniteScrollingList(...))`, binding the lifecycle to that injector.

> **Breaking change (next major)**: `isLoading` / `error` / `hasMore` are narrowed from `WritableSignal` to read-only `Signal`. These three fields are part of the internal state machine — an external write of `false` into `isLoading` can bypass `loadMore`'s concurrency guard and issue duplicate page requests, and writing `true` into `hasMore` can skip the final page. State can now only change through `loadMore` / `refresh`, consistent with the "returns plain values" read-only semantics on the React side. If you relied on patterns like `todos.isLoading.set(...)`, switch to calling `loadMore()` / `refresh()`, or hold your own signal in the component.

### Real-time change detection under OnPush

Entities are in-place mutable class instances; the reference never changes, so OnPush views cannot see their field changes. `rxdbChangeDetector` wires the entity's `patches$` into `markForCheck`:

```html
<div [rxdbChangeDetector]="entity"></div>
<div [debounceTime]="200" [rxdbChangeDetector]="entity"></div>
```

`debounceTime` and `auditTime` are in milliseconds; when both are set they apply **in series** (order `debounceTime → auditTime`). Only **positive finite values** take effect: `0`, negative values, `NaN` and `Infinity` all mean disabled; when both are disabled, patches pass through synchronously.

### Async operations

```ts
const save = useAction((todo: Todo) => repository.save(todo));

save.isPending(); // Signal<boolean>
save.execute(todo);
```

`isPending` is a **concurrency counter**, not a boolean switch: it stays true while N calls are in flight and only returns to false after the last one settles; the counter is decremented in `finally`, so failures reset it correctly too. Deduplication and cancellation are deliberately not done — repeated clicks really execute multiple times, and errors bubble up to the caller as-is.

### Persisted state

`usePersistedState` and the existing curried `useState` are the **same** state, just with a flat signature:

```ts
const theme = usePersistedState('my-app', 'theme', 'dark');
theme.value.set('light'); // persisted to 'my-app:theme'

// equivalent form
const same = useState('my-app')('theme').signal('dark'); // === theme.value
```

Both share the same root registry, the same key format and the same failure semantics. The flat signature exists for cross-framework alignment: React's rules of hooks do not allow "calling a hook from a method of a returned object", so the curried form cannot be reproduced on the React side.

- Must be called in an Angular injection context.
- `initialValue` passed by later calls is ignored, but still participates in the **type tag** validation — changing the value type for the same key throws immediately.
- `namespace` and `name` are each escaped in the key, so they cannot collide; legacy keys containing `:` or `%` are migrated once on first read.
- A failed disk write **does not throw**; the signal value updates as usual and the failure is exposed via `persistError`.
- Under SSR, `localStorage` is neither read nor written; the `storage` event is not listened to yet, so state does not sync across tabs.

## Cross-framework API comparison

Same feature, same API is a hard constraint of this repository; framework conventions allow differences in container shape and naming, but not missing capabilities:

| Capability         | Angular                                                | Vue                                  | React                                       |
| ------------------ | ------------------------------------------------------ | ------------------------------------ | ------------------------------------------- |
| Query              | `useGet` / `useFind` / …                               | same name                            | same name                                   |
| Infinite scroll    | `useInfiniteScroll`                                    | `useInfiniteScroll`                  | `useInfiniteScroll`                         |
| Async operation    | `useAction` → `Signal<boolean>`                        | `useAction` → `ComputedRef<boolean>` | `useAction` → render snapshot               |
| Persisted state    | `usePersistedState` / `useState` → `WritableSignal<T>` | `usePersistedState` → `Ref<T>`       | `usePersistedState` → snapshot + `setValue` |
| Live entity change | `RxDBEntityChangeDirective` (`markForCheck`)           | `useEntityChange`                    | `useEntityChange`                           |

Time window decisions (`withTimeWindows`) live in `@aiao/utils` and are shared by all three frameworks. The persistence core of Vue / React is `@aiao/utils`'s `PersistedStateRegistry`, which has the **same key format** as Angular's root service `StateRegistry` but each holds its own in-memory state — when mixing two frameworks on the same page, on-disk data interoperates but in-memory values do not.

## Full example

See the full integration example in [dev-rxdb-angular](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-angular).

The RxDB Angular integration package — reactive database support for RxDB in the Angular framework
Provides Angular-specific reactive state management and change detection integration

## Classes

| Class                                                             | Description                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [InfiniteScrollingList](classes/InfiniteScrollingList.md)         | An infinite scrolling list based on cursor pagination.                                                                                                                                                     |
| [RxDBEntityChangeDirective](classes/RxDBEntityChangeDirective.md) | RxDB entity change directive. If you use `changeDetection: ChangeDetectionStrategy.OnPush`, changes while typing do not trigger Angular's rendering mechanism; this directive provides real-time rendering |

## Interfaces

| Interface                                                      | Description                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| [ActionResource](interfaces/ActionResource.md)                 | Return value of [useAction](functions/useAction.md).       |
| [GraphPath](interfaces/GraphPath.md)                           | Graph path result                                          |
| [InfiniteScrollResource](interfaces/InfiniteScrollResource.md) | Angular infinite scroll resource.                          |
| [NamespacedState](interfaces/NamespacedState.md)               | The state entry of a given `namespace + name`.             |
| [NeighborResult](interfaces/NeighborResult.md)                 | Graph neighbor query result (basic)                        |
| [PersistedState](interfaces/PersistedState.md)                 | The persisted state for a given `namespace + name`.        |
| [RxDBResource](interfaces/RxDBResource.md)                     | -                                                          |
| [SyncStateResource](interfaces/SyncStateResource.md)           | Return value of [useSyncState](functions/useSyncState.md). |

## Type Aliases

| Type Alias                                                     | Description                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [GraphQueryResult](type-aliases/GraphQueryResult.md)           | Graph query array with resource truncation state.                                                   |
| [InfiniteScrollOptions](type-aliases/InfiniteScrollOptions.md) | Angular infinite scroll query options or a reactive options reader.                                 |
| [RxDBSource](type-aliases/RxDBSource.md)                       | The database form accepted by `provideRxDB`: an instance, a Promise, or a factory returning either. |
| [UseOptions](type-aliases/UseOptions.md)                       | Query options: a static value or a factory function called on each evaluation.                      |

## Functions

| Function                                              | Description                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [provideRxDB](functions/provideRxDB.md)               | Configures the RxDB instance used by the Angular injector.                                     |
| [useAction](functions/useAction.md)                   | Wraps an async function into a callable action with a loading state.                           |
| [useCount](functions/useCount.md)                     | Counts entities matching the condition                                                         |
| [useCountNeighbors](functions/useCountNeighbors.md)   | Counts adjacency in a graph structure                                                          |
| [useFind](functions/useFind.md)                       | Finds multiple entities matching the condition                                                 |
| [useFindAll](functions/useFindAll.md)                 | Finds all entities                                                                             |
| [useFindByCursor](functions/useFindByCursor.md)       | Finds entities using cursor pagination                                                         |
| [useFindOne](functions/useFindOne.md)                 | Finds the first entity matching the condition                                                  |
| [useFindOneOrFail](functions/useFindOneOrFail.md)     | Finds a matching entity, throws when none is found                                             |
| [useGet](functions/useGet.md)                         | Fetches a single entity by ID                                                                  |
| [useGraphNeighbors](functions/useGraphNeighbors.md)   | Finds adjacent entities in a graph structure                                                   |
| [useGraphPaths](functions/useGraphPaths.md)           | Finds paths between two entities in a graph structure                                          |
| [useInfiniteScroll](functions/useInfiniteScroll.md)   | Creates an infinite scroll resource from the current Angular injection context.                |
| [usePersistedState](functions/usePersistedState.md)   | Creates (or reuses) a namespaced state persisted to `localStorage`.                            |
| [useRepositoryQuery](functions/useRepositoryQuery.md) | Converts an entity repository's Observable query into a lazy Angular Signal resource.          |
| [useRxDB](functions/useRxDB.md)                       | Reads the RxDB instance from the current injector.                                             |
| [useRxDBOptional](functions/useRxDBOptional.md)       | Reads the RxDB instance from the current injector, returning `undefined` when it is not ready. |
| [useState](functions/useState.md)                     | Creates a read/write entry point for persisted state under a namespace.                        |
| [useSyncState](functions/useSyncState.md)             | Reads the current database's sync state.                                                       |
