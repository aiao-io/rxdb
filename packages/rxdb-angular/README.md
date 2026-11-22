# @aiao/rxdb-angular

Angular integration for Aiao RxDB. The package connects RxDB repositories and observables to Angular Signals, dependency injection, change detection, async initialization, infinite scrolling, persisted state, and sync state.

## Install

```bash
pnpm add @aiao/rxdb @aiao/rxdb-angular rxjs
```

Angular 22 and RxJS 7.8 are the supported baseline. The database core and the adapter remain separate dependencies.

## Provide a database

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRxDB } from '@aiao/rxdb-angular';

bootstrapApplication(AppComponent, {
  providers: [provideRxDB(database)]
});
```

`provideRxDB` accepts an `RxDB` instance, a Promise, or a factory returning either. The provider owns and destroys instances it creates from a factory or Promise. An instance supplied by the application remains application-owned.

## Consume queries

- `useGet` reads a single ID.
- `useFindOne` and `useFindOneOrFail` read the first match.
- `useFind` and `useFindAll` read matching rows.
- `useFindByCursor` reads a page.
- `useCount` counts matching rows.

Graph API: `useGraphNeighbors`, `useCountNeighbors`, and `useGraphPaths` query entities configured with the graph plugin.

```ts
import { Component } from '@angular/core';
import { useFind, useGet, useCount } from '@aiao/rxdb-angular';

@Component({
  template: `{{ todos.value().length }} todos`
})
export class TodoPage {
  readonly todos = useFind(Todo, { where: { combinator: 'and', rules: [] } });
  readonly todo = useGet(Todo, '00000000-0000-4000-8000-000000000001');
  readonly count = useCount(Todo, { where: { combinator: 'and', rules: [] } });
}
```

The Angular query APIs mirror the React hooks and Vue composables. `useAction`, `useInfiniteScroll`, `usePersistedState`, `useSyncState`, and `RxDBEntityChangeDirective` cover the corresponding interaction and lifecycle cases.

Run package tests with:

```bash
pnpm nx test rxdb-angular --run
```

Read the [English Angular guide](https://rxdb.aiao.io/en/docs/frameworks/angular) and the [Chinese mirror](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-angular/README.zh-CN.md) for the full API.
