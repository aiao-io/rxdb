# useWorktrees()

```ts
function useWorktrees(): WorktreesResource;
```

Defined in: [use-worktrees.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-react/src/use-worktrees.ts#L101)

Reads and writes the current database's checkouts: read-only and writable checkouts.

## Returns

[`WorktreesResource`](../type-aliases/WorktreesResource.md)

See [WorktreesResource](../type-aliases/WorktreesResource.md)

## Throws

Throws when there is no Provider in the component tree, the database doesn't have the working tree plugin installed, or the mount stream fails to hand over the current table set at subscription time

## Remarks

Creating the entry itself sends no IO at all: all ten slots start as `idle`, and the database is only read when a method is called; `mounted` reads an in-memory stream.

## Example

```tsx
const worktrees = useWorktrees();
const row = await worktrees.add('feature');
await worktrees.mount(row.id);
return <span>{worktrees.mounted.isMain ? 'Main Worktree' : row.name}</span>;
```
