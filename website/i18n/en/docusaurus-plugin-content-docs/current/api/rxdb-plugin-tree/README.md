# rxdb-plugin-tree

> Implements: [US-025 core plugin extraction](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

The RxDB tree structure plugin: an adjacency-list entity base class, decorator, `TreeRepository`, and **true incremental merge** for the four tree queries.

This capability used to be built into `@aiao/rxdb`. The core carried 4 tree task types, tree branches in 3 merge switches and about 1100 lines of tree-specific merge logic — reachable from always-loaded switches, immune to tree-shaking, so applications that never use trees still paid for the size. After the extraction, trees only exist if the plugin is installed.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite @aiao/rxdb-plugin-tree
```

## Usage

```typescript
import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { TreeAdjacencyListEntityBase, TreeEntity, rxDBPluginTree } from '@aiao/rxdb-plugin-tree';

@TreeEntity({
  name: 'Category',
  properties: [{ name: 'name', type: PropertyType.string }],
  features: `{ tree: { hasChildren: true } }`
})
class Category extends TreeAdjacencyListEntityBase {
  name!: string;
}

const rxdb = new RxDB({
  dbName: 'catalog',
  entities: [Category],
  sync: `{ type: SyncType.None, local: { adapter: 'wa-sqlite' } }`
});

// Must use() before init(): repository registration happens inside init(), before entity metadata validation.
rxdb.use(rxDBPluginTree).adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS' }));

await rxdb.connect('wa-sqlite');
rxdb.init();

Category.findDescendants({ entityId: root.id, level: 2 }).subscribe(nodes => {
  console.log(nodes.length);
});
```

Without the plugin, an entity declaring `repository: 'TreeRepository'` (which `@TreeEntity` writes automatically) makes `init()` throw immediately, listing the currently registered repository names.

## Public surface

| Category   | Symbols                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------- |
| Plugin     | `RxDBPluginTree`, `rxDBPluginTree`                                                           |
| Entity     | `TreeAdjacencyListEntityBase`, `TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS`, `@TreeEntity`      |
| Types      | `ITreeEntity`, `ISortableTreeEntity`, `TreeEntityType`, `EntityMetadataTreeFeatures`         |
| Repository | `TreeRepository`, `ITreeRepository`, `FindTreeOptions`                                       |
| Queries    | `FindDescendantsQuery`, `FindAncestorsQuery`, `CountDescendantsQuery`, `CountAncestorsQuery` |

The four query task types are attached to the core `QueryOptions` union through `RepositoryQueryExtensions` module augmentation — the only seam through which a plugin can add branches to the core's closed union.

## Query semantics

`level` includes the current node itself: `level: 0` returns only the current node, `level: 1` returns the current node + its direct children. Non-number values (strings, decimals, NaN) throw `RxDBError` directly at the adapter layer — no fallback.

- `findDescendants`: with `entityId` specified, the current node and its descendants; without it, all root nodes and their descendants.
- `findAncestors`: with `entityId` specified, the current node and its ancestor chain; without it, all root nodes (roots have no ancestors above them).
- `countDescendants` / `countAncestors`: same scope as the corresponding `find*`; with `entityId` specified, the current node itself is **not** counted.
- `where` only filters the nodes produced by recursive expansion: the starting points (the current node when `entityId` is given, all root nodes otherwise) do not pass through `where` and are not subject to the `level` limit; a level that fails to match truncates the expansion there, and the descendants under it (for `findAncestors`, the ancestors above it) are not returned even if they match on their own. The incremental merge of live queries uses the same semantics as the SQL re-query.

## Incremental merge

Tree queries differ from graph queries: graph queries always fall back to a SQL `refresh()`, tree queries take the true incremental path. `TreeRepository` registers `merge_create` / `merge_update` / `merge_remove` by task type at construction; the incremental path is only entered after three guards:

1. `task.result === undefined` → refresh;
2. the event contains a stale entity (`isStaleEntityEvent`) → refresh;
3. `findAncestors` and `parentId` changed → refresh (the ancestor chain has been rewritten, incremental is out of the question).

`find*` goes through recalculate, `count*` goes through refresh. Starting points do not pass through `where` (see "Query semantics" above), so they are handled separately when deciding a refresh: creating or deleting a starting point sends `count*` back to SQL; `findAncestors` falls back to SQL when the current node is newly created and its ancestor chain points to nodes outside both this batch of events and the old result; without `entityId` and with `where` or `level`, a node whose parent changed and crossed into or out of the root level also falls back to SQL; and in a `findDescendants` with `level`, a result node whose parent changed falls back to SQL — the depth of the subtree under it shifts along, an upward move brings previously truncated descendants into range and a downward move pushes result descendants out of range. The merge primitives used (`prepareIncrementalUpdate` / `applyExternalEntityUpdate` / `getEntityId`, etc.) are publicly exported by `@aiao/rxdb` and bound by compatibility commitments once in the baseline; `classifyUpdates` and `invalidateEntityFingerprint` are core-internal assembly details and not part of the public surface.

## Connection epoch

The plugin declares `lifecycle: 'scoped'`. Its only host change — registering `TreeRepository` — is recorded on the scope received by `install(scope)` and revoked together with the scope on `disconnectAll()`. Re-`connect()` re-registers.

## Framework bindings

The four tree query hooks live in their own framework packages, with identical names and shapes across all three:

- Angular: [`@aiao/rxdb-plugin-tree-angular`](../rxdb-plugin-tree-angular/README.md)
- React: [`@aiao/rxdb-plugin-tree-react`](../rxdb-plugin-tree-react/README.md)
- Vue: [`@aiao/rxdb-plugin-tree-vue`](../rxdb-plugin-tree-vue/README.md)

## Adapters

The name `TreeRepository` is unchanged, adapters still dispatch on the string `'TreeRepository'`, and the public API is untouched. The `*TreeRepository` classes of PGlite / SQLite / Supabase only changed where their types come from — now this package.

## Migration

For upgrading from the built-in tree, see the [tree-split migration guide](https://github.com/aiao-io/rxdb/blob/main/website/docs/migration/tree-split.md).

## Development commands

```bash
pnpm nx test rxdb-plugin-tree              # Node environment; runs only the build-time generator specs
pnpm nx run rxdb-plugin-tree:test-browser  # Runs the node pass first (a dependency of the coverage target), then the runtime specs in real chromium
```

`vite.config.mts` splits the tests into two passes based on the `VITEST_BROWSER` environment variable: without the variable (the path `nx test` takes), all `*.browser.spec.ts` are excluded and only the build-time generator specs under `src/__tests__/generator/` remain; the runtime specs for query / merge / repository all end in `.browser.spec.ts` and only run when `VITEST_BROWSER=true` (i.e. `test-browser`).

So `pnpm nx test rxdb-plugin-tree --watch` for TDD **silently** skips all runtime specs — after changing query / merge / repository code, only `test-browser` can tell you whether the tests went red.

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

RxDB Tree plugin
A tree structure plugin providing the adjacency-list entity base class, decorator, repository, and incremental query merging

Main features:

- Tree entity base class and decorator (`TreeAdjacencyListEntityBase` / `@TreeEntity`)
- Four tree queries (`findDescendants` / `countDescendants` / `findAncestors` / `countAncestors`)
- True incremental merge for tree queries (unlike graph queries, which always fall back to a SQL refresh)

## Classes

| Class                                                                 | Description                                                                                               |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [RxDBPluginTree](classes/RxDBPluginTree.md)                           | The tree structure plugin.                                                                                |
| [TreeAdjacencyListEntityBase](classes/TreeAdjacencyListEntityBase.md) | Tree entity decorator configuration; defines the parent-child relationship required by the tree structure |
| [TreeRepository](classes/TreeRepository.md)                           | Tree structure entity repository; decides the concrete operations of an entity based on configuration     |

## Interfaces

| Interface                                                              | Description                                                                                                                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CountAncestorsQuery](interfaces/CountAncestorsQuery.md)               | CountAncestors query task; counts the ancestor nodes of the given entity                                                                                        |
| [CountDescendantsQuery](interfaces/CountDescendantsQuery.md)           | CountDescendants query task; counts the descendant nodes of the given entity                                                                                    |
| [EntityMetadataTreeFeatures](interfaces/EntityMetadataTreeFeatures.md) | Interface for tree structure features in entity metadata                                                                                                        |
| [FindAncestorsQuery](interfaces/FindAncestorsQuery.md)                 | FindAncestors query task; finds all ancestor nodes of the given entity                                                                                          |
| [FindDescendantsQuery](interfaces/FindDescendantsQuery.md)             | FindDescendants query task; finds all descendant nodes of the given entity                                                                                      |
| [FindTreeOptions](interfaces/FindTreeOptions.md)                       | Tree query configuration                                                                                                                                        |
| [ISortableTreeEntity](interfaces/ISortableTreeEntity.md)               | Interface for tree entities supporting manual ordering.                                                                                                         |
| [ITreeEntity](interfaces/ITreeEntity.md)                               | Base entity interface; defines the basic properties shared by all entities. To sync better with remote data, all entity classes should implement this interface |
| [ITreeRepository](interfaces/ITreeRepository.md)                       | Tree repository interface                                                                                                                                       |

## Type Aliases

| Type Alias                                       | Description                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| [TreeEntityType](type-aliases/TreeEntityType.md) | Tree entity type                                                                                           |
| [TreeQuery](type-aliases/TreeQuery.md)           | Union of the four tree query tasks.                                                                        |
| [TreeQueryType](type-aliases/TreeQueryType.md)   | Union of tree query task types, derived from [TREE\_QUERY\_TYPE\_LIST](variables/TREE_QUERY_TYPE_LIST.md). |

## Variables

| Variable                                                                                             | Description                                                                                        |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [rxDBPluginTree](variables/rxDBPluginTree.md)                                                        | Factory of [RxDBPluginTree](classes/RxDBPluginTree.md), passed to `RxDB.use()`.                    |
| [TREE\_ADJACENCY\_LIST\_ENTITY\_BASE\_OPTIONS](variables/TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS.md) | The `@Entity` metadata of `TreeAdjacencyListEntityBase`.                                           |
| [TREE\_QUERY\_TYPE\_LIST](variables/TREE_QUERY_TYPE_LIST.md)                                         | The **single source** of tree query task types.                                                    |
| [TREE\_QUERY\_TYPES](variables/TREE_QUERY_TYPES.md)                                                  | Set of tree query task types                                                                       |
| [TreeEntity](variables/TreeEntity.md)                                                                | Tree entity decorator; marks a class as a tree structure entity and handles tree-specific metadata |

## Functions

| Function                                        | Description                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| [assertTreeLevel](functions/assertTreeLevel.md) | Validates the tree query depth; keeps the unlimited-depth semantics when not provided. |
