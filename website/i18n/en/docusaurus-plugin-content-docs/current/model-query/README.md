# Querying entities

Call a static query on a registered entity class. Ordinary entity queries return RxJS observables. Subscribe to follow changes, or use `firstValueFrom` to read one snapshot. This example reads the first page of open tasks using the `Todo` from [Getting Started](/getting-started/README.md).

```ts
import { firstValueFrom } from 'rxjs';

const openTodos = await firstValueFrom(
  Todo.find({
    where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] },
    orderBy: [
      { field: 'createdAt', sort: 'desc' },
      { field: 'id', sort: 'asc' }
    ],
    limit: 20,
    offset: 0
  })
);
```

| What you need                                       | Method                                              |
| --------------------------------------------------- | --------------------------------------------------- |
| One record by primary key                           | `get(id)`                                           |
| The first match, with `null` for a missing record   | `findOne(options)`                                  |
| The first match, with an error for a missing record | `findOneOrFail(options)`                            |
| An offset-based page or the full matching list      | `find(options)` or `findAll(options)`, respectively |
| A page using a cursor                               | `findByCursor(options)`                             |
| The number of matches                               | `count(options)`                                    |

The tree plugin adds observable queries such as `findAncestors` and `findDescendants`, along with their `count` counterparts. The graph plugin offers two forms. Use `await` with `findNeighbors`, `countNeighbors`, and `findPaths` for a snapshot. Subscribe to `findNeighbors$`, `countNeighbors$`, or `findPaths$` for updates.

For a list that updates when tasks are saved, see [Reactive queries](/model-query/query-realtime.md). For framework-managed subscriptions, see [Framework integration](/frameworks/README.md).
