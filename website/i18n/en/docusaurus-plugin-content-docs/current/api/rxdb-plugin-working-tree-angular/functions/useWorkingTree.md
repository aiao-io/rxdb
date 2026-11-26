# useWorkingTree()

```ts
function useWorkingTree(): WorkingTreeResource;
```

Defined in: [use-working-tree.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L180)

Reads and writes the working tree of the current database.

## Returns

[`WorkingTreeResource`](../interfaces/WorkingTreeResource.md)

See [WorkingTreeResource](../interfaces/WorkingTreeResource.md)

## Throws

Throws when there is no `provideRxDB`, the database is not ready yet, or creation fails (same semantics as `useRxDB`).

## Example

```typescript
@Component({
  template: `
    @switch (tree.statusState().phase) {
      @case ('loading') `{ <span>Loading…</span> }`
      @case ('empty') `{ <span>No uncommitted changes</span> }`
      @case ('success') `{ <span>{{ tree.statusState().value.entryCount }} uncommitted</span> }`
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

## Remarks

**Must be called in the Angular injection context** — it obtains the database via `useRxDB()`. The fourteen state cells live on the signals owned by this call; there is no singleton cache shared across components.

**The creation entry point itself issues no IO**: all fourteen cells start as `idle`, and the database is only read when a method is actually called. Querying on mount would make every component that only wants `commit()` waste a query round on mount.

**No change stream**: state only updates after commands issued through this entry point. Changes written in from other tabs, or writes that go directly through `entity.save()`, will not push a fresh status — call `status()` again when you need the latest value. This faithfully reflects that the core side has no working-tree change stream yet; it is not a skipped step here.

When the database cannot be obtained, it **throws instead of** returning a default value implying "everything is clean": that would disguise "the entry point is not wired up" as "no uncommitted changes" — staying silent exactly when it matters most to speak up.
