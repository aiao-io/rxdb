# Tree structure split: core → `@aiao/rxdb-plugin-tree`

Tree structures (the adjacency list model) were extracted from `@aiao/rxdb` core into a standalone plugin package, **effective from the next published version**: the entity base class, the `@TreeEntity` decorator, `TreeRepository`, the four tree query task types, and roughly 1,100 lines of tree-specific incremental merge all ship with `@aiao/rxdb-plugin-tree`. The four tree hooks of the three frameworks moved at the same time into `@aiao/rxdb-plugin-tree-{angular,react,vue}`.

**No data migration is involved.** The table structures, the `parentId` column, and existing data are untouched — the repository name is still `'TreeRepository'`, and the adapter public APIs are byte-for-byte unchanged. What must change: the dependency lists, the import sources, and the `use()` registration; besides that, this change adjusts the default depth of tree queries and removes a merge configuration entry that never took effect — migration steps below. Under the [versioning and API stability policy](../versioning.md), breaking changes are allowed in minor versions during 0.x.

## Why split

Trees are a capability that "only exists once installed", but before the split its cost was borne by **everyone**: the core's `QueryOptions` closed union carried 4 tree task types, the `merge_create` / `merge_update` / `merge_remove` switches each had a group of tree cases, and `EntityMetadataFeatures.tree` hung on the core metadata. That code was reachable from always-loaded switches, so tree-shaking could not help — applications that never use trees could not shed a single line.

After the split: applications without this package no longer pay that size; the incremental merge of tree queries is registered by the plugin itself per task type (`QueryManager.registerMerge{Create,Update,Remove}Fn`), and core keeps only the generic merge primitives.

## 1. Install

```bash npm2yarn
npm install @aiao/rxdb-plugin-tree
# Framework bindings (pick the one you need)
npm install @aiao/rxdb-plugin-tree-angular
npm install @aiao/rxdb-plugin-tree-react
npm install @aiao/rxdb-plugin-tree-vue
```

Applications that do not use trees do **not need** to install it, and see no behavioral difference.

## 2. `use()` must come before `init()`

```typescript
import { RxDB } from '@aiao/rxdb';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';

const db = new RxDB(config);
db.use(rxDBPluginTree); // ← must be before connect() / init()
await db.connect('sqlite-wasm');
```

`use()` only registers; the real install happens inside `init()`, before entity metadata validation. Skipping it makes entities that declare `@TreeEntity` fail at `init()`, with a message listing the currently registered repository names:

```
Repository 'TreeRepository' not found for entity 'Menu'. Registered repositories: Repository, GraphRepository.
This repository is registered by a plugin; make sure you called rxdb.use(...) for the plugin before init().
```

## 3. Symbol relocation table

### Core package → plugin package

`@aiao/rxdb` no longer exports the following symbols; take them from `@aiao/rxdb-plugin-tree`:

| Symbol                                                                                          | Notes                             |
| :---------------------------------------------------------------------------------------------- | :-------------------------------- |
| `TreeEntity`                                                                                    | Decorator                         |
| `TreeAdjacencyListEntityBase` / `TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS`                       | Entity base class and its options |
| `ITreeEntity` / `ISortableTreeEntity` / `TreeEntityType`                                        | Entity types                      |
| `TreeRepository` / `ITreeRepository` / `FindTreeOptions`                                        | Repository and query options      |
| `EntityMetadataTreeFeatures`                                                                    | Metadata type of `features.tree`  |
| `FindDescendantsQuery` / `FindAncestorsQuery` / `CountDescendantsQuery` / `CountAncestorsQuery` | The four query task types         |

```diff
- import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb';
+ import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb-plugin-tree';
```

**Manual ordering is not in the relocation list.** `manualOrder`, `Repository.reorder()`, and the ordering module stay in `@aiao/rxdb` core and do not move with the tree plugin; after a tree entity declares `manualOrder: { groupBy: ['parentId'] }`, `TreeRepository` inherits `reorder()` directly from `Repository`. See [Manual ordering (manualOrder and reorder)](../model-mutation/reorder.md).

`EntityMetadataFeatures.tree` is augmented by the plugin through `declare module '@aiao/rxdb'`: without the plugin installed, writing `features: { tree: ... }` is a **compile error**, not something silently ignored at runtime.

