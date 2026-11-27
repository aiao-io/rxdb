# @aiao/rxdb-plugin-tree

`@aiao/rxdb-plugin-tree` provides tree structures on the adjacency list model for RxDB: the entity base class, the decorator, `TreeRepository`, and **true incremental merge** for the four tree queries.

This capability used to be built into `@aiao/rxdb`. Core held 4 tree query task types, tree branches in 3 merge switches, and roughly 1100 lines of tree-specific merge logic — reachable from always-loaded switches, impossible for tree-shaking to drop, so applications that never used trees still paid for the bytes. After the extraction, installing the plugin is what gives you trees.

It fits these scenarios:

- Menu trees, directory trees, file trees
- Organization charts, category hierarchies
- Any "one nullable parent + query ancestors/descendants" model

## What it provides

- `@TreeEntity()`: declares a tree entity (and defaults its repository type to `TreeRepository`)
- `TreeAdjacencyListEntityBase`: provides `parentId`, `parent$`, `children$`, `hasChildren`, and the four tree query static methods
- `findDescendants()` / `countDescendants()` / `findAncestors()` / `countAncestors()`: the tree query APIs
- `TreeRepository`: the default repository for tree queries and incremental merge registration

## Manual ordering lives in core

Drag-and-drop manual ordering (`manualOrder` / `Repository.reorder()`) is in the core package `@aiao/rxdb`, not a capability of this plugin, and does not depend on this plugin: the ordering module sits on the engine's write path, and the dependency direction is tree plugin → ordering module. When a tree entity declares `manualOrder: { groupBy: ['parentId'] }` (with a non-null `sortOrder`), siblings under the same parent form one ordering domain; `TreeRepository` extends `Repository` and naturally inherits `reorder()`.

The recommended way to drag across parents is to append to the end of the target node's children without reading them — correct even when the target is not expanded:

```ts
await repository.reorder(draggedId, { group: { parentId: target.id } });
```

For the full story, see [Manual ordering (manualOrder and reorder)](/model-mutation/reorder.md).

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-tree
```

## Usage

```typescript
import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { TreeAdjacencyListEntityBase, TreeEntity, rxDBPluginTree } from '@aiao/rxdb-plugin-tree';

@TreeEntity({
  name: 'Category',
  properties: [{ name: 'name', type: PropertyType.string }],
  features: { tree: { hasChildren: true } }
})
class Category extends TreeAdjacencyListEntityBase {
  name!: string;
}

const rxdb = new RxDB({
  dbName: 'catalog',
  entities: [Category],
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
});

// Must use() before init(): repository registration happens inside init(), earlier than entity metadata validation.
rxdb.use(rxDBPluginTree).adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS' }));

await rxdb.connect('wa-sqlite');
rxdb.init();

Category.findDescendants({ entityId: rootId, level: 2 }).subscribe(nodes => {
  console.log(nodes.length);
});
```

Without the plugin, an entity declaring `repository: 'TreeRepository'` (which `@TreeEntity` writes automatically) makes `init()` throw and list the currently registered repository names.

## Query semantics

`level` includes the current node itself: `level: 0` is only the current node, `level: 1` is the current node + its direct children. Non-number values (strings, decimals, NaN) throw `RxDBError` at the adapter layer — no fallback.

- `findDescendants` / `findAncestors`: with `entityId`, return "the current node + its descendants / ancestors".
- `countDescendants` / `countAncestors`: with `entityId`, **exclude** the current node and count only descendants / ancestors.
- Without `entityId`, the starting points are all root nodes.
- `where` only filters nodes produced by the recursive expansion: starting points (the current node when `entityId` is given, all root nodes when it is not) do not pass `where` and are not limited by `level`; a node that fails to match at some level truncates the expansion there, and its descendants (for `findAncestors`, its ancestors above) are not returned even if they match themselves. Incremental merge of live queries matches the SQL re-query.

## Incremental merge

Tree queries differ from graph queries: graph queries always re-run SQL `refresh()`, tree queries go through true incremental merge. `TreeRepository` registers `merge_create` / `merge_update` / `merge_remove` by task type at construction time, and three front guards run before entering the incremental path:

1. `task.result === undefined` → refresh;
2. The event contains a stale entity (`isStaleEntityEvent`) → refresh;
3. `findAncestors` with a changed `parentId` → refresh (the ancestor chain has been rewritten; incrementality is impossible).

`find*` goes through recalculate, `count*` through refresh. Starting points do not pass `where` (see "Query semantics" above), so refresh decisions count them separately: creating or deleting a starting point sends `count*` back to SQL; for `findAncestors`, when the current node is newly created and its ancestor links to a node outside this batch of events and the old results, it goes back to SQL; without `entityId` but with `where` or `level`, a node changing parents across or out of the root level also goes back to SQL; in a `findDescendants` with `level`, a node in the results changing parents goes back to SQL too — its subtree depth shifts with it: moving up brings previously truncated descendants into range, moving down pushes descendants in the results out of range. The merge primitives in use (`prepareIncrementalUpdate` / `UpdateDataCache` / `applyExternalEntityUpdate` / `getEntityId` / `isStaleEntityEvent` / `isStaleEntityRemoveEvent`, and so on) are public exports of `@aiao/rxdb` and covered by the compatibility promise once in the baseline; `classifyUpdates` / `invalidateEntityFingerprint` are internal core assembly details, not on the public surface.

## Connection epochs

The plugin declares `lifecycle: 'scoped'`; its only host mutation — registering `TreeRepository` — is registered on the scope received by `install(scope)` and revoked with the scope on `disconnectAll()`. A new `connect()` re-registers.

## Framework bindings

The four tree query hooks live in their framework packages, with the same names and shapes across all three:

| Framework | Package                          | Entry points                                                                            |
| :-------- | :------------------------------- | :-------------------------------------------------------------------------------------- |
| Angular   | `@aiao/rxdb-plugin-tree-angular` | `useFindDescendants` / `useCountDescendants` / `useFindAncestors` / `useCountAncestors` |
| React     | `@aiao/rxdb-plugin-tree-react`   | Same as above                                                                           |
| Vue       | `@aiao/rxdb-plugin-tree-vue`     | Same as above                                                                           |

Plugin installation still happens on the database side (`rxdb.use(rxDBPluginTree)`); the binding packages only handle subscriptions and state containers.

## Adapters

The name `TreeRepository` is unchanged; adapters still dispatch on the string `'TreeRepository'`, and the public API has not moved a letter. The `*TreeRepository` implementations in PGlite / SQLite / Supabase only changed where their types come from — now this package.

## Further reading

- [Modeling tree structures](/model-definition/structure-tree.md)
- [findDescendants](/model-query/findDescendants.md) / [findAncestors](/model-query/findAncestors.md)
- [Tree structure extraction migration](/migration/tree-split.md)
- [API reference](/api/README.md)
