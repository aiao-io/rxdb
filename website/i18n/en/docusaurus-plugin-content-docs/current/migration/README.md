# Migration guides

Start with the packages and adapters your application uses. Check the framework and runtime versions before upgrading. [Compatibility matrix](/compatibility.md)

The summaries below are in English. The linked migration procedures are in Chinese.

## Application upgrades

| When to use the guide | What to review |
| --- | --- |
| Upgrading from v0 to 1.0 | Breaking changes and upgrade order. [v1 upgrade](/migration/v1.md) |
| Upgrading or switching framework bindings | Providers, hooks, and composables for Angular, React, and Vue. [Framework bindings](/migration/frameworks.md) |
| Moving data to another storage backend | Data export, import, and adapter registration. [Adapter migration](/migration/adapters.md) |
| Changing the structure of an entity | How to migrate existing rows. [Schema migrations](/migration/schema.md) |
| Choosing a package version | Release policy and API stability commitments. [Versioning](/versioning.md) |

## Plugin and package changes

| Change | Action |
| --- | --- |
| Desktop storage | Replace `@aiao/rxdb-adapter-desktop` with the Electron or Tauri package for the host. [Desktop split](/migration/desktop-split.md) |
| Working tree and commit history | Register `@aiao/rxdb-plugin-working-tree` before connecting. [Working tree split](/migration/working-tree-split.md) |
| Tree entities and queries | Import `TreeRepository` from `@aiao/rxdb-plugin-tree` and the bindings from the matching framework package. [Tree split](/migration/tree-split.md) |
| Installing or upgrading a plugin | Check its setup order and required entities. [Plugin upgrades](/migration/plugins.md) |
| Plugin cleanup | Register cleanup in the scope passed to `install(scope)`. [Plugin lifecycle](/migration/plugin-scope.md) |
| History and synchronization | Use `@aiao/rxdb-plugin-history` for history and branches, and `@aiao/rxdb-plugin-sync` for push and pull. Sync methods now live on `syncManager`. [History and sync split](/migration/history-sync-plugins.md) |
| Query cache | Applications using `SyncType.QueryCache` need the history, sync, and query-cache plugins. [Query-cache split](/migration/querycache-plugin.md) |

## Remote adapters

| Change | Action |
| --- | --- |
| Supabase network errors | Use `isNetworkError` to identify offline failures reported as `NetworkOfflineError`. [Network errors](/migration/supabase-network-errors.md) |
| Supabase update pushes | Apply the updated SQL before upgrading the client. The `rxdb_mutations` function accepts `p_updates` for ordinary updates. [Update pushes](/migration/supabase-update-push.md) |
| Supabase change log ordering | Reapply the `02` SQL script so log IDs follow commit order during pulls. [Change log order](/migration/supabase-change-log-order.md) |
| Supabase backend identity | Apply the SQL before upgrading. Handle `RemoteBackendMismatchError` when a backend is rebuilt. Custom remote adapters implement `backendId()`. [Backend identity](/migration/supabase-remote-backend.md) |
| Supabase push receipts | Apply the SQL before upgrading. Custom adapters must return per-change `results` from `mergeChanges`. [Push receipts](/migration/supabase-push-receipts.md) |
| HTTP pagination | Rename `ctx.cursor` to `ctx.pageToken` and `nextCursor` to `nextPageToken`. [HTTP page tokens](/migration/http-page-token.md) |

## Other public API changes

| Change | Action |
| --- | --- |
| `RemoteSyncOptions` | Pass the conflict resolver through `PullOptions.conflictResolver`. [Remote sync options](/migration/remote-sync-options.md) |
| Cross-realm writer lease | Coordinate exclusive access across browser contexts or processes in your deployment. [Writer lease removal](/migration/writer-lease-removal.md) |
| `RxDBBranch` | Migrate callers of the four tree queries and `RxDBBranchTreeRuleGroup`. [Branch queries](/migration/branch-detree.md) |
| Generator defaults | Function-valued defaults now fail during generation. Review defaults using `bigint`, `Uint8Array`, or `Date`. [Generator defaults](/migration/generator-default.md) |
| Model action columns | Pass `canDelete` as the third argument to `actionsColumn` and the view label as the fourth. [Action columns](/migration/actions-column-can-delete.md) |
| SQL helper functions | Pass a `WorktreeTableSet`. Use `WorktreeTableSet.MAIN` for code that works only with the main checkout. [Table set parameter](/migration/table-set-parameter.md) |
