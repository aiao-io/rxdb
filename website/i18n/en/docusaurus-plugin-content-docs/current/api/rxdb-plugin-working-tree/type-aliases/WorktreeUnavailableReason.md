# WorktreeUnavailableReason

```ts
type WorktreeUnavailableReason =
  | 'not_configured'
  | 'unsupported_adapter'
  | 'adapter_mismatch'
  | 'branch_not_found'
  | 'branch_not_materialized'
  | 'incomplete_entities'
  | 'unreachable_target'
  | 'incompatible_schema'
  | 'restoring_working_tree'
  | 'locks_unavailable'
  | 'in_use'
  | 'not_found'
  | 'schema_mismatch'
  | 'schema_rebuild_failed'
  | 'invalid_name'
  | 'name_taken';
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-errors.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-errors.ts#L31)

Why the checkout could not be opened or renamed.

- `not_configured`: no `worktrees.adapter` was given when installing the working tree plugin, so it is unknown where the snapshot database is built (read-only checkouts)
- `unsupported_adapter`: the main or snapshot database's adapter lacks snapshot primitives, or the main database's adapter cannot create a writable checkout's table set
- `adapter_mismatch`: the snapshot database's adapter is not the same backend as the main database; rows in the storage shape cannot be moved over
- `branch_not_found`: the target branch does not exist
- `branch_not_materialized`: the target branch only has local metadata; switch over once on the main checkout to materialize the remote snapshot
  (open the checkout, or switch branches inside a writable checkout)
- `incomplete_entities`: there is a table to replicate on the main instance, but the snapshot instance has no corresponding entity class
  (most likely the plugin generating it was not installed into `worktrees.plugins`)
- `unreachable_target`: the commit is not on the active branch HEAD's reachable parent chain (same name and criterion as `restore()`)
- `incompatible_schema`: there are entities this client does not recognize on the walk-back path (same name and criterion as `restore()`)
- `restoring_working_tree`: there is a restore in progress on the active branch, the working tree holds the restored changes, and the walk-back starting point is not HEAD
- `locks_unavailable`: the runtime has no `navigator.locks`, so it cannot tell whether some context is using a checkout
- `in_use`: the `attach()` / `mount()` / `remove()` checkout is open elsewhere
- `not_found`: the `attach()` checkout does not exist, is not a persistent-ownership read-only checkout, or is not finished building; the `mount()` / `remove()` checkout is not a writable checkout,
  or the branch it holds no longer exists
- `schema_mismatch`: the app's entity structure changed after the `attach()` read-only checkout was built
- `schema_rebuild_failed`: the `mount()` writable checkout's fingerprint does not match (entity structure or the plugin's attached objects on the tables changed), rebuilding under the new structure failed,
  the whole transaction rolled back and the checkout stayed as-is; `cause` is the original rebuild error (US-314 B2.6)
- `invalid_name`: the name given to `add()` / `rename()` is empty after trimming whitespace
- `name_taken`: the name given to `add()` / `rename()` is already used by another writable checkout
