# rxdb-plugin-working-tree-angular

The Angular integration layer for [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree/README.md). Provides `useWorkingTree()`, adapting the working-tree plugin's `WorkingTreeManager` to an Angular signal consumption interface.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-working-tree @aiao/rxdb-angular @aiao/rxdb-plugin-working-tree-angular @angular/core rxjs
```

## Usage

```typescript
import { Component } from '@angular/core';
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-angular';

@Component({
  selector: 'app-commit-bar',
  template: `
    @switch (tree.statusState().phase) {
      @case ('loading') {
        <span>Loading…</span>
      }
      @case ('empty') {
        <span>No uncommitted changes</span>
      }
      @case ('success') {
        <span>{{ tree.statusState().value.entryCount }} uncommitted</span>
      }
    }
    <button [disabled]="tree.commitState().phase === 'loading'" (click)="save()">Commit</button>
  `
})
export class CommitBar {
  readonly tree = useWorkingTree();

  async save(): Promise<void> {
    const status = await this.tree.status();
    const result = await this.tree.commit('Save', {
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
  }
}
```

Plugin installation still happens on the library side (`db.use(rxDBPluginWorkingTree)` **must come before `connect()`**); this package only handles reading and writing.

`useWorkingTree()` **must be called in the Angular injection context** — it obtains the database via `useRxDB()`, so the upstream must have `provideRxDB()`. The ten state cells are each wrapped in a `Signal`: when a template only reads `statusState`, a phase change from one `diff()` call does not make it re-evaluate.

## Checkouts: `useWorktrees()`

`useWorktrees()` is the entry point to the working-tree plugin's `db.workingTree.checkouts`: `list()` / `open()` / `attach()` / `prune()` for read-only checkouts (US-313), `add()` / `mount()` / `mountMain()` / `release()` / `remove()` / `rename()` for writable checkouts (US-314), one state cell per command (`listState`, `addState`, … ten cells in total), with signatures matching the same-named methods on the plugin. Commands that change the registry (`open` / `attach` / `prune` / `add` / `mount` / `remove` / `rename`, plus the read-only view's `close()` / `release()` / `refresh()`) also re-read the registry once they settle; the most recent request for the same cell wins. Call `useWorktrees()` **outside** any nested Provider: snapshot instances do not have the working-tree plugin installed.

`mounted` is the table set this instance currently has mounted (it changes only after a remount finishes): `mounted.isMain` means the main checkout, the registry row whose `tableSetSuffix === mounted.suffix` is the mounted one, and the current branch is the entry whose `activeKey === mounted.holderKey`. After a remount, `useWorkingTree()` does not re-read by itself; subscribe to `mounted` and re-read:

```typescript
readonly worktrees = useWorktrees();
readonly tree = useWorkingTree();

constructor() {
  effect(() => {
    this.worktrees.mounted();
    untracked(() => void this.tree.status());
  });
}

async addAndMount(): Promise<void> {
  const row = await this.worktrees.add('feature');
  await this.worktrees.mount(row.id);
}
```

The view obtained from opening a read-only checkout is handed out through child components' injectors: `{ provide: RxDB, useValue: view.rxdb }`, and queries that `inject(RxDB)` plus rxdb-model's entity lists inside keep working. For a dynamic view, the `injector` of `NgComponentOutlet` is the most direct:

```typescript
readonly worktrees = useWorktrees();

async open(): Promise<void> {
  const view = await this.worktrees.open({ branchId: 'feature' });
  this.paneInjector = Injector.create({
    providers: [{ provide: RxDB, useValue: view.rxdb }],
    parent: this.injector
  });
}
```

When done, `view.close()`: disconnects the read-only instance and deletes the snapshot database and its registration.

## Tri-framework symmetry

`useWorkingTree()` and `useWorktrees()` of Angular `@aiao/rxdb-plugin-working-tree-angular` (this package) / React [`@aiao/rxdb-plugin-working-tree-react`](../rxdb-plugin-working-tree-react/README.md) / Vue [`@aiao/rxdb-plugin-working-tree-vue`](../rxdb-plugin-working-tree-vue/README.md) have the **same names, same fields and same method signatures**, only the state container form differs (`Signal` / render snapshot / `ComputedRef`). Each of the three packages' specs ends with a `tri-framework-api.md §3 checklist guard`, which fails if any framework adds or removes a member.

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

rxdb-plugin-working-tree-angular - Angular integration layer

Provides `useWorkingTree()`, adapting `@aiao/rxdb-plugin-working-tree`'s `WorkingTreeManager` to an Angular signal consumption interface. Naming matches the React / Vue binding layers (tri-framework-api.md §3).

## Interfaces

| Interface | Description |
| ------ | ------ |
| [WorkingTreeResource](interfaces/WorkingTreeResource.md) | Return value of [useWorkingTree](functions/useWorkingTree.md). |
| [WorktreesResource](interfaces/WorktreesResource.md) | Checkout entry point returned by [useWorktrees](functions/useWorktrees.md) (read-only checkouts US-313, writable checkouts US-314). |

## Functions

| Function | Description |
| ------ | ------ |
| [useWorkingTree](functions/useWorkingTree.md) | Reads and writes the working tree of the current database. |
| [useWorktrees](functions/useWorktrees.md) | Reads and writes the checkouts of the current database (read-only checkouts and writable checkouts); call it in the injection context. |
