# rxdb-plugin-workspace

The RxDB Workspace plugin provides local recovery for **NEW entity drafts that have not been persisted yet**: drafts are kept in memory and IndexedDB, and synced to same-origin tabs via BroadcastChannel. After a refresh or reopening the page, drafts are restored automatically and can be edited, saved, or discarded.

> Scope: only NEW drafts. Unsaved UPDATEs of existing entities, rollback to the pre-edit state, and DELETE undo are **not** in this plugin's scope; see "Known limitations".

## Current semantics

- Listens for NEW events and caches the complete draft without writing the main table.
- Later changes to top-level properties of a NEW draft re-queue it; entity refs restored or received across tabs follow the same rule.
- `entity.save()` (CREATE), REMOVE, or `discard()` cleans up the corresponding draft.
- Two kinds of entities don't get drafts: system tables (registered by core and plugins, such as the working tree plugin's commit table), and entities with the changelog disabled (`@Entity({ log: false })`), such as the storage plugin's file metadata. The latter never dispatches CREATE on save, so its draft would never get cleaned up. Drafts of these two kinds left in IndexedDB by older versions are deleted at `install()`.
- `install()` automatically reads IndexedDB; drafts of registered EntityTypes are restored as entity refs, and drafts of not-yet-registered types remain visible in `list()`. A failed first read rejects `ready`; after fixing the environment, call `install()` again to retry.
- `list()` returns a deep snapshot based on `structuredClone()` with no shared nested references to the internal cache; drafts containing uncloneable values throw `DataCloneError` synchronously.
- `flush()` is the IndexedDB write barrier. When the underlying write fails it rejects and restores the pending write/delete sets; it does not retry indefinitely in the background — call it explicitly again after fixing the environment. Uncloneable drafts are named via `WorkspaceFlushError.cacheIds`; other cloneable drafts still land on disk as usual.
- `changes$` emits when drafts, the staging state, or observable errors change. `corruptedEntries` contains both IndexedDB records that could not be decoded and the current cross-tab sync error; the latter is cleared automatically once sync recovers.
- Drafts are partitioned by writable checkout (`checkouts` of `@aiao/rxdb-plugin-working-tree`): each draft belongs to the table set it would be written into when saved. Memory, `list()`, `discard()`, and cross-tab sync only look at the one set this instance is currently mounted on. Draft keys on the main checkout stay `namespace:entity:id`; draft keys on writable checkouts get a table set suffix prefix (`wt_xxx:namespace:entity:id`). When remounting, queued writes are flushed to disk first, then drafts switch to the newly mounted set; `ready` waits for the switch to finish. Queued writes are accounted by their full partitioned keys; a draft with the same UUID created (or received from another tab) on the newly mounted tables before `ready` does not clobber the not-yet-flushed entry of the old partition.

## Installation

```bash
pnpm add @aiao/rxdb-plugin-workspace @aiao/rxdb
```

## Usage

```ts
import { rxDBPluginWorkspace } from '@aiao/rxdb-plugin-workspace';

// db has been configured according to the chosen adapter's documentation.
db.use(rxDBPluginWorkspace, { autoSave: true });
db.init();
await db.workspace.ready;

// a new entity enters the draft cache immediately
const todo = new Todo({ title: 'Write docs' });

// list all drafts (still there after a refresh)
const drafts = db.workspace.list();

// save to the main table: the draft leaves the cache automatically
await todo.save();

// or discard the draft
db.workspace.discard(drafts[0].cacheId);

await db.workspace.flush();
```

`autoSave` defaults to `true`. When set to `false`, events still update the in-memory queue and cross-tab state, but IndexedDB is not written automatically; the caller must run `await db.workspace.flush()` when persistence is needed.

## Lifecycle and single instance

An `RxDB` instance allows only one workspace instance over its entire lifetime:

- Repeated calls to `rxDBPluginWorkspace(db)` for the same database return the installed instance without adding listeners.
- Calling the internal constructor directly (`new RxDBPluginWorkspace(db)`, not exported from the package entry) throws before registering listeners.
- The options passed at first install are effective for the lifetime of that database; later repeated factory calls do not replace the configuration.

### Connection epochs

This plugin declares `lifecycle: 'scoped'`: the IndexedDB store, BroadcastChannel, flush subscription, and entity listeners are all registered per **connection epoch** on the scope received by `install(scope)` and released by the host in reverse order on `disconnectAll()`.

- The plugin identity `db.workspace` is published at construction, cannot be removed, and **survives epochs**. Disconnecting is not a terminal state; a new `connect()` reuses the same instance and enters a new epoch.
- Calling methods that need epoch resources between two epochs throws `workspace plugin is not installed in the current connection epoch`; they become available again after `await db.connect()`.
- `changes$` outlives any epoch: on disconnect it only stops emitting and does **not** complete.
- Teardown does not implicitly `flush()`; unflushed changes are discarded and a pending `flush()` is rejected.
- `destroy()` is deprecated and kept only as a manual entry for releasing the same scope; the host never calls it.

