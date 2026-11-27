# useWorkingTree()

```ts
function useWorkingTree(): WorkingTreeResource;
```

Defined in: [use-working-tree.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts#L101)

Reads and writes the current database's working tree.

## Returns

[`WorkingTreeResource`](../type-aliases/WorkingTreeResource.md)

See [WorkingTreeResource](../type-aliases/WorkingTreeResource.md)

## Throws

Throws one different message each when there is no Provider in the component tree, the Provider has no `db`, or the async source is not ready yet; when async source creation fails, throws the creation error as-is (same semantics as `useRxDB`)

## Example

```tsx
const tree = useWorkingTree();

useEffect(() => void tree.status().catch(() => undefined), [tree.status]);

if (tree.statusState.phase === 'empty') return <span>No uncommitted changes</span>;
if (tree.statusState.phase === 'success') {
  return <span>{tree.statusState.value.entryCount} uncommitted</span>;
}
return null;
```

## Remarks

**Creating the entry itself sends no IO at all**: all fourteen slots start as `idle`; the database is only read when a method is actually called. Querying on mount would make every component that only wants `commit()` waste a query round at mount time — and under React that becomes two rounds in `StrictMode`.

**No change stream**: state only updates after commands issued through this entry. Changes written from other tabs, or writes that go directly through `entity.save()`, don't trigger a re-render — call `status()` again for the latest value. This faithfully reflects that core still has no working tree change stream; it's not a step saved here.

State uses `useState` rather than `useSyncExternalStore`: the state source lives inside React (this hook's own commands produce it), it is not an external store, and there is no tearing to speak of.

When the database is unavailable, it **throws instead of** returning a default "everything is clean": that would disguise "the entry is not connected" as "no uncommitted changes" — staying silent exactly when it should speak up.
