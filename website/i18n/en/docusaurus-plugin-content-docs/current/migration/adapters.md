# Switching adapters and migrating data

Entity and query semantics in Aiao are decoupled from the storage backend: the same entity definitions run on different adapters. Switching an adapter mainly means **replacing the adapter registration and the `connect` target**; to keep existing data, move it between the two database instances once.

## Switching the backend only (no data move)

If the old data can be discarded or re-synced from a remote, just replace the adapter registration:

```typescript
// Before: wa-sqlite
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

// After: PGlite
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { PGlite } from '@electric-sql/pglite';

const rxdb = new RxDB({ dbName: 'myapp', entities: [Todo] });

rxdb.adapter('pglite', async db => {
  const pg = await PGlite.create({ dataDir: `idb://rxdb-${db.dbName}` });
  return new RxDBAdapterPGlite(db, pg);
});

await rxdb.connect('pglite');
```

## Migrating with data preserved

Move data between the two database instances using the public query and write APIs:

```typescript
import { firstValueFrom } from 'rxjs';

// 1. Connect the old database (source)
const source = new RxDB({ dbName: 'myapp', entities: [Todo] });
source.adapter('wa-sqlite' /* ... */);
await source.connect('wa-sqlite');

// 2. Read all data from the source database
const todos = await firstValueFrom(Todo.find({}));

// 3. Connect the new database (target) under a different dbName to avoid a conflict with the source
const target = new RxDB({ dbName: 'myapp-pglite', entities: [Todo] });
target.adapter('pglite' /* ... */);
await target.connect('pglite');

// 4. Write into the target database
for (const todo of todos) {
  const copy = new Todo();
  Object.assign(copy, todo);
  await copy.save();
}

// 5. After verifying the counts match, disconnect the source
await source.disconnect('wa-sqlite');
```

## Notes

1. Use **different `dbName` values** for the source and target during the move, so the underlying stores do not overwrite each other.
2. For large data sets, read in batches (with `limit` / `offset` or cursor queries) and yield the event loop between batches.
3. Before switching to an adapter that needs specific browser capabilities, check the [compatibility matrix](/compatibility.md) to confirm the target environment supports them.
4. Clean up the old database data only after the migration is complete and verified.

## See also

- Adapter-specific configuration is covered in [Database adapters](/adapters/README.md)
- [Schema migrations](/migration/schema.md)
