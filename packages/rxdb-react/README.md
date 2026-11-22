# @aiao/rxdb-react

React 19 integration for Aiao RxDB. The package provides the database provider, reactive query hooks, graph queries, cursor infinite scrolling, async actions, persisted state, entity-change rendering, and sync state.

## Install

```bash
pnpm add @aiao/rxdb @aiao/rxdb-react rxjs react react-dom
```

## Provide a database

```tsx
import { RxDBProvider } from '@aiao/rxdb-react';

export function App() {
  return (
    <RxDBProvider database={database}>
      <TodoList />
    </RxDBProvider>
  );
}
```

A provider can receive an instance, Promise, or factory through the package's `RxDBInput` contract. Provider-created instances are destroyed with the provider. Application-owned instances remain application-owned.

## Query data

```tsx
import { useCount, useFind, useGet } from '@aiao/rxdb-react';

export function TodoList() {
  const todos = useFind(Todo, { where: { combinator: 'and', rules: [] } });
  const todo = useGet(Todo, 'todo-1');
  const count = useCount(Todo, { where: { combinator: 'and', rules: [] } });

  return <div>{count.value} todos</div>;
}
```

Query resources expose a current `value`, `isLoading`, `error`, `hasValue`, and `isEmpty` state. Keep the resource object together or use `toRefs`-style adapters supplied by the framework. `useAction`, `useInfiniteScroll`, `usePersistedState`, `useEntityChange`, and `useSyncState` use the same lifecycle semantics as the Angular and Vue bindings.

Run package tests with:

```bash
pnpm nx test rxdb-react --run
```

Read the [English React guide](https://rxdb.aiao.io/en/docs/frameworks/react) and the [Chinese mirror](README.zh-CN.md) for the complete API.
