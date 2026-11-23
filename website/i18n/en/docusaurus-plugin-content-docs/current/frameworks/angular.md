# Angular integration

`@aiao/rxdb-angular` exposes Angular services, Signals, and directives for RxDB.

## Install

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-angular
```

## Provide the database

```typescript
import type { ApplicationConfig } from '@angular/core';
import { provideRxDB } from '@aiao/rxdb-angular';

export const appConfig: ApplicationConfig = {
  providers: [provideRxDB(rxdb)]
};
```

`provideRxDB` accepts an instance, a Promise, or a factory returning either value. The factory runs in the Angular injection context.

## Read reactive data

Inject `RxDB` for imperative operations and use the query helpers for Signals-backed component state.

```typescript
import { Component } from '@angular/core';
import { useFindAll } from '@aiao/rxdb-angular';

@Component({
  template: `@for (todo of todos.value(); track todo.id) {
    <p>{{ todo.title }}</p>
  }`
})
export class TodoListComponent {
  readonly todos = useFindAll(Todo, {
    where: { combinator: 'and', rules: [] }
  });
}
```

See the [Angular API reference](/api/rxdb-angular/README.md) for providers, query helpers, and lifecycle behavior.
