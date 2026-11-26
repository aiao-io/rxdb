# createWorkingTreeCaptureRuntime()

```ts
function createWorkingTreeCaptureRuntime(adapter, entityManager, entities, databaseSync): WorkingTreeCaptureRuntime;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:666](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L666)

Builds the capture runtime from one database's entity registrations

## Parameters

| Parameter       | Type                                                                                                                              | Description                                                                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `adapter`       | `PhysicalTableNameSource`                                                                                                         | -                                                                                                                                                                                                      |
| `entityManager` | [`EntityManager`](../../rxdb/interfaces/EntityManager.md)                                                                         | Used to instantiate working tree units during capture                                                                                                                                                  |
| `entities`      | readonly [`EntityType`](../../rxdb/type-aliases/EntityType.md)[]                                                                  | All business entities registered in this database (`rxdb.config.entities`)                                                                                                                             |
| `databaseSync`  | \| [`SyncOptions`](../../rxdb/type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../../rxdb/interfaces/EntitySyncResolver.md) | The instance resolver `rxdb.entitySync` (including instance overrides); when the database-level `rxdb.config.sync` is passed, resolution follows "entity first, otherwise inherit database-level" only |

## Returns

[`WorkingTreeCaptureRuntime`](../classes/WorkingTreeCaptureRuntime.md)

A runtime that can be handed directly to `adapter.setWorkingTreeCaptureHook()`

## Throws

RxDBError when an entity cannot resolve an effective sync configuration

## Remarks

The sync strategy goes through [getEntitySync](../../rxdb/functions/getEntitySync.md) rather than reading `metadata.sync` directly: the "entity first, otherwise inherit database-level" rule already has one implementation, and reimplementing it here opens a second entry point for `QueryCache`'s judgment — while in the versioned domain, the only branch on `syncType` is precisely "is it QueryCache". Once the two diverge, the symptom is rows of some cache table being captured as user edits, and tracing it means walking the whole capture chain.

When a sync configuration cannot be resolved, throw rather than treat it as `Full`: `RxDBConfig.sync` is required, so this branch is unreachable in normal construction; reaching it means the configuration shape is no longer what this code assumes, and continuing as "not QueryCache" would silently bring a cache table into versioning.

**System tables are removed before the domain is built.** The incoming `rxdb.config.entities` has already been augmented with system tables by `SchemaManager.init()`; accepting them all would put tables like `rxdb_branch` / `rxdb_change` into `versionedTables`, shifting the entire judgment domain of the four-step raw-write gate — the database's own bookkeeping SQL would be rejected as business writes bypassing capture. Cleaning them out adds another layer: names the domain recognizes are necessarily business entities, which is exactly how [WorkingTreeCaptureRuntime.targetClassOf](../classes/WorkingTreeCaptureRuntime.md#targetclassof) asks the domain first and the system-table list second.
