# Working tree split: core → `@aiao/rxdb-plugin-working-tree`

The working tree and commit history (epic-006) were extracted from `@aiao/rxdb` core into a standalone plugin package, **effective from the next published version**: the ten system tables, write capture, commit graph codec, and the `0004-working-tree-commits` migration all ship with `@aiao/rxdb-plugin-working-tree`; core keeps only the mount/unmount port and the "unclaimed capability guard".

**No data migration is involved.** The database files on disk, the table structures, the `rxdb_change` chain, and the migration names already written into `rxdb_migration` — none of them changed. What must change: the dependency list, one `use()` line, and (for databases that used the working tree) one `enable()` convergence. Under the [versioning and API stability policy](/versioning.md), breaking changes are allowed in minor versions during 0.x.

## Why split

The working tree is a capability that "only exists once installed": ten tables plus a write-capture layer are pure cost to a database that never uses them. Before the split, core bore that cost, and the only way core could lock out old clients was to bump `RXDB_SYSTEM_SCHEMA_VERSION` — a small working-tree-side change forced **all** old clients to refuse connection, locking out databases that never installed the feature along with the rest.

After the split: databases without this package cost **zero** — system tables, capture, and the codec all ship with the package; locking out old clients is taken over by the "unclaimed capability guard", which only locks databases that **enabled the capability** (see section 4), and works for third-party plugins too.

## 1. Install

```bash
pnpm add @aiao/rxdb-plugin-working-tree
# Framework bindings (pick the one you need)
pnpm add @aiao/rxdb-plugin-working-tree-angular
pnpm add @aiao/rxdb-plugin-working-tree-react
pnpm add @aiao/rxdb-plugin-working-tree-vue
```

Applications that do not plan to use the working tree do **not need** to install it, and see no behavioral difference.

## 2. `use()` must come before `connect()`

This is the only runtime-visible wiring change:

```typescript
import { RxDB } from '@aiao/rxdb';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

const db = new RxDB(config);
db.use(rxDBPluginWorkingTree); // ← must be before connect()
await db.connect('sqlite-wasm');
```

This plugin declares `system` (`RxDBSystemContribution`), and the host must read its entities, initial rows, and migrations before creating tables; a `use()` after `connect()` is too late for table creation, and core throws on the spot rather than silently skipping.

The type entry changes with it: `db.workingTree` is a **non-optional** member, augmented through `declare module '@aiao/rxdb'` — without this package, `db.workingTree` is a **compile error**, not a runtime `undefined`. Whether the plugin is installed is a build-time property; whether it is usable is a property of the database.

## 3. Existing databases: one `enable()` convergence

Call `db.workingTree.enable()` once after connecting — **idempotent**, one call path for existing and new databases alike:

```typescript
await db.workingTree.enable();
```

Its semantics are "converge the database to the shape it should have once enabled": flip the `CommitCapabilityState` capability bit and add the commit graph root node to every local branch (same transaction). On an already-enabled database, calling again is a no-op that sends not a single statement. When the migration throws, the whole thing rolls back, the capability bit returns to not-enabled, and a retry faces the same starting point.

Databases that already ran `0004-working-tree-commits` before the split do **not rerun it**: that migration's name is a historical number pinned at publish time (it still lived in core then), `rxdb_migration`'s unique index uses it as the arbitration key, and the name can never change. Old databases that never ran it (built by versions before the working tree existed) get it from the plugin-contributed migration chain at `connect()`.

## 4. The unclaimed capability guard replaces the version lock

After upgrading and calling `enable()`, the database carries a capability watermark row (`__rxdb_capability__:workingTree:1:@aiao/rxdb-plugin-working-tree`). **From then on, a client without this package that opens the database is refused connection by core**, with the package name reported verbatim:

```
This database enabled an RxDB capability that the current process has not claimed. Without the matching plugin, writes are not governed by that capability, so the connection is refused:
  - workingTree v1 —— install @aiao/rxdb-plugin-working-tree
```

Behavior comparison (old → new):

| Scenario                                                                  | Old (built into core + version lock)                                       | New (plugin + capability guard)                                                                        |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Any working-tree-side change                                              | Bumps `RXDB_SYSTEM_SCHEMA_VERSION`, **all** old clients locked out         | Only databases that enabled the capability are locked                                                  |
| A client without the plugin opens an enabled database                     | Blocked by coincidence of the version number (and everything else with it) | Refused by name, with the package to install reported                                                  |
| A database that never enabled the working tree, client without the plugin | Behavior unchanged                                                         | **Zero cost**: no tables, no capture, no guard triggered                                               |
| Third-party plugins also need to lock old clients                         | No such mechanism                                                          | The package name is written into the watermark row by the plugin itself; core does not need to know it |

> When deploying a multi-client application, note: once **one** client calls `enable()`, **all** clients that open the same database (including old-version bundles) must install this plugin and `use()` it first, or the guard refuses their connection — that is exactly the point of the guard taking over from the version lock.

## 5. Framework bindings

The three sides' `useWorkingTree()` share **the same name, fields, and method signatures**, differing only in the state container form (`Signal` / render snapshot / `ComputedRef`):

| Framework | Package                                  | Entry              |
| :-------- | :--------------------------------------- | :----------------- |
| Angular   | `@aiao/rxdb-plugin-working-tree-angular` | `useWorkingTree()` |
| React     | `@aiao/rxdb-plugin-working-tree-react`   | `useWorkingTree()` |
| Vue       | `@aiao/rxdb-plugin-working-tree-vue`     | `useWorkingTree()` |