### Framework packages → framework plugin packages

The three frameworks' four tree hooks are no longer exported by `@aiao/rxdb-{framework}`:

| Before                                 | Now                              |
| :------------------------------------- | :------------------------------- |
| `@aiao/rxdb-angular`'s four tree hooks | `@aiao/rxdb-plugin-tree-angular` |
| `@aiao/rxdb-react`'s four tree hooks   | `@aiao/rxdb-plugin-tree-react`   |
| `@aiao/rxdb-vue`'s four tree hooks     | `@aiao/rxdb-plugin-tree-vue`     |

```diff
- import { useFindDescendants } from '@aiao/rxdb-react';
+ import { useFindDescendants } from '@aiao/rxdb-plugin-tree-react';
```

The four hooks (`useFindDescendants` / `useCountDescendants` / `useFindAncestors` / `useCountAncestors`) have **unchanged names, parameters, and return shapes**, still symmetric across the three frameworks — only the import source changed.

## 4. Core exposes the merge primitives

The tree incremental merge is truly incremental (unlike graph queries, which always refresh through SQL), and moving it into the plugin required core to expose a few internal primitives of the merge engine. They entered the API baseline and are now bound by compatibility commitments:

| Symbol                                            | Purpose                                                            |
| :------------------------------------------------ | :----------------------------------------------------------------- |
| `prepareIncrementalUpdate`                        | Prepares a batch of update events as incremental input             |
| `UpdateClassification` / `UpdateDataCache`        | Entry points for classification results and before/after snapshots |
| `applyExternalEntityUpdate`                       | Applies an external update onto the existing result                |
| `getEntityId`                                     | Entity identity                                                    |
| `isStaleEntityEvent` / `isStaleEntityRemoveEvent` | Stale event recognition (front guards)                             |

`classifyUpdates` and `invalidateEntityFingerprint` are **not** on this list: they are assembly details inside `prepareIncrementalUpdate` / `applyExternalEntityUpdate`, did not enter the API baseline, and `incremental-merge-surface.spec.ts` pins them down as "must stay internal to core". The plugin receives the `UpdateClassification` returned by `prepareIncrementalUpdate` and does not need to call the classifier itself.

Third-party plugins that implement their own incremental merge use this same set.

## 5. The code generator must declare the tree generator explicitly

Projects that generate client code with the CLI (`rxdb-client-generator`) or the Vite plugin, and have entities with `@TreeEntity`, must declare the tree repository generator in the configuration:

```diff
  // rxdb.config.ts
  export default [
    {
      entities: [path.join(__dirname, 'entities', '*.ts')],
      outDir: path.join(__dirname, 'dist', 'entities'),
+     repositoryGenerators: ['@aiao/rxdb-plugin-tree/generator#TreeRepositoryGenerator'],
      relationQueryDeep: 10
    }
  ];
```

The reason is the same as §2's `use()`: `TreeRepository`'s **build-time** code generator used to be hardcoded in `@aiao/rxdb-client-generator`, which made the generator package depend back on the plugin package. Now it ships with the plugin and is loaded by `repositoryGenerators` as `<module>#<export-name>` — `<module>` can be a package name (like `@aiao/rxdb-plugin-tree/generator` in the example above), a package subpath export, or a relative path; all three are resolved against the **project that owns the config file**, not against the directory the CLI runs in: running a subproject's config from the monorepo root, or passing an absolute config path from CI, works as long as the generator package is installed in that config-owning project's own `node_modules`; the CLI does not need to start from that project directory.

Missing this line is **fail-closed**, not a silent gap in the output:

```
No repository generator registered for "TreeRepository" (entity Menu). Add "@aiao/rxdb-plugin-tree/generator#TreeRepositoryGenerator" to `repositoryGenerators` in the generator config.
```

`@GraphEntity` is analogous: declare `'@aiao/rxdb-plugin-graph/generator#GraphRepositoryGenerator'`. Projects that only use `@Entity` are unaffected — the default `Repository` generator is still built in.

If you use `RxDBClientGenerator` directly in code (rather than the CLI), change to:

```diff
  import { RxDBClientGenerator } from '@aiao/rxdb-client-generator';
+ import { TreeRepositoryGenerator } from '@aiao/rxdb-plugin-tree/generator';

  const generator = new RxDBClientGenerator();
+ generator.registerRepositoryGenerator(new TreeRepositoryGenerator());
  generator.addEntity(Menu);
  generator.exec();
```

