# rxdb-plugin-working-tree-react

The React integration layer of [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree/README.md). Provides the `useWorkingTree()` hook that adapts the working tree plugin's `WorkingTreeManager` into a React state consumption interface.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-working-tree @aiao/rxdb-react @aiao/rxdb-plugin-working-tree-react react rxjs
```

## Usage

```tsx
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-react';
import { RxDBProvider } from '@aiao/rxdb-react';

const db = new RxDB(config);
db.use(rxDBPluginWorkingTree); // ← must come before connect()
await db.connect('sqlite-wasm');

export function CommitBar() {
  const tree = useWorkingTree();

  const save = async () => {
    const status = await tree.status();
    const result = await tree.commit('Save', {
      expectedBranch: {
        branchId: status.branchId,
        activationRevision: status.activationRevision
      },
      expectedHeadRevision: status.headRevision,
      expectedWorkingTreeRevision: status.workingTreeRevision,
      authorId: 'alice',
      operationId: crypto.randomUUID()
    });
    if (!result.ok) console.warn('Someone else committed first; just retry', result.conflict);
  };

  return (
    <div>
      `{tree.statusState.phase === 'empty' && <span>No uncommitted changes</span>}`
      `{tree.statusState.phase === 'success' && <span>{tree.statusState.value.entryCount} uncommitted</span>}`
      <button disabled={tree.commitState.phase === 'loading'} onClick={() => void save()}>
        Commit
      </button>
    </div>
  );
}
```

`useWorkingTree()` obtains the database via `useRxDB()`, so the component tree must contain `RxDBProvider`. The ten state fields are **plain read-only values** (`Readonly<WorkingTreeAsyncStates>`) and can be destructured directly; the ten methods have **stable references** and can safely go into `useEffect` / `useMemo` dependency arrays.

## Checkouts: `useWorktrees()`

`useWorktrees()` is the entry to the working tree plugin's `db.workingTree.checkouts`: read-only checkouts (US-313) with `list()` / `open()` / `attach()` / `prune()`, writable checkouts (US-314) with `add()` / `mount()` / `mountMain()` / `release()` / `remove()` / `rename()` — one command per state slot (`listState`, `addState`, … ten slots in total), with signatures matching the plugin's same-named methods. Commands that modify the registry (`open` / `attach` / `prune` / `add` / `mount` / `remove` / `rename`, plus the read-only view's `close()` / `release()` / `refresh()`) re-read the registry once settled; within the same slot, the later request wins. `useWorktrees()` must be called **outside** the nested Provider: the snapshot instance doesn't have the working tree plugin installed.

`mounted` is the table set this instance is currently mounted on (it only changes after a remount settles): `mounted.isMain` means the main checkout; the registry row whose `tableSetSuffix === mounted.suffix` is the mounted one, and the current branch is the entry whose `activeKey === mounted.holderKey`. After a remount, `useWorkingTree()` does not re-read on its own; subscribe to `mounted` and re-read:

```tsx
const worktrees = useWorktrees();
const tree = useWorkingTree();
// depend on the stable method references: tree itself becomes a new object on every phase change,
// and putting it in the dependencies would make status() trigger the next round itself
useEffect(() => void tree.status(), [tree.status, worktrees.mounted]);

const row = await worktrees.add('feature');
await worktrees.mount(row.id);
```

The view obtained from opening a read-only checkout hands `view.rxdb` to a nested `RxDBProvider`; the query hooks inside and rxdb-model's entity lists work as usual:

```tsx
const worktrees = useWorktrees();
const view = await worktrees.open({ branchId: 'feature' });
return <RxDBProvider db={view.rxdb}>{children}</RxDBProvider>;
```

When done, `view.close()`: disconnects the read-only instance and deletes the snapshot database and registry entry.

## Three-framework symmetry

Angular [`@aiao/rxdb-plugin-working-tree-angular`](../rxdb-plugin-working-tree-angular/README.md) /
React `@aiao/rxdb-plugin-working-tree-react` (this package) /
Vue [`@aiao/rxdb-plugin-working-tree-vue`](../rxdb-plugin-working-tree-vue/README.md) have
`useWorkingTree()` and `useWorktrees()` with the **same name, same fields, same method signatures**; only the state container shape differs (`Signal` / render snapshot / `ComputedRef`). Each of the three packages' specs ends with a `tri-framework-api.md §3 checklist guard`, and adding or removing a member on any side turns red.

The only per-framework difference is **switching databases**: React re-obtains the database on every render — when `RxDBProvider` gets a new `db`, both hooks return to their initial state and late results from the old database are discarded. Angular's injector keeps the same database, so switching means rebuilding the component. Vue obtains the database once in `setup()`; when `provideRxDB()`'s source changes the entry still points at the old database, so add `:key` to components using it to rebuild them with the new database.

## Behavioral conventions (same across all three frameworks)

- **Creating the entry itself sends no IO at all**: all ten state slots start as `idle`; the database is only read when a method is actually called.
- **No change stream**: state only updates after commands issued through this entry. Changes written from other tabs, or writes that go directly through `entity.save()`, don't push a new status — call `status()` again for the latest value.
- When the database is unavailable, it **throws** instead of returning a default "everything is clean".
- CAS failures of `commit()` come back as a return value (`result.ok === false` with `conflict`), not an exception.
- The four rejection causes of `restore()` (conflict / dirty working tree / codec incompatibility / unreachable target) also come back as return values, so `restoreState` has **no empty** — "rejected" and "nothing restored" are both results. The empty of `restoreSessionState` has exactly one meaning: the current branch has no unfinished restore session; a `conflicted` session is **not** empty.
- The rejection of `switchBranch(branchId, options?)` goes the other way, via an **exception**: `{ requireClean: true }` against a non-empty working tree throws `WorkingTreeDirtyError`, and an expired `expectedActivationRevision` throws the core branch precondition error — at that moment the branch was **not switched at all**, and there is no result to hand back. Omitting the second argument is byte-for-byte identical to an unconditional switch (so core's fast path of "not a single statement when no condition was given" still holds). After success it automatically re-reads the status once: that summary belongs to **another** branch. It hangs on core's `VersionManager` rather than `WorkingTreeManager` (contracts/core-api.md §6), which is why all three framework entries take the whole `RxDB` instead of just `db.workingTree`.

Types and error classes are imported directly from [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree/README.md); this package **neither redefines nor re-exports** them (tri-framework-api.md §1).

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- Working tree and commit capabilities: see [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree/README.md)

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [WorkingTreeResource](type-aliases/WorkingTreeResource.md) | The working tree entry returned by [useWorkingTree](functions/useWorkingTree.md) in the current render. |
| [WorktreesResource](type-aliases/WorktreesResource.md) | The checkout entry returned by [useWorktrees](functions/useWorktrees.md) in the current render (read-only checkouts US-313, writable checkouts US-314). |

## Functions

| Function | Description |
| ------ | ------ |
| [useWorkingTree](functions/useWorkingTree.md) | Reads and writes the current database's working tree. |
| [useWorktrees](functions/useWorktrees.md) | Reads and writes the current database's checkouts: read-only and writable checkouts. |
