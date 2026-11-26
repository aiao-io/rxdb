# WorkingTreeSwitchBranchOptions

```ts
type WorkingTreeSwitchBranchOptions = RxDBBranchSwitchPreconditions;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts#L34)

Optional second parameter of `switchBranch()` (FR-017, contracts/core-api.md §6).

## Remarks

The **same type** as the core's [RxDBBranchSwitchPreconditions](../../rxdb/type-aliases/RxDBBranchSwitchPreconditions.md), not a copy of it: the shape must live in the core
so `VersionManager.switchBranch()` has completions right at the method declaration, while only this capability can interpret the meaning
(the criteria of both fields are on tables this plugin contributes). The alias keeps **a single declaration** — the type assertion in `switch-branch-options.spec.ts`
of "exactly these two fields, no more no less" therefore also guards the core side.

Does **not reuse** the adapter's `SwitchBranchOptions` (`packages/rxdb/src/rxdb-adapter.ts`): that one is
`{ branchId, actions }`, an input of another layer; leaking it into the public API would show users the adapter's internal shape,
and they would have to hand-assemble a `SwitchVersionActions` to call it.
