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

The reasons a worktree cannot be opened or renamed.

- `not_configured`: no `worktrees.adapter` was given when installing the working tree plugin, so there is no
  way to know where to build the snapshot database (read-only worktrees)
- `unsupported_adapter`: the main or snapshot database's adapter lacks the snapshot primitives, or the main
  database's adapter cannot create a writable worktree's table set
- `adapter_mismatch`: the snapshot database's adapter is not the same backend as the main database, so the
  rows cannot be moved across storage shapes
- `branch_not_found`: the target branch does not exist
- `branch_not_materialized`: only metadata for the target branch is available locally; switch onto it once on
  the main worktree to materialize the remote snapshot first (opening a worktree, or switching branches inside
  a writable worktree)
- `incomplete_entities`: the main instance has a table that must be copied, but the snapshot instance has no
  matching entity class (most likely the plugin that generates it was not added to `worktrees.plugins`)
- `unreachable_target`: the commit is not on the active branch HEAD's reachable parent chain (same name and
  criterion as `restore()`)
- `incompatible_schema`: the path walked back contains entities this client does not recognize (same name and
  criterion as `restore()`)
- `restoring_working_tree`: there is a restore in progress on the active branch, the working tree holds the
  restored changes, and the starting point to walk back from is not HEAD
- `locks_unavailable`: the runtime has no `navigator.locks`, so it cannot tell whether any context is using a
  worktree
- `in_use`: the worktree in `attach()` / `mount()` / `remove()` is currently open elsewhere
- `not_found`: the worktree in `attach()` does not exist, is not a persistently owned read-only worktree, or
  is not built yet; the worktree in `mount()` / `remove()` is not a writable worktree, or the branch it holds
  no longer exists
- `schema_mismatch`: the app's entity structure changed after `attach()`'s read-only worktree was built
- `schema_rebuild_failed`: `mount()`'s writable worktree fingerprint mismatches (entity structure or a
  plugin's table-attached auxiliary objects changed), the rebuild under the new structure failed and the whole
  transaction rolled back, leaving the worktree as-is; `cause` is the original error from the rebuild
  (US-314 B2.6)
- `invalid_name`: the name given to `add()` / `rename()` is empty after trimming leading/trailing whitespace
- `name_taken`: the name given to `add()` / `rename()` is already used by another writable worktree