Normal usage should go through `db.use(rxDBPluginWorkspace, options)` and let RxDB manage install and teardown.

## Browser, SSR, and persistence boundaries

The plugin depends on the browser's `crypto.randomUUID()`, `structuredClone()`, and IndexedDB; cross-tab sync is enabled only when BroadcastChannel is available. All of these resources are acquired at `install()` (i.e. `db.connect()`); constructing the plugin itself does not touch them — so do not connect the database during the SSR render phase; `connect()` after browser hydration.

The workspace data in IndexedDB is a copy of drafts, not a database transaction log. Disconnects, browser site-data clearing, or storage quota errors can lose unflushed data. Critical flows must explicitly `await flush()`.

## Communication and data security

BroadcastChannel is not an authentication or authorization boundary. Any same-origin execution context that knows the database name can send add/remove messages to the workspace channel. Applications must rely on a trusted origin, CSP, and their own permission model; the channel must not be treated as a security control.

When a draft cannot be structured-cloned, the plugin keeps the local draft, skips that broadcast, and reports via `corruptedEntries` / `changes$` without interrupting RxDB's subsequent event listeners.

The plugin does not encrypt drafts and does not filter sensitive fields. Drafts are written to IndexedDB in the structure the application provides and may travel over the same-origin BroadcastChannel. Do not put data that must not be persisted or must not be exposed to same-origin scripts into workspace drafts.

## Known limitations

- **Unsaved UPDATE staging of existing entities: not supported.** The plugin only subscribes to `EntityStatus.patches$` for NEW drafts; an entity leaves the workspace once CREATE succeeds, and later unsaved UPDATEs are out of this plugin's scope.
- **In-place mutation of nested objects: not tracked.** The RxDB Entity Proxy only intercepts top-level property assignment. `draft.meta.nested.value = 'x'` does not re-queue; construct a new value and assign it back to the top-level field, e.g. `draft.meta = { ...draft.meta, nested: { value: 'x' } }`.
- **Public restore/rollback: not supported.** NEW drafts are restored automatically at install, but rolling back existing entities requires the full base/inverse patch data model and depends on the unsaved-UPDATE entry above.
- **DELETE undo: not supported.** REMOVE/CREATE currently only cleans up NEW drafts; snapshots of deleted entities are not kept.

Therefore the current package cannot serve as a complete Git-style entity workspace. Callers that need UPDATE staging or rollback of existing entities should use a separate data model and must not rely on this plugin's NEW draft cache.

## Removed APIs

`stagedChange()` / `unstageChange()` / `commit()` / `stagedCount` and `WorkspaceCacheEntry.staged` are legacy exports of the early Git-style staging flow and were removed in `0.0.24`.

These APIs have no equivalent replacement: the "existing entity UPDATE staging / commit" capability they carried was never in this plugin's scope (see the capability boundary in the previous section). The current public surface is only the NEW draft cache (`list()` / `discard()`), change listening (`changes$`), and auto-save (`autoSave` / `flush()`). Callers still relying on the old staging semantics need their own data model.

## Fileoverview

RxDB Workspace plugin
The workspace plugin provides local recovery for NEW entity drafts that have not been persisted yet

Main features:
- NEW draft cache (`list()` / `discard()`)
- IndexedDB persistence with automatic restore at install
- Cross-tab sync (BroadcastChannel)
- Change listening (`changes$`) and auto-save (`autoSave` / `flush()`)

## Classes

| Class | Description |
| ------ | ------ |
| [WorkspaceFlushError](classes/WorkspaceFlushError.md) | `flush()` failed because some drafts cannot be structured-cloned. |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [RxDBPluginWorkspaceOptions](interfaces/RxDBPluginWorkspaceOptions.md) | Workspace plugin configuration. |
| [WorkspaceCacheEntry](interfaces/WorkspaceCacheEntry.md) | Deep snapshot of a draft returned by RxDBPluginWorkspace.list. |
| [WorkspaceCorruptedEntry](interfaces/WorkspaceCorruptedEntry.md) | A record that could not be decoded; `key` is preserved as-is so callers can locate and clean it up. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [WorkspaceCacheId](type-aliases/WorkspaceCacheId.md) | The three-part `namespace:entity:id` draft primary key. |

## Variables

| Variable | Description |
| ------ | ------ |
| [rxDBPluginWorkspace](variables/rxDBPluginWorkspace.md) | Installs or retrieves the installed workspace plugin. |
