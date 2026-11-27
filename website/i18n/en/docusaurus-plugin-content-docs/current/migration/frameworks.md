# Framework binding migration

Model definitions, query semantics, and adapters are **completely identical** across the three frameworks; migration only involves replacing the UI binding layer. The same `@Entity` and `Todo.find(...)` code needs no changes.

## API comparison across the three frameworks

| Capability                   | Angular (`@aiao/rxdb-angular`)                                         | React (`@aiao/rxdb-react`)                                             | Vue (`@aiao/rxdb-vue`)                                                 |
| :--------------------------- | :--------------------------------------------------------------------- | :--------------------------------------------------------------------- | :--------------------------------------------------------------------- |
| Provide the database         | `provideRxDB(source)`                                                  | `<RxDBProvider db={source}>`                                           | `provideRxDB(source)`                                                  |
| Database shape               | `RxDBSource`                                                           | `RxDBSource`                                                           | `RxDBSource` + `Ref` / `undefined`                                     |
| Read the database (strict)   | `useRxDB()` / `inject(RxDB)`                                           | `useRxDB()`                                                            | `useRxDB()`                                                            |
| Read the database (optional) | `useRxDBOptional()`                                                    | `useRxDBOptional()`                                                    | `useRxDBOptional()` / `injectRxDB()`                                   |
| Who disconnects              | The provider only disconnects instances it created (factory / Promise) | The provider only disconnects instances it created (factory / Promise) | The provider only disconnects instances it created (factory / Promise) |
| Basic queries                | `useFind` / `useGet` …                                                 | `useFind` / `useGet` …                                                 | `useFind` / `useGet` …                                                 |
| Infinite scroll              | `useInfiniteScroll`                                                    | `useInfiniteScroll`                                                    | `useInfiniteScroll`                                                    |
| Full-text search             | `useSearch`                                                            | `useSearch`                                                            | `useSearch`                                                            |

`RxDBSource` has the same name and meaning on all three sides: `RxDB | Promise<RxDB> | (() => RxDB | Promise<RxDB>)`. The async forms exist for desktop/browser dispatch — a static `import` pulls the desktop branch into the web bundle, while `await import()` does not. Vue additionally accepts `Ref<RxDB | undefined>` and `undefined` (`RxDBInput`), a superset on that side.

The two read APIs differ only in "what happens when it is not ready": `useRxDB()` throws (rethrows the creation error when creation failed), while `useRxDBOptional()` returns `undefined` for rendering a loading state.

The query hooks share names across the three frameworks and return the same shape: `{ value, error, isLoading, isEmpty, hasValue }`.

## Migrating from React to Vue (example)

The business model is unchanged; only the component layer is replaced:

```tsx
// React
import { useFind } from '@aiao/rxdb-react';

function TodoList() {
  const { value: todos, isLoading } = useFind(Todo, {
    where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }
  });
  if (isLoading) return <p>Loading...</p>;
  return (
    <ul>
      {todos?.map(t => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  );
}
```

```vue
<!-- Vue -->
<script lang="ts" setup>
import { useFind } from '@aiao/rxdb-vue';

const { value: todos, isLoading } = useFind(Todo, {
  where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }
});
</script>

<template>
  <p v-if="isLoading">Loading...</p>
  <ul v-else>
    <li v-for="t in todos" :key="t.id">{{ t.title }}</li>
  </ul>
</template>
```

## Upgrading the binding packages: `provideRxDB` / `RxDBProvider` behavior changes

The inputs on all three sides were **relaxed** — `() => RxDB` and a ready instance are still members of `RxDBSource`, so existing call sites need no rewriting. But two **behaviors** changed, worth a look during the upgrade:

**Angular: the factory now runs before bootstrap.** Previously the factory in `provideRxDB(() => setup())` ran on the first `inject(RxDB)`; now `provideRxDB` also registers an app initializer, so the factory runs **before** bootstrap. `inject(RxDB)` remains synchronous; the difference is only that "database creation happens earlier" — if you relied on deferring it until a component first injects (for example, to wait for some runtime configuration), move that waiting into the factory itself.

Also, the app initializer only takes effect in the **root** environment injector. If `provideRxDB` sits on route-level `providers` with an async source, nobody waits for you, and `inject(RxDB)` throws `RxDB is not ready yet`; in that scenario use `useRxDBOptional()` and render the loading state yourself.

**React: the error message for "a Provider exists but `db` is empty" changed.**
`No RxDB instance found, use RxDBProvider to provide one` became `RxDBProvider received no database: …`
— the old message pointed people back at the Provider, which they were already using. `db` has always been required; this path is only reachable by bypassing type checks, so the impact is usually limited to tests that assert the old message.

**React: `disconnectAll()` is deferred by one microtask.** Instances created by the provider disconnect one tick after unmount, so StrictMode's "unmount → immediate remount" no longer hurts the instance. In tests, after `unmount()` you need `await waitFor(...)` to observe the disconnect.

## Upgrading framework major versions

- Framework bindings declare their supported framework version ranges through `peerDependencies` (see the [compatibility matrix](/compatibility.md)).
- Before upgrading Angular / React / Vue to a new major version, confirm the target version falls inside the corresponding binding package's peer range.
- All `@aiao/*` packages share a version number; when upgrading a binding package, **keep it at the same version as the core package**.

## Notes

1. Migrating frameworks requires no data move — the underlying database and adapter are unchanged.
2. All three sides require **the same features with the same API**; if you have shared cross-framework logic, only the binding-layer imports need replacing.

## See also

- Full framework guides live in the framework integration section
- [Switching adapters and migrating data](/migration/adapters.md)
