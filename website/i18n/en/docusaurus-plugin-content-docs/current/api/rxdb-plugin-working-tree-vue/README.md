# rxdb-plugin-working-tree-vue

The Vue integration layer for [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree/README.md). Provides the `useWorkingTree()` composable, adapting the working-tree plugin's `WorkingTreeManager` to a Vue `ComputedRef` consumption interface.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-working-tree @aiao/rxdb-vue @aiao/rxdb-plugin-working-tree-vue vue rxjs
```

## Usage

```vue
<script lang="ts" setup>
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-vue';

const tree = useWorkingTree();

const save = async (): Promise<void> => {
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
  if (!result.ok) console.warn('Someone else committed first; retry', result.conflict);
};
</script>

<template>
  <span v-if="tree.statusState.value.phase === 'empty'">No uncommitted changes</span>
  <span v-else-if="tree.statusState.value.phase === 'success'">
    {{ tree.statusState.value.value.entryCount }} uncommitted
  </span>
  <button :disabled="tree.commitState.value.phase === 'loading'" @click="save">Commit</button>
</template>
```

Plugin installation still happens on the library side (`db.use(rxDBPluginWorkingTree)` **must come before `connect()`**); this package only handles reading and writing.

`useWorkingTree()` obtains the database via `useRxDB()`, so the upstream must have `provideRxDB()`. The ten state cells are each wrapped in a `ComputedRef`: when a template only reads `statusState`, a phase change from one `diff()` call does not make it re-evaluate.

## Checkouts: `useWorktrees()`

`useWorktrees()` is the entry point to the working-tree plugin's `db.workingTree.checkouts`: `list()` / `open()` / `attach()` / `prune()` for read-only checkouts (US-313), `add()` / `mount()` / `mountMain()` / `release()` / `remove()` / `rename()` for writable checkouts (US-314), one state cell per command (`listState`, `addState`, … ten cells in total), with signatures matching the same-named methods on the plugin. Commands that change the registry (`open` / `attach` / `prune` / `add` / `mount` / `remove` / `rename`, plus the read-only view's `close()` / `release()` / `refresh()`) also re-read the registry once they settle; the most recent request for the same cell wins. Call `useWorktrees()` **outside** any nested Provider: snapshot instances do not have the working-tree plugin installed.

`mounted` is the table set this instance currently has mounted (it changes only after a remount finishes): `mounted.isMain` means the main checkout, the registry row whose `tableSetSuffix === mounted.suffix` is the mounted one, and the current branch is the entry whose `activeKey === mounted.holderKey`. After a remount, `useWorkingTree()` does not re-read by itself; subscribe to `mounted` and re-read:

```ts
const worktrees = useWorktrees();
const tree = useWorkingTree();
watch(worktrees.mounted, () => void tree.status());

const row = await worktrees.add('feature');
await worktrees.mount(row.id);
```

Put the view obtained from opening a read-only checkout into a `shallowRef` (private fields of the RxDB instance cannot survive a deep reactive proxy), then hand `view.rxdb` to `provideRxDB()` in child components; the query composables and rxdb-model's entity lists inside keep working:

```ts
const worktrees = useWorktrees();
const view = shallowRef<WorktreeView | null>(null);
view.value = await worktrees.open({ branchId: 'feature' });
// child component: provideRxDB(toRef(props, 'rxdb'))
```

When done, `view.close()`: disconnects the read-only instance and deletes the snapshot database and its registration.

## Tri-framework symmetry

`useWorkingTree()` and `useWorktrees()` of Angular [`@aiao/rxdb-plugin-working-tree-angular`](../rxdb-plugin-working-tree-angular/README.md) / React [`@aiao/rxdb-plugin-working-tree-react`](../rxdb-plugin-working-tree-react/README.md) / Vue `@aiao/rxdb-plugin-working-tree-vue` (this package) have the **same names, same fields and same method signatures**, only the state container form differs (`Signal` / render snapshot / `ComputedRef`). Each of the three packages' specs ends with a `tri-framework-api.md §3 checklist guard`, which fails if any framework adds or removes a member.

The only framework-specific difference is **switching databases**: React re-obtains the database on every render, so when `RxDBProvider` changes `db`, both hooks reset to their initial state and late results from the old database are discarded; the database in an Angular injector never changes, so switching databases means rebuilding components; Vue obtains the database once in `setup()`, so when the source of `provideRxDB()` changes databases the entry point still points at the old database — to follow the switch, add `:key` to the components that use it so they rebuild with the database.

## Behavioral conventions (consistent across the three frameworks)

- **The creation entry point itself issues no IO**: all ten state cells start as `idle`, and the database is only read when a method is actually called.
- **No change stream**: state only updates after commands issued through this entry point. Changes written in from other tabs, or writes that go directly through `entity.save()`, will not push a fresh status — call `status()` again when you need the latest value.
- When the database cannot be obtained, it **throws** instead of returning a default value implying "everything is clean".
- The CAS failure of `commit()` comes back via the return value (`result.ok === false` and carries `conflict`), not an exception.
- The four rejection reasons of `restore()` (conflict / dirty working tree / codec incompatibility / unreachable target) also come back via the return value, so `restoreState` has **no empty** — "rejected" and "nothing restored" are both results. The emptiness of `restoreSessionState` has exactly one meaning: the current branch has no unfinished restore session; a `conflicted` session is **not** empty.
- The rejection of `switchBranch(branchId, options?)` conversely goes through **exceptions**: `{ requireClean: true }` against a non-empty working tree throws `WorkingTreeDirtyError`, and an expired `expectedActivationRevision` throws the core's branch precondition error — at that moment the branch was **never switched**, so there is no result to hand to the caller. Omitting the second argument is byte-for-byte identical to an unconditional switch (so the core's fast path of "no condition specified means no statement issued" still holds). After success it automatically re-reads status once: that summary belongs to **another** branch. It lives on the core's `VersionManager` rather than `WorkingTreeManager` (contracts/core-api.md §6), which is why the three framework entry points take the whole `RxDB` instead of just `db.workingTree`.

Types and error classes are always imported directly from [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree/README.md); this package **neither redefines nor re-exports them** (tri-framework-api.md §1).

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- Working tree and commit capabilities: see [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree/README.md)

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

rxdb-plugin-working-tree-vue - Vue integration layer

Provides the `useWorkingTree()` composable, adapting `@aiao/rxdb-plugin-working-tree`'s `WorkingTreeManager` to a Vue `ComputedRef` consumption interface. Naming matches the Angular / React binding layers (tri-framework-api.md §3).

## Interfaces

| Interface | Description |
| ------ | ------ |
| [WorkingTreeResource](interfaces/WorkingTreeResource.md) | Return value of [useWorkingTree](functions/useWorkingTree.md). |
| [WorktreesResource](interfaces/WorktreesResource.md) | Checkout entry point returned by [useWorktrees](functions/useWorktrees.md) (read-only checkouts US-313, writable checkouts US-314). |

## Functions

| Function | Description |
| ------ | ------ |
| [useWorkingTree](functions/useWorkingTree.md) | Reads and writes the working tree of the current database. |
| [useWorktrees](functions/useWorktrees.md) | Reads and writes the checkouts of the current database (read-only checkouts and writable checkouts); call it in `setup()` or an `effectScope`. |