The `/generator` subpath is a build-time-only entry: it imports neither the decorators nor rxjs, and stays independent of the runtime entry. The generated output is **byte-for-byte unchanged** — the import source of `TreeAdjacencyListEntityBase`, the overloads of the four static methods, and `XxxTreeRuleGroup` are all exactly as before the move.

## 6. Adapters are unaffected

The **public APIs of the six adapters** PGlite / SQLite / SQLite-WASM / sqliteai / Supabase / wa-sqlite are **byte-for-byte untouched**: the `case 'TreeRepository'` string dispatch stays as-is, and the class names and signatures of `PGliteTreeRepository` / `SqliteTreeRepository` / `SupabaseTreeRepository` do not change; only the source of their types moved to this package. Adapter code written against the old docs needs no changes.

PGlite / SQLite Core / Supabase no longer load the tree plugin at runtime; they only declare the tree type contracts through optional peers, so applications that do not use trees are not forced to install the plugin. Applications using the tree APIs must install `@aiao/rxdb-plugin-tree` directly and register it, and must no longer rely on adapters installing the plugin indirectly. SQLite-WASM's tree plugin dependency is for development testing only.

## 7. Tree query default depth change (breaking change)

`findDescendants` / `findAncestors` and the corresponding `count*` queries, when `level` is not passed, changed from "anchor layer only" to "unlimited depth". The tree query bindings of Angular / React / Vue follow the same rule.

Callers that depend on the old default must pass `level: 0` explicitly:

```diff
- Category.findDescendants({ entityId: rootId });
+ Category.findDescendants({ entityId: rootId, level: 0 });
```

To read a whole subtree or a whole ancestor chain, omit `level`; to limit to direct children or the parent, pass `level: 1`. `find*` keeps the anchor; `count*` with an `entityId` does not count the anchor, so the count with `level: 0` is 0.

- `TREE_MAX_LEVEL` was removed; there is no global cap on user query depth anymore. Do not treat the old constant as "unlimited depth" — omitting `level` is how you get unlimited depth.
- `assertTreeLevel` returns `number | undefined`; omitting returns `undefined`, and explicit values must be non-negative safe integers — negatives, decimals, `NaN`, infinities, non-numbers, and unsafe integers all throw `RxDBError`, never clipped or rewritten to a default.
- `assertTreeLevel` is only provided by `@aiao/rxdb-plugin-tree`; core exports no tree domain APIs. Plugins, adapters, and core pagination share the generic validation `assertOptionalNonNegativeSafeInteger`; adapters do not need to load the tree plugin at runtime.
- PGlite / SQLite keep an internal 1,000-level recursion guard when `level` is omitted; the local incremental merge terminates through the visited-node set and has no corresponding depth cap. Data beyond 1,000 levels or containing cycles is outside the current consistency guarantees; this change does not address that boundary.

## 8. Ineffective merge configuration removed (breaking change)

`IRepositoryConfig.mergeOperations` and `MergeQueryTaskOptions` were removed. The former was configuration never wired into the execution path; do not keep using it to declare custom merge. The latter's imports must be deleted.

Custom queries' incremental handling should register through the repository's `queryManager`:

```typescript
repository.queryManager.registerMergeCreateFn(taskType, mergeCreate);
repository.queryManager.registerMergeUpdateFn(taskType, mergeUpdate);
repository.queryManager.registerMergeRemoveFn(taskType, mergeRemove);
```

Callback types can be extracted from the public method signatures, for example `type MergeCreate = Parameters<typeof repository.queryManager.registerMergeCreateFn>[1]`; the same for the update and remove callbacks. Do not import types from package-internal paths, and do not just give the old configuration object a new type name: the callbacks must be wired into the corresponding registration methods.

## See also

- [Tree structure plugin](../plugins/rxdb-plugin-tree/README.md): full usage and API
- [Tree structure modeling](/model-definition/structure-tree.md)
- [Plugin lifecycle migration](./plugin-scope.md): the `install(scope)` contract and what `lifecycle: 'scoped'` means for this plugin
- [Versioning and API stability](../versioning.md)
