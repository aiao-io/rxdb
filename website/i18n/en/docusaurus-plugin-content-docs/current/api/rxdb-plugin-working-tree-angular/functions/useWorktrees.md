# useWorktrees()

```ts
function useWorktrees(): WorktreesResource;
```

Defined in: [use-worktrees.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts#L93)

Reads and writes the checkouts of the current database (read-only checkouts and writable checkouts); call it in the injection context.

## Returns

[`WorktreesResource`](../interfaces/WorktreesResource.md)

See [WorktreesResource](../interfaces/WorktreesResource.md)

## Throws

Throws when no database can be obtained in the injection context, the database does not have the working-tree plugin installed, or the mount stream does not hand over the current table set at subscription time.

## Remarks

The creation entry point itself issues no IO: all ten cells start as `idle`, and the database is only read when a method is called; `mounted` reads an in-memory stream and unsubscribes when the injector is destroyed.
