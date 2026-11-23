# Writing and deleting entities

Once the database is connected, create a `Todo` and call `save()` to insert it. Edit the same instance and call `save()` again to update its stored row. This example uses the entity from [Getting Started](/getting-started/README.md).

```ts
import { getEntityStatus } from '@aiao/rxdb';

const todo = new Todo();
todo.title = 'Review the English guide';
await todo.save();

todo.completed = true;
console.log(getEntityStatus(todo).modified);
await todo.save();
await todo.remove();
```

`getEntityStatus(todo).local` tells you whether the entity has a stored local row. `modified` tells you whether it has edits awaiting a save. Use `reset()` to discard pending edits on an instance.

| Operation                                       | Public entry point                        |
| ----------------------------------------------- | ----------------------------------------- |
| Insert or update an entity                      | `entity.save()`                           |
| Delete an entity                                | `entity.remove()`                         |
| Save several entities together                  | `rxdb.entityManager.saveMany(entities)`   |
| Remove several entities together                | `rxdb.entityManager.removeMany(entities)` |
| Reorder an entity configured with `manualOrder` | `repository.reorder(id, target)`          |

The entity manager delegates persistence to the repository and adapter. Committed changes update the observables that drive the UI. See [Reactive queries](/model-query/query-realtime.md).
