# Plugin authoring

A plugin is a factory passed to `rxdb.use()`. RxDB calls the factory with the database instance, then calls the plugin’s `install(scope)` when its dependencies are ready.

## Write a plugin that logs new Todos

Start with the database and adapter from Getting Started. Insert the following plugin before the example’s first `await rxdb.connect('wa-sqlite')`. [Getting Started](/getting-started/README.md)

```typescript
import { ENTITY_LOCAL_CREATE_EVENT, type EntityLocalCreatedEvent, type Plugin } from '@aiao/rxdb';

const logInserts: Plugin = db => ({
  name: 'logInserts',
  lifecycle: 'scoped',
  install(scope) {
    const report = (event: EntityLocalCreatedEvent) => {
      const todos = event.entities.filter(change => change.entity === 'Todo');
      if (todos.length) console.info('Todos inserted', todos.length);
    };
    scope.acquire(() => {
      db.addEventListener(ENTITY_LOCAL_CREATE_EVENT, report);
      return () => db.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, report);
    }, 'logInserts:listener');
  }
});

rxdb.use(logInserts);
```

Connect and save a new Todo. The console reports how many Todos the database inserted. After `await rxdb.disconnectAll()`, connect again and save another new Todo. You should see one message for the new insert. The first connection’s listener was removed during disconnect.

## Manage resources across connections

Each call to `install` receives a fresh `LifecycleScope`. Acquire each listener, subscription, or timer separately and return its cleanup function from `scope.acquire()`. On disconnect, the host runs those functions in reverse order. If installation throws midway, the host can release everything already registered and propagate the installation error through `connect()`.

## Declare dependencies

| The plugin needs | What to declare | When `install` runs |
| --- | --- | --- |
| Only the event listener above | Omit `inject` | During initialization, or when registered on an initialized database |
| An initialized local adapter | `inject: ['adapter:local']` | After the local adapter finishes its schema and index setup |
| An initialized remote adapter | `inject: ['adapter:remote']` | After the remote adapter is ready |
| Another plugin named `search` | `inject: ['plugin:search']` | After that plugin finishes installation |

An unmet dependency keeps the plugin pending. `connect()` can finish while that plugin is still waiting. Declare dependencies through `inject`. Calling `connect()` from inside `install()` can make the connection wait on its own completion.

Register a plugin that contributes repositories or system tables before `init()` or the first `connect()`. For system tables, the `system` property implements `RxDBSystemContribution`. RxDB reads it during `use()` so it can include those tables and migrations in database initialization.

## Contribute a plugin

Export the factory and public types from the package entry point. Test registration, a real operation, and a disconnect/reconnect cycle. If the plugin exposes UI bindings, cover the same operation in Angular, React, and Vue. Document the required adapter, setup order, and any data the plugin persists. [Contribution guide](https://github.com/aiao-io/rxdb/blob/main/CONTRIBUTING.md)
