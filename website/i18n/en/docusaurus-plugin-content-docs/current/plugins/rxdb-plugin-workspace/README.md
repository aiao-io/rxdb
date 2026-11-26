# @aiao/rxdb-plugin-workspace

`@aiao/rxdb-plugin-workspace` is a workspace plugin that keeps **NEW entity drafts that are not in the database yet** in memory and IndexedDB, and syncs them between same-origin tabs through BroadcastChannel. After a refresh or reopening the page, drafts recover automatically and can be edited, saved, or discarded.

## Current status

Available:

- NEW draft cache + IndexedDB persistence (`idb-keyval`), auto-recovered by `install()` after a restart
- `list()` to view draft snapshots, `discard(cacheId)` to discard a single draft
- `entity.save()` lands in the main table and automatically removes the draft from the cache
- `flush()` as a write barrier, an `autoSave` switch, `changes$` change notifications
- add / remove sync between same-origin tabs

> The scope is NEW drafts only. **Unsaved UPDATE staging** for existing entities and inverse-patch-based **restore / rollback** are not provided, limited by the RxDB core event entry points; see "Current boundaries" for details.

## Fitting scenarios

- Local staging of newly created objects (not yet saved to the database)
- Recovering an "uncommitted new object" after a page refresh
- Multiple tabs sharing the same new-object draft

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-workspace
```

## Usage

```ts
import { rxDBPluginWorkspace } from '@aiao/rxdb-plugin-workspace';

// db is already configured per the chosen adapter's documentation.
db.use(rxDBPluginWorkspace, { autoSave: true });
db.init();
await db.workspace.ready;

// A new entity enters the draft cache
const todo = new Todo({ title: 'Write docs' });

const drafts = db.workspace.list(); // WorkspaceCacheEntry[]

await todo.save(); // lands in the main table, the draft leaves the cache automatically
db.workspace.discard(drafts[0].cacheId); // or discard the draft directly

await db.workspace.flush(); // explicitly wait for the IndexedDB write
```

`autoSave` defaults to `true`. Set to `false` and events still update the in-memory queue and the cross-tab state, but IndexedDB is not written automatically; the caller must `await db.workspace.flush()` when persistence is needed.

## Writable checkouts: drafts are partitioned by checkout

With a working-tree plugin's writable checkout mounted (`db.workingTree.checkouts`), each draft belongs to the table set it would be written into when saved:

- Drafts created while mounted on a writable checkout are only visible on that checkout; drafts on the main checkout are only visible on the main checkout. `list()`, `discard()`, and cross-tab sync only look at the table set this instance is currently mounted on. Entities that never enter a checkout's shadow tables (QueryCache-synced ones) always write to the main tables, so their drafts are visible on every checkout.
- On remount (`checkouts.mount()` / `mountMain()`), queued writes land on disk first, then the drafts switch to the newly mounted table set; `await db.workspace.ready` waits for the switch. Queued writes are accounted by their full partitioned key: a draft with the same UUID created on the newly mounted table set (or received from another tab) before `ready` does not clobber the old partition's not-yet-landed draft.
- In IndexedDB, main-checkout draft keys stay `namespace:entity:id`; writable-checkout draft keys are prefixed with that table set's suffix (`wt_xxx:namespace:entity:id`); previously stored drafts need no migration.
- Entity objects obtained before a remount (including unsaved drafts) cannot be saved onto another table set: `save()` throws `WorktreeTableSetMismatchError`. Mount back to the original table set and save, or create the entity anew on the current checkout.

## Current boundaries

- The goal is a temporary workspace capability, not a general-purpose sync solution; it does not own a formal data persistence protocol
- **Unsaved UPDATE staging: not supported.** Global UPDATE events are dispatched after a successful database write and do not represent unsaved edits in a Proxy
- **restore / rollback: not supported.** NEW drafts recover automatically at install time; rolling back existing entities needs a complete base/inverse patch model. Today there is only `discard(cacheId)`, no `restore()`
- **DELETE undo: not supported.** REMOVE / CREATE events only clean up the corresponding NEW draft
- **Entities that do not take drafts**: system tables (registered by core and plugins), and entities with the change log off (`@Entity({ log: false })`), such as the storage plugin's file metadata. The latter dispatch no CREATE on save, so the draft would wait forever for cleanup; drafts of both kinds left in IndexedDB by older versions are deleted at `install()`
- Depends on the browser's `crypto.randomUUID()` and IndexedDB; do not construct the plugin during SSR rendering
- BroadcastChannel is not an authentication boundary and drafts are not encrypted: do not put data that must not be persisted or must not be exposed to same-origin scripts into drafts

For these reasons, the current version is not yet a complete Git-style entity workspace.

## Next steps

- For the complete API, see the [API reference](/api/rxdb-plugin-workspace/README.md)
- If you only need stable capabilities, prefer core entities and a local adapter
- If you need file storage, see [@aiao/rxdb-plugin-storage](../rxdb-plugin-storage/README.md)
