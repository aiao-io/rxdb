# WorkingTreeSwitchBranchOptions

```ts
type WorkingTreeSwitchBranchOptions = RxDBBranchSwitchPreconditions;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts#L34)

The optional second parameter of `switchBranch()` (FR-017, contracts/core-api.md §6).

## Remarks

It is **the same type** as the core's [RxDBBranchSwitchPreconditions](../../rxdb/type-aliases/RxDBBranchSwitchPreconditions.md),
not a copy of it: the shape must live in the core so `VersionManager.switchBranch()` gets completion right at
the method declaration, while the meaning can only be explained by this capability (both fields' criteria sit
on tables this plugin contributes). The alias leaves **only one declaration** for the two places — so the type
assertion in `switch-branch-options.spec.ts` that says "exactly these two fields, no more no less" also guards
the core side.

The adapter's `SwitchBranchOptions` (`packages/rxdb/src/rxdb-adapter.ts`) is **not reused**: that one is
`{ branchId, actions }`, an argument of a different layer; leaking it into the public API would show users the
adapter's internal shape and force them to assemble a `SwitchVersionActions` themselves just to call it.