Installing the plugin still happens on the database side (`db.use(rxDBPluginWorkingTree)`); the binding packages only read and write. The ten state fields all start as `idle` (the creation entry fires not a single IO), and types and error classes are imported directly from the plugin package.

## 6. The capture mount point registry is renamed and sunk into core

The mount point list (the table in contract §1) used to be written **twice**, once in core and once in this plugin, with the plugin's copy verified by comparing parameter names character-for-character against the core source: a rename in core only turned tests red, with no reaction from types or runtime. Now the single definition lives in `@aiao/rxdb`, and this plugin just re-exports it — **the import paths are unchanged, the names changed**:

| Old name                   | New name                              |
| -------------------------- | ------------------------------------- |
| `CAPTURE_MOUNT_POINTS`     | `WORKING_TREE_CAPTURE_MOUNT_POINTS`   |
| `CaptureMountPoint`        | `WorkingTreeCaptureMountPoint`        |
| `CaptureMountPointOrdinal` | `WorkingTreeCaptureMountPointOrdinal` |
| `WritePrimitiveSignature`  | `WorkingTreeWritePrimitiveSignature`  |
| `isCaptureMountPoint`      | `isWorkingTreeCaptureMountPoint`      |

```typescript
// Old
import { CAPTURE_MOUNT_POINTS, isCaptureMountPoint } from '@aiao/rxdb-plugin-working-tree';

// New: same path, just rename; importing from `@aiao/rxdb` directly is equivalent (it is the same object)
import { WORKING_TREE_CAPTURE_MOUNT_POINTS, isWorkingTreeCaptureMountPoint } from '@aiao/rxdb-plugin-working-tree';
```

The rename makes core's flat export list say which feature these names belong to — `CaptureMountPoint` reads as "capture what?" in core, while its siblings `WorkingTreeCaptureHook` / `WorkingTreeCaptureMountTarget` already carried the prefix (gate: `NAMING` in `scripts/audit/api-surface.mjs`, rules in `contracts/core-api.md` §0).

Also added: `WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS` — `installWorkingTreeCapture()` / `uninstallWorkingTreeCapture()` iterate it when mounting/unmounting, so "the registry is one row short" and "a write primitive is left unwrapped" are now the same thing, not a self-description nobody calls.

## 7. The branch materialization source is registered automatically by the sync plugin

A `metadata_only` branch (pulled by `syncBranches()` but with no local data yet) materializes its snapshot from the remote on its first `switchBranch()`. Previously the caller had to implement `BranchMaterializationSource` and register it with `db.workingTree.registerMaterializationSource()`, and nothing in production code registered it — with the result that the first switch after `syncBranches()` always threw `BranchNotMaterializedError` (`source_unavailable`).

Now `@aiao/rxdb-plugin-sync` registers the source automatically in `install()` of every connection epoch and revokes it on disconnect — **using both the sync plugin and this plugin is enough**, no manual wiring:

```typescript
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

db.use(rxDBPluginHistory);
db.use(rxDBPluginSync);
db.use(rxDBPluginWorkingTree);
await db.connect('sqlite-wasm');

await db.syncManager.syncBranches();
await db.versionManager.switchBranch('feature'); // first switch materializes
```

The public surface changes that follow:

| Old (`@aiao/rxdb-plugin-working-tree`)                                  | New                                                                                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `db.workingTree.registerMaterializationSource(source)`                  | Deleted; custom sources use `db.branchMaterializationSource(source, scope?)`                                         |
| `db.workingTree.materializationSource`                                  | Deleted; read with `db.getBranchMaterializationSource()`                                                             |
| `BranchMaterializationSource` / `BranchMaterializationIntent`           | Moved to `@aiao/rxdb`, members changed to `freezeIntent` / `pages` / `resolveIntentDrift` / `projectPage` / `settle` |
| `BranchMaterializationPagePayload` / `BranchMaterializationPageRequest` | Moved to `@aiao/rxdb`                                                                                                |
| `branchMaterializationPageFingerprint`                                  | Moved to `@aiao/rxdb` (algorithm unchanged)                                                                          |
| `BranchMaterializationApplyContext`                                     | Deleted; replaced by `BranchMaterializationBarrierContext` / `BranchMaterializationProjectionContext`                |
| `takeOverBranchSwitchWithMaterialization`                               | Deleted; the plugin already wired it inside `takeOverBranchSwitch`, triggered through `switchBranch()`               |

The source slot holds **at most one** per connection: on a database with the sync plugin installed the slot is already taken by it, and calling `db.branchMaterializationSource()` throws. Only applications that do not install the sync plugin and bring their own remote need to implement and register one. `BranchNotMaterializedError` and `BranchNotMaterializedReason` are still exported from this package; on failure the source branch stays active and the pulled pages stay in staging, so the next switch resumes the transfer.

## See also

- [Working tree and commit history plugin](/plugins/rxdb-plugin-working-tree/README.md): full usage and API
- [Plugin lifecycle migration](/migration/plugin-scope.md): the new `install(scope)` contract and what `lifecycle: 'scoped'` means for this plugin
- [Versioning and API stability](/versioning.md): deprecation cycles and the public API surface
- [Compatibility matrix](/compatibility.md): framework version and RxJS version mapping
