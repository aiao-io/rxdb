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
    <RxDBProvider db={database}>
      <TodoList />
    </RxDBProvider>
  );
}
```

A provider can receive an instance, Promise, or factory through the package's `RxDBSource` contract. Provider-created instances are destroyed with the provider. Application-owned instances remain application-owned.

## Query data

- `useGet` reads a single ID.
- `useFindOne` and `useFindOneOrFail` read the first match.
- `useFind` and `useFindAll` read matching rows.
- `useFindByCursor` reads a page.
- `useCount` counts matching rows.

Graph API: `useGraphNeighbors`, `useCountNeighbors`, and `useGraphPaths` query entities configured with the graph plugin.

```tsx
import { useCount, useFind, useGet } from '@aiao/rxdb-react';

export function TodoList() {
  const todos = useFind(Todo, { where: { combinator: 'and', rules: [] } });
  const todo = useGet(Todo, '00000000-0000-4000-8000-000000000001');
  const count = useCount(Todo, { where: { combinator: 'and', rules: [] } });

  return <div>{count.value} todos</div>;
}
```

Query resources expose a current `value`, `isLoading`, `error`, `hasValue`, and `isEmpty` state. Read these properties during render. `useAction`, `useInfiniteScroll`, `usePersistedState`, `useEntityChange`, and `useSyncState` use the same lifecycle semantics as the Angular and Vue bindings.

Run package tests with:

```bash
pnpm nx test rxdb-react --run
```

Read the [English React guide](https://rxdb.aiao.io/en/docs/frameworks/react) and the [Chinese mirror](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-react/README.zh-CN.md) for the complete API.
