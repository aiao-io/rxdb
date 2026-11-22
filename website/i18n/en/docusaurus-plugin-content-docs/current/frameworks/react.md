# React integration

`@aiao/rxdb-react` connects RxDB to React through a provider and reactive Hooks.

## Install

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-react
```

## Provide the database

```tsx
import { RxDBProvider } from '@aiao/rxdb-react';

export function AppRoot({ rxdb }: { rxdb: RxDB }) {
  return (
    <RxDBProvider value={rxdb}>
      <App />
    </RxDBProvider>
  );
}
```

## Subscribe to an entity query

Use the query Hooks from the package inside a component below the provider. The query result follows RxDB changes and is cleaned up with the component lifecycle.

```tsx
import { useFind } from '@aiao/rxdb-react';

export function TodoList() {
  const todos = useFind(() =>
    Todo.find({
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'createdAt', sort: 'desc' }]
    })
  );

  return <ul>{todos.map(todo => <li key={todo.id}>{todo.title}</li>)}</ul>;
}
```

See the [React API reference](../api/rxdb-react/README.md) and the runnable React example for the complete Hook set.
