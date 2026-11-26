# rxdb

A TypeScript database core for local-first applications. Through decorator-driven entity definitions, it automatically generates type-safe Repository and reactive query APIs, letting you run SQLite directly in the browser and build offline-first, data-driven web applications in a way close to native apps.

`@aiao/rxdb` is the engine core, decoupled from specific storage backends — connect wa-sqlite / PGlite / Supabase / sqliteai through adapters, and Angular / React / Vue through framework bindings.

## Installation

```bash
pnpm add @aiao/rxdb rxjs
```

The core package does not provide a storage implementation directly; it must be used together with an adapter, for example in-browser SQLite:

```bash
pnpm add @aiao/rxdb-adapter-wa-sqlite
```

## Core capabilities

- **Decorator-driven entities**: declare data models and field metadata with `@Entity` / `@TreeEntity`
- **Type-safe Repository**: CRUD and relation query interfaces are automatically derived from entities
- **Reactive queries**: query results are pushed as RxJS Observables and automatically refreshed on data changes
- **Change tracking and transactions**: built-in diff, change events and transaction support
- **Transaction executor**: `TransactionExecutor` converges the "writes inside this transaction" criterion to one place — `adapter.transaction(tx => tx.getRepository(X).create(...))` instead of `adapter.transaction(async () => entity.save())` (the latter falls back to the queue and hangs forever)
- **Migration executor**: the `MigrationType.up(executor)` parameter; writes inside user migrations must be issued through the executor, there is no other way
- **Adapter-agnostic**: the same models can run on top of different storage backends

### Transaction and migration API quick reference

```typescript
import { TransactionExecutor, MigrationType } from '@aiao/rxdb';

// 1. Transactions — holding the executor is what counts as "inside this transaction"; the repository only accepts entity instances, not plain objects
await adapter.transaction(async executor => {
  const repo = executor.getRepository(Todo);
  await repo.create(rxdb.entityManager.instantiate(Todo, { title: 'inside tx' }));
  // await todo.save()  // ❌ entity methods are always external calls: they fall back to the queue and hang forever
});

// 2. Nested inner work — reuse the current executor, do not open a new transaction
await adapter.transaction(async executor => {
  await executor.run(async inner => {
    await inner.getRepository(Todo).create(rxdb.entityManager.instantiate(Todo, { title: 'nested' }));
  });
});

// 3. Merge remote changes into this transaction
await adapter.transaction(async executor => {
  await executor.mergeChanges(actions, localChanges, disableTriggers);
});

// 4. Migrations — the executor must be handed to the user
const migration: MigrationType = {
  name: '001-init',
  async up(executor) {
    // Migrations run after init(), entity classes are already bound to the instance, so they can be newed directly
    await executor.getRepository(Seed).create(new Seed({ ... }));
  },
  async down() {}
};
```

> The old signatures `tx => tx.execute(sql)` and `MigrationType.up()` (no parameters) remain compatible — TS allows fewer parameters.

## Quick start

Fields **must** be declared in `properties`. TypeScript field types are erased after compilation, and decorators cannot derive persisted properties from declarations like
`title!: string` — an entity that only has class fields can be assigned normally, but nothing will be written to the database.

```typescript
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';

@Entity({
  name: 'Todo',
  tableName: 'todo',
  namespace: 'public',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    `{ name: 'done', type: PropertyType.boolean }`
  ]
})
export class Todo extends EntityBase {
  title!: string;
  done!: boolean;
}
```

The minimal loop — register an adapter, connect, write, query:

```typescript
import { firstValueFrom } from 'rxjs';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: `{ local: { adapter: 'sqlite' }, type: SyncType.None }`
});

rxdb.adapter('sqlite', db => createYourSqliteAdapter(db));
await rxdb.connect('sqlite');

const repository = rxdb.entityManager.getRepository(Todo);
// The repository only accepts entity instances: first build the entity against this instance, then hand it to the repository. Plain objects have no entity metadata and are rejected before writing
await repository.create(rxdb.entityManager.instantiate(Todo, { title: 'write docs', done: false }));

// find() returns a live query Observable that re-emits automatically on data changes
const todos = await firstValueFrom(repository.find({ where: { combinator: 'and', rules: [] } }));
```

See the documentation site for the complete usage of entity definitions, queries and mutations.

## Optional capability: local working tree and commit history

`@aiao/rxdb-plugin-working-tree` adds two first-class concepts to a database: "uncommitted changes" and "commit history". User edits land in the working tree instead of directly modifying main data, `commit()` commits them as a snapshot in one go, and `restore()` moves the content of a historical version back into the working tree.

**Databases without this plugin installed cost nothing** — the ten system tables, write capture, and commit graph codec all ship with the package; the core only keeps the install/uninstall ports and two hand-off gates.

```typescript
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

rxdb.use(rxDBPluginWorkingTree); // ← must be before connect()
await rxdb.connect('sqlite');
await rxdb.workingTree.enable();
```

After enabling, the core leaves a capability watermark row in `rxdb_migration`; **when a client without the corresponding plugin opens the database again, the core refuses the connection** and reports the exact package name to install. This guard works for third-party plugins too: the package name is written into the watermark row by the plugin itself, the core does not need to know it.

Six things to know before enabling (see the [plugin page](https://rxdb.aiao.io/docs/plugins/rxdb-plugin-working-tree) on the documentation site for the full version):

1. **Commit capability is an explicit database-level switch** — after a single `enable()`, all entities and all branches of the database run under working-tree semantics; from then on every client that accesses this database must have the plugin installed, including old versions and the ones you do not control. v1 has no `disable()`.
2. **The working tree is not a draft cache.** The working tree holds changes that have "already been written to the database but not yet committed as a snapshot", which participate in transactions and are visible to queries; the draft cache of `@aiao/rxdb-plugin-workspace` holds "not yet saved" editor buffers that have never entered the main database. The two layers each manage their own thing and cannot be merged.
3. **Restore is not checkout.** `restore()` writes the content of a historical commit back into the working tree as **new uncommitted changes**: HEAD does not move, history is not deleted, the working tree becomes dirty, and the next step is `commit()` or `discard()`. There is no detached HEAD, and no `checkout()`.
4. **History preserves sensitive old values as-is.** A field that was written into a commit stays in that commit forever; later changes, clearing, or row deletion do not touch it; v1 has no public API that can remove it from history. **Do not write things that should leave no trace into a database with commit capability enabled** — fields that need right-to-erasure are not suitable to be stored here directly.
5. **The encryption boundary.** On backends that support field encryption, encrypted fields in commits, the working tree and restore sessions are still persisted as versioned envelopes; the persistence path never decrypts before writing plaintext, and errors and digests carry no plaintext either. But encryption protects the **bytes on disk** — legitimate reads after unlocking still get the old values, so it does not dissolve point 4, nor can point 4 replace it.
6. **History is never rewritten.** There is no amend / rebase / squash, no "editing commit messages", and no auto-baseline. When the commit graph is corrupted, the guard only marks the branch as `corrupted_read_only` and leaves diagnostics behind, **without moving HEAD or deleting records**.

One more easily missed: **changes pulled down by remote sync enter the working tree just like user edits**, counted in `status().byOrigin` as `origin = 'remote_sync'` and **not exempt** — they make `clean` become `false` and are committed together by the next `commit()` (the committer is that `commit()`'s `authorId`; v1 does not forge remote author identities). "The working tree suddenly became dirty after a sync" is normal behavior, not a defect.

### What write capture can and cannot catch

Write capture only covers **the write paths through the adapter and the bulk write methods the adapter exposes**. External database handles that bypass the adapter — another process opening the same SQLite file directly, a separate PGlite instance, hand-written SQL in DevTools — **cannot be caught, and v1 does not promise to catch them**; such writes do not enter the working tree, do not enter history, and are invisible to `status()`.

Therefore a database with commit capability enabled has one hard constraint: **business tables may only be written through RxDB**. This sentence is not a footnote to a disclaimer: not pretending to catch something is more important than failing to catch it — a gate that claims to catch but cannot would make people treat "no error" as "not bypassed".

## Documentation

- Repository home and roadmap: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- See the project documentation site for the API reference, getting started guide and framework integration guides
- Working tree and commit history: [the `@aiao/rxdb-plugin-working-tree` plugin page](https://rxdb.aiao.io/docs/plugins/rxdb-plugin-working-tree)

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

RxDB core package - reactive database client
Provides entity management, version control, query management and more

## Enumerations

| Enumeration | Description |
| ------ | ------ |
| [OnDeleteAction](enumerations/OnDeleteAction.md) | Foreign key constraint action enumeration. Defines the cascade behavior of SQLite foreign key constraints |
| [OnUpdateAction](enumerations/OnUpdateAction.md) | Foreign key update action enumeration. Defines the cascade behavior when a parent table's primary key is updated |
| [PropertyType](enumerations/PropertyType.md) | Entity property type enumeration. Defines the data types supported by entity properties |
| [RelationKind](enumerations/RelationKind.md) | Entity relation type enumeration. Defines the possible relation types between entities |
| [SyncStatus](enumerations/SyncStatus.md) | Sync status enumeration |
| [SyncType](enumerations/SyncType.md) | Sync type enumeration. Defines different data sync strategies, controlling how data is synced between local and remote |

## Classes

| Class | Description |
| ------ | ------ |
| [AmbiguousActiveBranchError](classes/AmbiguousActiveBranchError.md) | More than one row in `RxDBBranch.activated` is true. |
| [CapabilityEnabledEvent](classes/CapabilityEnabledEvent.md) | Capability enabled event (FR-037). |
| [ConflictDetectedEvent](classes/ConflictDetectedEvent.md) | Conflict detected event |
| [ConflictPendingEvent](classes/ConflictPendingEvent.md) | Conflict pending event |
| [EntityBase](classes/EntityBase.md) | Entity base class. All entities that need to sync should extend this class |
| [EntityLocalCreatedEvent](classes/EntityLocalCreatedEvent.md) | Local entity created event |
| [EntityLocalNewEvent](classes/EntityLocalNewEvent.md) | Local entity initialization event |
| [EntityLocalRemovedEvent](classes/EntityLocalRemovedEvent.md) | Local entity removed event |
| [EntityLocalUpdatedEvent](classes/EntityLocalUpdatedEvent.md) | Local entity updated event |
| [EntityRelationResolutionError](classes/EntityRelationResolutionError.md) | Failed to resolve a relation target. |
| [EntityRemoteCreatedEvent](classes/EntityRemoteCreatedEvent.md) | Remote entity created event |
| [EntityRemoteRemovedEvent](classes/EntityRemoteRemovedEvent.md) | Remote entity removed event |
| [EntityRemoteUpdatedEvent](classes/EntityRemoteUpdatedEvent.md) | Remote entity updated event |
| [InvalidBranchIdError](classes/InvalidBranchIdError.md) | Thrown when a branch id is unusable. |
| [LWWConflictResolver](classes/LWWConflictResolver.md) | Last-Write-Wins conflict resolver |
| [MalformedRxDBCapabilityWatermarkError](classes/MalformedRxDBCapabilityWatermarkError.md) | A watermark row that has the prefix but cannot be read as a triple. |
| [MergeBranchBeginEvent](classes/MergeBranchBeginEvent.md) | Branch merge begin event |
| [MergeBranchCommitEvent](classes/MergeBranchCommitEvent.md) | Branch merge commit event |
| [MergeBranchEventBase](classes/MergeBranchEventBase.md) | Common payload of the three branch merge events |
| [MergeBranchFailedEvent](classes/MergeBranchFailedEvent.md) | Branch merge failed event |
| [NetworkOfflineError](classes/NetworkOfflineError.md) | Network offline error — thrown when `offlineFallback` is enabled but no local cache is available |
| [NoActiveBranchError](classes/NoActiveBranchError.md) | At runtime there is no active branch row at all. |
| [PermissionDeniedError](classes/PermissionDeniedError.md) | A public write entrance rejected an operation that only the system may write |
| [QueryTask](classes/QueryTask.md) | Query task implementation |
| [ReachabilityMonitor](classes/ReachabilityMonitor.md) | Remote reachability monitor |
| [RemoteEntityInvalidatedEvent](classes/RemoteEntityInvalidatedEvent.md) | Remote entity invalidated event (US-023). |
| [Repository](classes/Repository.md) | Entity repository. Decides the concrete operations of an entity based on configuration |
| [RepositoryBase](classes/RepositoryBase.md) | Data repository |
| [RepositorySyncBeginEvent](classes/RepositorySyncBeginEvent.md) | Repository sync begin event |
| [RepositorySyncCompleteEvent](classes/RepositorySyncCompleteEvent.md) | Repository sync complete event |
| [RepositorySyncErrorEvent](classes/RepositorySyncErrorEvent.md) | Repository sync error event |
| [RxDB](classes/RxDB.md) | RxDB is a singleton object responsible for managing global features such as plugins, adapters, events and context. Only one RxDB instance can be created globally; all entities are managed through this instance. Every Entity class can also only be registered once |
| [RxDBAdapterBase](classes/RxDBAdapterBase.md) | Database adapter base class |
| [RxDBAdapterLocalBase](classes/RxDBAdapterLocalBase.md) | Database adapter base class (local) |
| [RxDBAdapterRemoteBase](classes/RxDBAdapterRemoteBase.md) | Database adapter base class (remote) |
| [RxDBBackupArchiveReader](classes/RxDBBackupArchiveReader.md) | Streaming archive reader. |
| [RxDBBackupArchiveWriter](classes/RxDBBackupArchiveWriter.md) | Streaming archive writer. |
| [RxDBBackupError](classes/RxDBBackupError.md) | Backup / restore failed. |
| [RxDBBranch](classes/RxDBBranch.md) | Branch table |
| [RxDBChange](classes/RxDBChange.md) | Database change record |
| [RxDBCheckViolationError](classes/RxDBCheckViolationError.md) | A write violated a CHECK constraint declared by entity metadata (US-030 phase A). |
| [RxDBConstraintDriftError](classes/RxDBConstraintDriftError.md) | Storage constraints on an existing table do not match the entity metadata declaration (US-030, thrown during `init()`). |
| [RxDBDependencyFailedError](classes/RxDBDependencyFailedError.md) | A dependency repository sync failed, so this repository was not synced at all |
| [RxDBError](classes/RxDBError.md) | - |
| [RxDBExclusionViolationError](classes/RxDBExclusionViolationError.md) | A write together with existing rows violated a range exclusion constraint declared by entity metadata (US-030 phase C). |
| [RxDBLocalAdapterCapabilityError](classes/RxDBLocalAdapterCapabilityError.md) | An adapter configured as `sync.local` cannot run the system bootstrap — it lacks the members the local path of `RxDB.connect()` needs to call. |
| [RxDBMigration](classes/RxDBMigration.md) | Database migration record |
| [RxDBMigrationClaimConflictError](classes/RxDBMigrationClaimConflictError.md) | A migration with the same name has already had its execution right claimed by another RxDB instance |
| [RxDBMissingPluginError](classes/RxDBMissingPluginError.md) | A strategy was declared, but the plugin that provides it is not installed. |
| [RxDBMissingPrimaryAdapterError](classes/RxDBMissingPrimaryAdapterError.md) | No adapter is configured on the primary side. |
| [RxDBMixedPrimaryAdapterError](classes/RxDBMixedPrimaryAdapterError.md) | Entities in a single bulk mutation belong to different primary adapters. |
| [RxDBMixedVersionedCacheTransactionError](classes/RxDBMixedVersionedCacheTransactionError.md) | A single bulk mutation mixes QueryCache entities with versioned (Full / Filter) entities. |
| [RxDBPartialSyncError](classes/RxDBPartialSyncError.md) | Partial sync error — the sync failed partway, but **the part already applied will not be rolled back**. |
| [RxDBPluginAmbiguousDependencyError](classes/RxDBPluginAmbiguousDependencyError.md) | A `plugin:*` dependency points to multiple plugins with the same name — it cannot be decided which one to inject (US-015 AC#14 / D4). |
| [RxDBPluginBase](classes/RxDBPluginBase.md) | RxDB plugin base class |
| [RxDBPluginDependencyCycleError](classes/RxDBPluginDependencyCycleError.md) | Plugin dependencies form a cycle — thrown during the **install planning phase** (US-015 AC#16). |
| [RxDBQueryCacheCapabilityError](classes/RxDBQueryCacheCapabilityError.md) | A required QueryCache capability is missing — the adapter does not provide the duck needed by the QueryCache sync flow. |
| [RxDBReadOnlyError](classes/RxDBReadOnlyError.md) | A public write entrance was called on a read-only instance (US-313) |
| [RxDBSync](classes/RxDBSync.md) | Repository sync metadata table |
| [RxDBSyncOverrideError](classes/RxDBSyncOverrideError.md) | The instance-level sync override configuration is invalid. |
| [RxDBSystemMigrationLockError](classes/RxDBSystemMigrationLockError.md) | Could not acquire the exclusive lock required for system migration; the whole migration was not executed |
| [SortOrderError](classes/SortOrderError.md) | A manual ordering write was rejected |
| [SwitchBranchBeginEvent](classes/SwitchBranchBeginEvent.md) | Branch switch begin event |
| [SwitchBranchCommitEvent](classes/SwitchBranchCommitEvent.md) | Branch switch commit event |
| [SwitchBranchEventBase](classes/SwitchBranchEventBase.md) | Common payload of the three branch switch events |
| [SwitchBranchRollbackEvent](classes/SwitchBranchRollbackEvent.md) | Branch switch rollback event |
| [SyncBeginEvent](classes/SyncBeginEvent.md) | Sync begin event |
| [SyncCompleteEvent](classes/SyncCompleteEvent.md) | Sync complete event |
| [SyncErrorEvent](classes/SyncErrorEvent.md) | Sync error event |
| [SyncStateHub](classes/SyncStateHub.md) | Sync state aggregator |
| [TransactionBeginEvent](classes/TransactionBeginEvent.md) | Transaction begin event |
| [TransactionCommitEvent](classes/TransactionCommitEvent.md) | Transaction commit event |
| [TransactionRollbackEvent](classes/TransactionRollbackEvent.md) | Transaction rollback event |
| [UnclaimedRxDBCapabilityError](classes/UnclaimedRxDBCapabilityError.md) | The database has capability rows, but no plugin in this process claims them. |
| [UnsupportedRxDBChangeVersionError](classes/UnsupportedRxDBChangeVersionError.md) | Thrown when the version number encountered during decoding does not match [RXDB\_CHANGE\_CODEC\_VERSION](variables/RXDB_CHANGE_CODEC_VERSION.md) / [RXDB\_CHANGE\_SCHEMA\_VERSION](variables/RXDB_CHANGE_SCHEMA_VERSION.md). |
| [UnsupportedRxDBEntityIdentityVersionError](classes/UnsupportedRxDBEntityIdentityVersionError.md) | Thrown when the byte format version of `encodeRxDBEntityIdentity` does not match the current process. |
| [UnsupportedRxDBSystemVersionError](classes/UnsupportedRxDBSystemVersionError.md) | The version number stored in the database is higher than what this process supports |
| [UpdateDataCache](classes/UpdateDataCache.md) | Cache manager for update data. Used to cache serialized entity data and avoid repeated serialization |
| [WorktreeBranchHeldError](classes/WorktreeBranchHeldError.md) | The branch is already held by a writable checkout; the main checkout cannot hold it again. |
| [WorktreeTableSet](classes/WorktreeTableSet.md) | A set of business tables. |
| [WorktreeTableSetMismatchError](classes/WorktreeTableSetMismatchError.md) | The entity to write was not created or read on the table set this instance currently mounts; the write is rejected (US-314 B2.4). |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [ActiveBranchEntityHost](interfaces/ActiveBranchEntityHost.md) | The minimal capability [resolveSingleActiveBranch](functions/resolveSingleActiveBranch.md) needs to create `main`. |
| [BigIntProperty](interfaces/BigIntProperty.md) | Signed 64-bit integer property. |
| [BinaryProperty](interfaces/BinaryProperty.md) | Uint8Array byte sequence property |
| [BooleanProperty](interfaces/BooleanProperty.md) | Boolean property |
| [BranchMaterializationBarrierContext](interfaces/BranchMaterializationBarrierContext.md) | The context handed to the source inside the barrier transaction. |
| [BranchMaterializationIntent](interfaces/BranchMaterializationIntent.md) | The intent of one materialization: how far to pull and what to pull. |
| [BranchMaterializationPage](interfaces/BranchMaterializationPage.md) | A page that has already landed in staging; `pageIndex` is the page ordinal it received when it was written. |
| [BranchMaterializationPagePayload](interfaces/BranchMaterializationPagePayload.md) | A page of snapshot handed over by the source: the payload written as-is and its fingerprint. |
| [BranchMaterializationPageRequest](interfaces/BranchMaterializationPageRequest.md) | What is stated when asking the source for a page. |
| [BranchMaterializationProjectionContext](interfaces/BranchMaterializationProjectionContext.md) | The context handed to the source when projecting a page into local write operations. |
| [BranchMaterializationSource](interfaces/BranchMaterializationSource.md) | Remote snapshot source: the only seam between the working tree materialization pipeline and business data. |
| [CheckRule](interfaces/CheckRule.md) | A single-row CHECK rule: field-to-literal comparison, field-to-field (`ref`) comparison, or a null check. |
| [CheckRuleGroup](interfaces/CheckRuleGroup.md) | CHECK rule group: the same shape as the query `RuleGroup` (`combinator` + recursive `rules`), narrowed to the single-row subset. |
| [CloneEntityClassesOptions](interfaces/CloneEntityClassesOptions.md) | Options for [cloneEntityClasses](functions/cloneEntityClasses.md). |
| [CodeFormat](interfaces/CodeFormat.md) | Source code. When `language` is non-empty it is passed through as-is; whether the language exists is not validated. |
| [ColorFormat](interfaces/ColorFormat.md) | A color. |
| [CompiledCheckConstraint](interfaces/CompiledCheckConstraint.md) | Compiles an entity-level CHECK into `{ name, expression }`: the constraint name + the normalized expression. |
| [CompiledConditionalUniqueIndex](interfaces/CompiledConditionalUniqueIndex.md) | A compiled conditional unique index: the name, columns and where predicate, shared by index DDL creation on both backends and drift comparison. |
| [CompiledExclusionColumn](interfaces/CompiledExclusionColumn.md) | A compiled column: the property name and the physical column name. |
| [CompiledExclusionConstraint](interfaces/CompiledExclusionConstraint.md) | A compiled range exclusion: shared by DDL on both backends, drift comparison and violation normalization. |
| [CompiledExclusionRange](interfaces/CompiledExclusionRange.md) | A compiled one-dimensional range. |
| [Conflict](interfaces/Conflict.md) | Conflict information |
| [ConflictResolver](interfaces/ConflictResolver.md) | Conflict resolver interface |
| [CountOptions](interfaces/CountOptions.md) | Count query options |
| [CurrencyFormat](interfaces/CurrencyFormat.md) | A currency. `currency` only validates the ISO 4217 code shape `/^[A-Z]{3}$/`; no currency allocation table is built in. |
| [DateProperty](interfaces/DateProperty.md) | Date and time property |
| [DateTimeFormat](interfaces/DateTimeFormat.md) | A date and time. `timezone` is an opaque hint; this layer does not validate against the IANA database. |
| [DiffResult](interfaces/DiffResult.md) | Diff result, containing the classified entity IDs |
| [DurationFormat](interfaces/DurationFormat.md) | A duration. The unit must be declared. |
| [EmailFormat](interfaces/EmailFormat.md) | An email address. |
| [EntityCheckMetadataOptions](interfaces/EntityCheckMetadataOptions.md) | Entity-level CHECK declarations. |
| [EntityComputedFieldDescriptor](interfaces/EntityComputedFieldDescriptor.md) | Description of a computed property: outputs the real `valueType` and is always read-only. |
| [EntityConstraintDriftReport](interfaces/EntityConstraintDriftReport.md) | The drift comparison input for one entity table. |
| [EntityExclusionMetadataOptions](interfaces/EntityExclusionMetadataOptions.md) | Entity-level range exclusion declarations. |
| [EntityExclusionRangeOptions](interfaces/EntityExclusionRangeOptions.md) | A one-dimensional range of a range exclusion: the start/end columns and the bounds. |
| [~~EntityFieldConfig~~](interfaces/EntityFieldConfig.md) | - |
| [EntityFieldsDescriptor](interfaces/EntityFieldsDescriptor.md) | The complete field description of one entity. |
| [EntityForeignKeyMetadataOptions](interfaces/EntityForeignKeyMetadataOptions.md) | Entity-level foreign key constraints. |
| [EntityIndexMetadataOptions](interfaces/EntityIndexMetadataOptions.md) | Entity index metadata interface. Defines the configuration of entity indexes |
| [EntityManager](interfaces/EntityManager.md) | Entity manager |
| [EntityMetadataFeatures](interfaces/EntityMetadataFeatures.md) | EntityMetadata extension features |
| [EntityMetadataOptions](interfaces/EntityMetadataOptions.md) | Entity definition metadata options interface. Used to configure the full options of the `@Entity` decorator and define the structure and behavior of entities |
| [EntityMetadataType](interfaces/EntityMetadataType.md) | Entity metadata type. Contains all metadata information of an entity, such as properties, relations, indexes, etc. |
| [EntityMetadataValidationError](interfaces/EntityMetadataValidationError.md) | A single metadata violation. |
| [EntityMutationsOptions](interfaces/EntityMutationsOptions.md) | Arguments of [getEntityMutations](functions/getEntityMutations.md) |
| [EntityPermissionOptions](interfaces/EntityPermissionOptions.md) | Write operation permission declarations of an entity |
| [EntityPropertyFieldDescriptor](interfaces/EntityPropertyFieldDescriptor.md) | Description of ordinary properties and system fields. |
| [EntityStatus](interfaces/EntityStatus.md) | Entity status manager |
| [EntitySyncOverride](interfaces/EntitySyncOverride.md) | An instance-level entity sync override entry. |
| [EntitySyncResolver](interfaces/EntitySyncResolver.md) | The **only** resolution entry for an entity's effective sync configuration. |
| [EntityWriteStep](interfaces/EntityWriteStep.md) | One step of a bulk write: a group of creates / updates / deletes for one entity type. |
| [EnumProperty](interfaces/EnumProperty.md) | Controlled value set property |
| [ExclusionRangeConflict](interfaces/ExclusionRangeConflict.md) | The values of both sides of a one-dimensional range in a range exclusion conflict (see [RxDBExclusionViolationError](classes/RxDBExclusionViolationError.md)). |
| [ExclusionUpdateChange](interfaces/ExclusionUpdateChange.md) | The before/after values of one update: `patch` is the new value written down, `inversePatch` is the old value being replaced (both may contain only the changed columns). |
| [FieldOptionDisplay](interfaces/FieldOptionDisplay.md) | Display metadata of a single enum option. |
| [FieldValidationError](interfaces/FieldValidationError.md) | Description of a field value validation failure. |
| [FindAllOptions](interfaces/FindAllOptions.md) | FindAll query options |
| [FindByCursorOptions](interfaces/FindByCursorOptions.md) | FindByCursor query options |
| [FindOneOptions](interfaces/FindOneOptions.md) | FindOne query options |
| [FindOneOrFailOptions](interfaces/FindOneOrFailOptions.md) | FindOneOrFail query options |
| [FindOptions](interfaces/FindOptions.md) | Find query options |
| [HistoryItem](interfaces/HistoryItem.md) | History item. Represents an undoable/redoable operation unit |
| [HistoryScopeAPI](interfaces/HistoryScopeAPI.md) | History scope API. All scopes return a unified interface, eliminating special cases |
| [ICascadeOptions](interfaces/ICascadeOptions.md) | Foreign key cascade options interface. Defines the foreign key constraint configuration of relations |
| [IEntity](interfaces/IEntity.md) | Entity base interface. Defines the basic properties common to all entities; to sync better with remote data, all entity classes should implement this interface |
| [IEntityStaticType](interfaces/IEntityStaticType.md) | Static type of an entity |
| [IMutationContext](interfaces/IMutationContext.md) | Operation context |
| [IncrementalUpdateContext](interfaces/IncrementalUpdateContext.md) | The context of one incremental merge: the complete entity cache + the match status classification. |
| [IntegerProperty](interfaces/IntegerProperty.md) | Integer property |
| [IRepository](interfaces/IRepository.md) | Data repository management interface |
| [IRepositoryConfig](interfaces/IRepositoryConfig.md) | IRepositoryConfig unified registration configuration |
| [IRxDBAdapter](interfaces/IRxDBAdapter.md) | RxDB database adapter interface |
| [IRxDBChange](interfaces/IRxDBChange.md) | Remote change data interface |
| [IRxDBPlugin](interfaces/IRxDBPlugin.md) | RxDB plugin interface |
| [ISortableEntity](interfaces/ISortableEntity.md) | Shape of an entity that supports manual ordering |
| [JSONProperty](interfaces/JSONProperty.md) | json stores data of any JSON structure, suitable for flexible data models or nested objects |
| [KeyValueProperty](interfaces/KeyValueProperty.md) | keyValue stores an object of key-value pairs, suitable for simple configuration items or dynamic property collections |
| [KeyValueSchemaEntry](interfaces/KeyValueSchemaEntry.md) | - |
| [LocalRxDBBranchRepository](interfaces/LocalRxDBBranchRepository.md) | RxDBBranch local repository interface |
| [LocalRxDBChangeRepository](interfaces/LocalRxDBChangeRepository.md) | RxDBChange local repository interface |
| [ManualOrderOptions](interfaces/ManualOrderOptions.md) | Declaration of grouped manual ordering |
| [MergeBranchOptions](interfaces/MergeBranchOptions.md) | Branch merge options |
| [MergeBranchResult](interfaces/MergeBranchResult.md) | Branch merge result |
| [MigrationType](interfaces/MigrationType.md) | Upgrade script |
| [MultilineTextFormat](interfaces/MultilineTextFormat.md) | Multiline plain text. |
| [MultiSelectFormat](interfaces/MultiSelectFormat.md) | Multiple selection. The carrier is [StringArrayProperty](interfaces/StringArrayProperty.md), in which case its `enum` is required. |
| [NumberArrayProperty](interfaces/NumberArrayProperty.md) | Number array property |
| [NumberFormat](interfaces/NumberFormat.md) | An ordinary number. |
| [NumberProperty](interfaces/NumberProperty.md) | Number group |
| [OrderBy](interfaces/OrderBy.md) | Ordering |
| [ParsedExclusionViolation](interfaces/ParsedExclusionViolation.md) | A recognized range exclusion violation: the constraint name, plus the conflicting key text that could be obtained. |
| [PercentageFormat](interfaces/PercentageFormat.md) | A percentage. `scale` determines the intrinsic value domain: `0..1` is `[0, 1]`, `0..100` is `[0, 100]`. |
| [PermissionViolation](interfaces/PermissionViolation.md) | One permission violation: which write operation of which entity was rejected by a public write entrance |
| [PhoneFormat](interfaces/PhoneFormat.md) | A phone number. |
| [PlainTextFormat](interfaces/PlainTextFormat.md) | Single-line plain text. |
| [PullBatchRequest](interfaces/PullBatchRequest.md) | The watermark request for a **single entity** within one bulk pull |
| [PullOptions](interfaces/PullOptions.md) | Pull operation options |
| [PullRepositoryOptions](interfaces/PullRepositoryOptions.md) | Pull repository options |
| [PullRepositoryResult](interfaces/PullRepositoryResult.md) | Pull repository result |
| [PullResult](interfaces/PullResult.md) | Pull operation result |
| [PushOptions](interfaces/PushOptions.md) | Push operation options |
| [PushRepositoryOptions](interfaces/PushRepositoryOptions.md) | Push repository options |
| [PushRepositoryResult](interfaces/PushRepositoryResult.md) | Push repository result |
| [PushResult](interfaces/PushResult.md) | Push operation result |
| [QueryCacheEngineFactory](interfaces/QueryCacheEngineFactory.md) | QueryCache read engine factory — plugins register it via `RxDB.queryCacheEngine()` inside `install(scope)`. |
| [QueryCacheEntity](interfaces/QueryCacheEntity.md) | QueryCache entity constraint interface |
| [QueryCacheEntityMetadata](interfaces/QueryCacheEntityMetadata.md) | Entity metadata, used for QueryCache freshness comparison |
| [QueryCacheFindOptions](interfaces/QueryCacheFindOptions.md) | Query options |
| [QueryCacheLocalAdapter](interfaces/QueryCacheLocalAdapter.md) | QueryCache adapter interface (local) |
| [QueryCacheLocalReader](interfaces/QueryCacheLocalReader.md) | The local exit of the QueryCache read side (US-020 D8). |
| [QueryCacheOutboxProvider](interfaces/QueryCacheOutboxProvider.md) | Query outbox provider — plugins register it via `RxDB.queryCacheOutbox()` inside `install(scope)`. |
| [QueryCachePrimary](interfaces/QueryCachePrimary.md) | The primary repository under the QueryCache strategy. |
| [QueryCacheRemoteAdapter](interfaces/QueryCacheRemoteAdapter.md) | QueryCache adapter interface (remote) |
| [QueryCacheSession](interfaces/QueryCacheSession.md) | One engine session per QueryCache entity. |
| [QueryCacheSessionContext](interfaces/QueryCacheSessionContext.md) | Everything needed to create a session, prepared and injected by the core. |
| [QueryManager](interfaces/QueryManager.md) | Query cache manager |
| [QueryTaskOptions](interfaces/QueryTaskOptions.md) | Query task options interface |
| [RatingFormat](interfaces/RatingFormat.md) | A rating. Requires `min < max` and `(max - min) / step` to be an integer, so that both endpoints are selectable. |
| [RawQueryResult](interfaces/RawQueryResult.md) | Return shape of [IRxDBAdapter.rawQuery](interfaces/IRxDBAdapter.md#rawquery) |
| [RawWriteGate](interfaces/RawWriteGate.md) | The judgment entry of one raw write; provided by the capture runtime |
| [RawWritePrimitives](interfaces/RawWritePrimitives.md) | The five write primitives before interception |
| [ReachabilityEventTarget](interfaces/ReachabilityEventTarget.md) | Shape of the event source listened to for `online` / `offline` |
| [ReachabilityOptions](interfaces/ReachabilityOptions.md) | Constructor options of [ReachabilityMonitor](classes/ReachabilityMonitor.md) |
| [RelationEntitiesObservable](interfaces/RelationEntitiesObservable.md) | Access interface for multiple relation objects. Provides observation and operation capabilities over multiple related entity collections |
| [RelationEntityObservable](interfaces/RelationEntityObservable.md) | Access interface for a single relation object. Provides observation and operation capabilities over a single related entity |
| [RemoteBranchInfo](interfaces/RemoteBranchInfo.md) | Remote branch information |
| [RemoteChange](interfaces/RemoteChange.md) | Remote change data interface |
| [RemoteChangeRejection](interfaces/RemoteChangeRejection.md) | The reason the remote rejected one local change |
| [RemoteEntityRef](interfaces/RemoteEntityRef.md) | The entity reference in a remote receipt |
| [RemoteMergeResult](interfaces/RemoteMergeResult.md) | The result returned after the remote merges a batch of local changes |
| [RemoteRxDBBranchRepository](interfaces/RemoteRxDBBranchRepository.md) | RxDBBranch remote repository interface |
| [RemoteRxDBChangeRepository](interfaces/RemoteRxDBChangeRepository.md) | RxDBChange remote repository interface |
| [ReorderBetween](interfaces/ReorderBetween.md) | Reorder target: move between two neighbors |
| [ReorderToGroupEnd](interfaces/ReorderToGroupEnd.md) | Reorder target: append to the end of an ordering domain |
| [RepositoryConstructor](interfaces/RepositoryConstructor.md) | Constructor type of facade repositories (registered via `RxDB.repository()`) |
| [RepositoryIdentifier](interfaces/RepositoryIdentifier.md) | Repository identifier. Uniquely identifies one entity type |
| [RepositoryInstance](interfaces/RepositoryInstance.md) | Repository constructor type — must be instantiable (a concrete class), not an abstract class; supports repositories with additional generic parameters |
| [RepositoryQueryExtensions](interfaces/RepositoryQueryExtensions.md) | Query tasks appended by Repository plugins through module augmentation. |
| [RepositorySyncCapability](interfaces/RepositorySyncCapability.md) | The sync capability of a sync type |
| [RepositorySyncSwitch](interfaces/RepositorySyncSwitch.md) | Repository sync switch: the field in `RxDBSync` related to eligibility determination |
| [ResolvedTrustedWrite](interfaces/ResolvedTrustedWrite.md) | A declaration resolved to its entrance; the return shape of [takeDeclaredWrite](functions/takeDeclaredWrite.md). |
| [RestoreEntityOptions](interfaces/RestoreEntityOptions.md) | Arguments for restoring a deleted entity |
| [RichTextFormat](interfaces/RichTextFormat.md) | Rich text. |
| [RuleGroupBase](interfaces/RuleGroupBase.md) | Query rule group (base). Used by generated type files to compose more complex types |
| [RxDBAdapters](interfaces/RxDBAdapters.md) | Type registry of registered adapters |
| [RxDBBackupCompatibility](interfaces/RxDBBackupCompatibility.md) | The compatibility expectations on the target side, computed by the adapter from the target configuration provided up front. |
| [RxDBBackupEntryHeader](interfaces/RxDBBackupEntryHeader.md) | The header of one entry inside the archive. |
| [RxDBBackupErrorDetails](interfaces/RxDBBackupErrorDetails.md) | Structured details of a backup error. |
| [RxDBBackupHeldLock](interfaces/RxDBBackupHeldLock.md) | An acquired Web Lock. |
| [RxDBBackupManifest](interfaces/RxDBBackupManifest.md) | Archive metadata. Written at the front of the archive so the compatibility check can finish before writing to the target during restore. |
| [RxDBBackupOptions](interfaces/RxDBBackupOptions.md) | Backup options. |
| [RxDBBackupQueueOptions](interfaces/RxDBBackupQueueOptions.md) | Options of [runRxDBBackupWhenQueued](functions/runRxDBBackupWhenQueued.md). |
| [RxDBBackupResult](interfaces/RxDBBackupResult.md) | The result of a successful backup. |
| [RxDBBackupScope](interfaces/RxDBBackupScope.md) | Backup scope declaration (AC#14). |
| [RxDBBackupTrailer](interfaces/RxDBBackupTrailer.md) | The summary in the archive's end marker. |
| [RxDBBranchCreationContext](interfaces/RxDBBranchCreationContext.md) | The context a contributor needs to write its own rows when creating a branch |
| [RxDBBranchInitData](interfaces/RxDBBranchInitData.md) | Initialization data |
| [RxDBBranchRemovalContext](interfaces/RxDBBranchRemovalContext.md) | The context a contributor needs to clean up its own rows when removing a branch |
| [RxDBBranchStaticTypes](interfaces/RxDBBranchStaticTypes.md) | Static types |
| [RxDBBranchSwitchContext](interfaces/RxDBBranchSwitchContext.md) | The context [RxDBSystemContribution.prepareBranchSwitch](interfaces/RxDBSystemContribution.md#preparebranchswitch) receives |
| [RxDBBranchSwitchFailureContext](interfaces/RxDBBranchSwitchFailureContext.md) | The context [RxDBSystemContribution.settleBranchSwitchFailure](interfaces/RxDBSystemContribution.md#settlebranchswitchfailure) receives |
| [RxDBBranchSwitchTakeoverContext](interfaces/RxDBBranchSwitchTakeoverContext.md) | The context [RxDBSystemContribution.takeOverBranchSwitch](interfaces/RxDBSystemContribution.md#takeoverbranchswitch) receives |
| [RxDBCapabilityClaim](interfaces/RxDBCapabilityClaim.md) | One capability claim: who (`packageSpecifier`) enabled which version of which capability (`capability`) on this database. |
| [RxDBCapabilityVersionKind](interfaces/RxDBCapabilityVersionKind.md) | The "which number" reported to the user on a version mismatch — **the plugin capability's own**. |
| [RxDBChangeInitData](interfaces/RxDBChangeInitData.md) | Initialization data |
| [RxDBChangeStaticTypes](interfaces/RxDBChangeStaticTypes.md) | Static types |
| [RxDBContext](interfaces/RxDBContext.md) | RxDB environment context |
| [RxDBEntityEventMap](interfaces/RxDBEntityEventMap.md) | RxDB entity event map interface |
| [RxDBEntityLocalCreatedEventData](interfaces/RxDBEntityLocalCreatedEventData.md) | Payload of [ENTITY\_LOCAL\_CREATE\_EVENT](variables/ENTITY_LOCAL_CREATE_EVENT.md) |
| [RxDBEntityLocalNewEventData](interfaces/RxDBEntityLocalNewEventData.md) | Payload of [ENTITY\_LOCAL\_NEW\_EVENT](variables/ENTITY_LOCAL_NEW_EVENT.md) |
| [RxDBEntityLocalRemovedEventData](interfaces/RxDBEntityLocalRemovedEventData.md) | Payload of [ENTITY\_LOCAL\_REMOVE\_EVENT](variables/ENTITY_LOCAL_REMOVE_EVENT.md) |
| [RxDBEntityLocalUpdatedEventData](interfaces/RxDBEntityLocalUpdatedEventData.md) | Payload of [ENTITY\_LOCAL\_UPDATE\_EVENT](variables/ENTITY_LOCAL_UPDATE_EVENT.md) |
| [RxDBEntityRemoteCreatedEventData](interfaces/RxDBEntityRemoteCreatedEventData.md) | Payload of [ENTITY\_REMOTE\_CREATE\_EVENT](variables/ENTITY_REMOTE_CREATE_EVENT.md) |
| [RxDBEntityRemoteRemovedEventData](interfaces/RxDBEntityRemoteRemovedEventData.md) | Payload of [ENTITY\_REMOTE\_REMOVE\_EVENT](variables/ENTITY_REMOTE_REMOVE_EVENT.md); `data` is the whole row **before** deletion |
| [RxDBEntityRemoteUpdatedEventData](interfaces/RxDBEntityRemoteUpdatedEventData.md) | Payload of [ENTITY\_REMOTE\_UPDATE\_EVENT](variables/ENTITY_REMOTE_UPDATE_EVENT.md); `data` is the whole row **after** the update |
| [RxDBEventMap](interfaces/RxDBEventMap.md) | RxDB complete event map interface |
| [RxDBMigrationInitData](interfaces/RxDBMigrationInitData.md) | Initialization data |
| [RxDBMigrationStaticTypes](interfaces/RxDBMigrationStaticTypes.md) | Static types |
| [RxDBMutationsMap](interfaces/RxDBMutationsMap.md) | All changes to be written inside one transaction, grouped by "create / delete / update" |
| [RxDBOptions](interfaces/RxDBOptions.md) | RxDB top-level configuration |
| [RxDBRepositories](interfaces/RxDBRepositories.md) | Type registry of registered facade repositories |
| [RxDBRestoreOptions](interfaces/RxDBRestoreOptions.md) | Restore options. |
| [RxDBRestoreResult](interfaces/RxDBRestoreResult.md) | The result of a successful restore. |
| [RxDBSyncInitData](interfaces/RxDBSyncInitData.md) | Initialization data |
| [RxDBSyncStaticTypes](interfaces/RxDBSyncStaticTypes.md) | Static types |
| [RxDBSystemActivationContext](interfaces/RxDBSystemActivationContext.md) | The context after the bootstrap of an existing database finishes and before the connection is handed back to the caller |
| [RxDBSystemBootstrapContext](interfaces/RxDBSystemBootstrapContext.md) | The context available at table creation time |
| [RxDBSystemContribution](interfaces/RxDBSystemContribution.md) | A plugin's contribution to the system layer |
| [RxDBSystemVersionState](interfaces/RxDBSystemVersionState.md) | The two version numbers read from migration records |
| [SchemaManager](interfaces/SchemaManager.md) | SchemaManager implementation. |
| [Sha256Hasher](interfaces/Sha256Hasher.md) | Incremental SHA-256 hasher. |
| [SingleSelectFormat](interfaces/SingleSelectFormat.md) | Single selection. The carrier is [EnumProperty](interfaces/EnumProperty.md); the option set is determined by its `enum`. |
| [StringArrayProperty](interfaces/StringArrayProperty.md) | String group |
| [StringProperty](interfaces/StringProperty.md) | Variable-length string property |
| [SwitchBranchOptions](interfaces/SwitchBranchOptions.md) | Arguments of `adapter.switchBranch()` |
| [SwitchBranchPrepareContext](interfaces/SwitchBranchPrepareContext.md) | The context [SwitchBranchOptions.prepare](interfaces/SwitchBranchOptions.md#prepare) receives. |
| [SwitchVersionActions](interfaces/SwitchVersionActions.md) | The operations needed to switch branch versions |
| [SwitchVersionChange](interfaces/SwitchVersionChange.md) | - |
| [SyncAdapterOptions](interfaces/SyncAdapterOptions.md) | Sync adapter options interface. Defines the configuration of data sync adapters |
| [SyncConflict](interfaces/SyncConflict.md) | A conflict record with its occurrence time |
| [SyncConflictReport](interfaces/SyncConflictReport.md) | The result of one conflict determination, for reporting where the conflict occurred |
| [SyncFailure](interfaces/SyncFailure.md) | The sync failure record of a single repository |
| [SyncProgress](interfaces/SyncProgress.md) | Sync progress signal |
| [SyncRejection](interfaces/SyncRejection.md) | A rejection record with its occurrence time and source change |
| [SyncRejectionReport](interfaces/SyncRejectionReport.md) | An entity rejected by the remote, for reporting at the push commit site |
| [SyncRepositoryOptions](interfaces/SyncRepositoryOptions.md) | Sync repository options |
| [SyncRepositoryResult](interfaces/SyncRepositoryResult.md) | Sync repository result |
| [SyncResult](interfaces/SyncResult.md) | Sync operation result (pull + push combined) |
| [SyncState](interfaces/SyncState.md) | Sync state snapshot |
| [SyncStateSources](interfaces/SyncStateSources.md) | The upstream data sources of [SyncStateHub](classes/SyncStateHub.md) |
| [SyncStats](interfaces/SyncStats.md) | Sync statistics |
| [TransactionExecutor](interfaces/TransactionExecutor.md) | The scoped handle of one transaction. |
| [TransactionOptions](interfaces/TransactionOptions.md) | Options of `transaction()`. |
| [TrustedCallsite](interfaces/TrustedCallsite.md) | One row of the registry |
| [TrustedWriteDeclaration](interfaces/TrustedWriteDeclaration.md) | The self-reported identity of one trusted write |
| [UpdateClassification](interfaces/UpdateClassification.md) | Update classification result |
| [UrlFormat](interfaces/UrlFormat.md) | A URL. |
| [UUIDProperty](interfaces/UUIDProperty.md) | UUID property |
| [WorkingTreeCaptureHook](interfaces/WorkingTreeCaptureHook.md) | The hand-off port through which the capture runtime takes over the four mount points |
| [WorkingTreeCaptureMountPoint](interfaces/WorkingTreeCaptureMountPoint.md) | A write primitive that must mount working tree capture. |
| [WorkingTreeWriteHost](interfaces/WorkingTreeWriteHost.md) | The **host** of one write call: the real adapter itself, or the executor facade inside a transaction |
| [WorkingTreeWritePrimitiveSignature](interfaces/WorkingTreeWritePrimitiveSignature.md) | The signature identity of one write primitive |
| [WorktreeSnapshotImport](interfaces/WorktreeSnapshotImport.md) | One snapshot import: the copied tables, and the increments applied on top of the copied rows. |
| [WorktreeSnapshotPage](interfaces/WorktreeSnapshotPage.md) | A page of rows in storage form. |
| [WorktreeSnapshotTable](interfaces/WorktreeSnapshotTable.md) | A table to be copied into the snapshot database. |
| [WorktreeTableSetHooks](interfaces/WorktreeTableSetHooks.md) | A plugin's contributions to the writable checkout's table set (US-314 B2.5). |
| [WorktreeTableSetSeed](interfaces/WorktreeTableSetSeed.md) | The data seeded when creating a writable checkout's table set (US-314 B1.5); see the adapter's `createWorktreeTableSet`. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [AbstractEntityType](type-aliases/AbstractEntityType.md) | Abstract entity type |
| [AdapterFactory](type-aliases/AdapterFactory.md) | Adapter factory: this is what `RxDB.adapter()` registers, not an already-constructed adapter instance |
| [AdapterRepositoryConstructor](type-aliases/AdapterRepositoryConstructor.md) | Constructor type of adapter repositories (registered via `RxDBAdapterBase.repository()`) |
| [BigIntRules](type-aliases/BigIntRules.md) | bigint |
| [BinaryRules](type-aliases/BinaryRules.md) | binary |
| [BooleanRules](type-aliases/BooleanRules.md) | Boolean |
| [CheckOperator](type-aliases/CheckOperator.md) | The operators allowed in a single-row CHECK rule. |
| [ConflictResolution](type-aliases/ConflictResolution.md) | Conflict resolution result |
| [DateRules](type-aliases/DateRules.md) | Date |
| [EntityBaseType](type-aliases/EntityBaseType.md) | Entity base type |
| [EntityCheckMetadata](type-aliases/EntityCheckMetadata.md) | Normalized entity-level CHECK metadata (same shape as [EntityCheckMetadataOptions](interfaces/EntityCheckMetadataOptions.md)). |
| [EntityData](type-aliases/EntityData.md) | Entity data type |
| [EntityExclusionMetadata](type-aliases/EntityExclusionMetadata.md) | Normalized range exclusion metadata (same shape as [EntityExclusionMetadataOptions](interfaces/EntityExclusionMetadataOptions.md)). |
| [EntityFieldDescriptor](type-aliases/EntityFieldDescriptor.md) | Description of a single field. Narrow to the concrete branch via `source` (INV-5). |
| [~~EntityFieldType~~](type-aliases/EntityFieldType.md) | - |
| [EntityFieldTypeName](type-aliases/EntityFieldTypeName.md) | The string literal view of [EntityFieldType](type-aliases/EntityFieldType.md). |
| [EntityForeignKeyMetadata](type-aliases/EntityForeignKeyMetadata.md) | Normalized entity-level foreign key metadata |
| [EntityInstanceType](type-aliases/EntityInstanceType.md) | Entity instance type |
| [EntityMetadata](type-aliases/EntityMetadata.md) | Entity metadata (read-only version). A read-only deep copy of entity metadata, preventing metadata from being modified |
| [EntityMetadataResolver](type-aliases/EntityMetadataResolver.md) | Looks up registered entity metadata by `entity` / `namespace`. |
| [EntityOperation](type-aliases/EntityOperation.md) | The write operations constrained by permissions |
| [EntityOperationPermission](type-aliases/EntityOperationPermission.md) | Who a single write operation is open to |
| [EntityPropertyMetadata](type-aliases/EntityPropertyMetadata.md) | Union type of normalized field metadata |
| [EntityPropertyMetadataOptions](type-aliases/EntityPropertyMetadataOptions.md) | Entity property metadata union type. Contains metadata of all possible property types |
| [EntityRelationFieldDescriptor](type-aliases/EntityRelationFieldDescriptor.md) | Relation field description. Narrow to the concrete branch via the top-level `cardinality`. |
| [EntityRelationManyToManyMetadata](type-aliases/EntityRelationManyToManyMetadata.md) | Many-to-many |
| [EntityRelationManyToOneMetadata](type-aliases/EntityRelationManyToOneMetadata.md) | Many-to-one |
| [EntityRelationMetadata](type-aliases/EntityRelationMetadata.md) | - |
| [EntityRelationMetadataOptions](type-aliases/EntityRelationMetadataOptions.md) | Entity relation metadata union type. Contains all possible relation types (one-to-one, one-to-many, many-to-one, many-to-many) |
| [EntityRelationOneToManyMetadata](type-aliases/EntityRelationOneToManyMetadata.md) | One-to-many |
| [EntityRelationOneToOneMetadata](type-aliases/EntityRelationOneToOneMetadata.md) | One-to-one |
| [EntityStaticType](type-aliases/EntityStaticType.md) | - |
| [EntitySyncTarget](type-aliases/EntitySyncTarget.md) | Resolution target: an entity class or its metadata. |
| [EntityToManyRelationFieldDescriptor](type-aliases/EntityToManyRelationFieldDescriptor.md) | `1:m` / `m:n` relations: multi-valued, no writable foreign key column, the semantics are "add / remove". |
| [EntityToOneRelationFieldDescriptor](type-aliases/EntityToOneRelationFieldDescriptor.md) | `1:1` / `m:1` relations: single-valued, writes the foreign key column, the semantics are "set / clear". |
| [EntityType](type-aliases/EntityType.md) | Entity type |
| [EntityUpdateData](type-aliases/EntityUpdateData.md) | Entity update data type. Used to represent the data structure passed when updating an entity |
| [EnumRules](type-aliases/EnumRules.md) | Enum. Query rules for the enum type. Supports: equals, not equals, is null, is not null, in, notIn |
| [EventListener](type-aliases/EventListener.md) | - |
| [EventOrigin](type-aliases/EventOrigin.md) | Event origin marker - `undefined` or absent: the original event produced by the local current tab - `'cross-tab'`: an event received from another tab via BroadcastChannel |
| [ExclusionBounds](type-aliases/ExclusionBounds.md) | The bounds of a range dimension. |
| [ExclusionRangeKind](type-aliases/ExclusionRangeKind.md) | The value domain of a range dimension: determines the PG-side range type (`tstzrange` / `int8range`) and the JS form of the endpoint values. |
| [FieldCardinality](type-aliases/FieldCardinality.md) | Field cardinality. |
| [FieldFormat](type-aliases/FieldFormat.md) | Discriminated union of a field's business semantics and default rendering. |
| [FieldFormatConfigKey](type-aliases/FieldFormatConfigKey.md) | The complete set of `format` configuration keys (excluding `kind` itself). |
| [FieldOptions](type-aliases/FieldOptions.md) | Display metadata indexed by enum value. The keys must be a subset of `enum`. |
| [FieldSource](type-aliases/FieldSource.md) | Field source discriminant. System fields have the same shape as ordinary properties and are only distinguished here. |
| [FieldValidationRule](type-aliases/FieldValidationRule.md) | The rule identifiers [validateFieldValue](functions/validateFieldValue.md) may hit. |
| [Fingerprint](type-aliases/Fingerprint.md) | Fingerprint type |
| [HistoryScope](type-aliases/HistoryScope.md) | History scope configuration |
| [HistoryScopeType](type-aliases/HistoryScopeType.md) | History scope type |
| [IntegerRules](type-aliases/IntegerRules.md) | Integer |
| [InterceptedBulkWrite](type-aliases/InterceptedBulkWrite.md) | The intercepted bulk write method. |
| [IQueryContext](type-aliases/IQueryContext.md) | Query context |
| [IRxDBAdapterOptions](type-aliases/IRxDBAdapterOptions.md) | Adapter base configuration |
| [JsonValue](type-aliases/JsonValue.md) | A JSON-serializable value. |
| [KeyValue](type-aliases/KeyValue.md) | Value object. Stores key-value queues |
| [KeyValuePropertyMetadata](type-aliases/KeyValuePropertyMetadata.md) | keyValue property metadata union type. Nested properties of keyValue do not need columnName; name is used directly as the key |
| [KeyValueRules](type-aliases/KeyValueRules.md) | Key-value pairs |
| [LocalRxDBAdapter](type-aliases/LocalRxDBAdapter.md) | The complete form of a local adapter: the interface contract + the local base class capabilities. |
| [MergeChangesNext](type-aliases/MergeChangesNext.md) | The un-intercepted `mergeChanges` that can be re-bound to a host |
| [MergeStrategy](type-aliases/MergeStrategy.md) | Merge strategy |
| [MetadataValidationRule](type-aliases/MetadataValidationRule.md) | Metadata validation rules at registration time. |
| [NumberArrayRules](type-aliases/NumberArrayRules.md) | Number array |
| [NumberRules](type-aliases/NumberRules.md) | Number |
| [OperatorName](type-aliases/OperatorName.md) | All operators |
| [Plugin](type-aliases/Plugin.md) | RxDB plugin |
| [PrimaryAdapterKind](type-aliases/PrimaryAdapterKind.md) | Which side's adapter a write lands on |
| [PropertyCheckRule](type-aliases/PropertyCheckRule.md) | Property-level `check` syntactic sugar: a rule that omits `field`, compiled into an entity-level CHECK with the property name as `name`. |
| [QueryCachePendingWriteIds](type-aliases/QueryCachePendingWriteIds.md) | Which entity ids the query outbox currently holds. |
| [QueryOptions](type-aliases/QueryOptions.md) | Union of options for one query task |
| [RawWriteContext](type-aliases/RawWriteContext.md) | The current raw write judgment context of an adapter instance (adapter-contract.md §2) |
| [RefreshMatchRules](type-aliases/RefreshMatchRules.md) | Refresh match rules. The two-dimensional array represents a combination of multiple rule groups; conditions within each group are ANDed, and groups are ORed. For example: [['match_where', 'result_contains'], ['not_match_where']] means: (matches the query condition AND the result contains) OR (does not match the query condition) |
| [RelationBigIntRules](type-aliases/RelationBigIntRules.md) | bigint |
| [RelationBooleanRules](type-aliases/RelationBooleanRules.md) | Boolean |
| [RelationDateRules](type-aliases/RelationDateRules.md) | Date |
| [RelationExistsRules](type-aliases/RelationExistsRules.md) | Relation EXISTS rules. The SubRG type parameter should be the RuleGroup type of the related entity |
| [RelationNumberRules](type-aliases/RelationNumberRules.md) | Number |
| [RelationResolutionRule](type-aliases/RelationResolutionRule.md) | Relation target resolution rules. |
| [RelationStringRules](type-aliases/RelationStringRules.md) | String |
| [RelationUUIDRules](type-aliases/RelationUUIDRules.md) | UUID |
| [RelationValueType](type-aliases/RelationValueType.md) | The complete set of value types for relation fields: only these four are allowed for target entity primary keys. |
| [RemoteChangeResult](type-aliases/RemoteChangeResult.md) | The remote processing result of one source change |
| [RemoteRxDBAdapter](type-aliases/RemoteRxDBAdapter.md) | The complete form of a remote adapter: the interface contract + the remote base class capabilities. |
| [ReorderTarget](type-aliases/ReorderTarget.md) | Reorder target position |
| [RepositorySyncDirection](type-aliases/RepositorySyncDirection.md) | Repository sync direction |
| [RepositorySyncType](type-aliases/RepositorySyncType.md) | Repository sync type |
| [Rule](type-aliases/Rule.md) | Query rule |
| [RuleGroup](type-aliases/RuleGroup.md) | Query rule group (auto-computed type) |
| [RxDBAdapterName](type-aliases/RxDBAdapterName.md) | Adapter name |
| [RxDBBackupArchiveItem](type-aliases/RxDBBackupArchiveItem.md) | The product of [RxDBBackupArchiveReader.next](classes/RxDBBackupArchiveReader.md#next). |
| [RxDBBackupErrorCode](type-aliases/RxDBBackupErrorCode.md) | Stable error classification for backup / restore (US-217 public contract). |
| [RxDBBranchOrderByField](type-aliases/RxDBBranchOrderByField.md) | Ordering field |
| [RxDBBranchRuleGroup](type-aliases/RxDBBranchRuleGroup.md) | Rule group base type |
| [RxDBBranchSwitchPreconditions](type-aliases/RxDBBranchSwitchPreconditions.md) | The preconditions a caller can state when switching branches |
| [RxDBBranchSwitchTakeover](type-aliases/RxDBBranchSwitchTakeover.md) | One takeover declaration |
| [RxDBChangeEntityMetadataResolver](type-aliases/RxDBChangeEntityMetadataResolver.md) | The callback that looks up the **peer entity**'s metadata. |
| [RxDBChangeOrderByField](type-aliases/RxDBChangeOrderByField.md) | Ordering field |
| [RxDBChangeRuleGroup](type-aliases/RxDBChangeRuleGroup.md) | Rule group base type |
| [RxDBConfig](type-aliases/RxDBConfig.md) | - |
| [RxDBEntityEvent](type-aliases/RxDBEntityEvent.md) | RxDB entity event union type |
| [RxDBEntityId](type-aliases/RxDBEntityId.md) | The common runtime type of RxDB entity primary keys. |
| [RxDBEntityLocalEventData](type-aliases/RxDBEntityLocalEventData.md) | RxDB entity local event data union type |
| [RxDBEntityRemoteEventData](type-aliases/RxDBEntityRemoteEventData.md) | RxDB entity remote event data union type |
| [RxDBEvent](type-aliases/RxDBEvent.md) | RxDB event union type. |
| [RxDBMigrationOrderByField](type-aliases/RxDBMigrationOrderByField.md) | Ordering field |
| [RxDBMigrationRuleGroup](type-aliases/RxDBMigrationRuleGroup.md) | Rule group base type |
| [RxDBPluginDependency](type-aliases/RxDBPluginDependency.md) | The dependencies a plugin can declare, a **closed set of values**. |
| [RxDBRepositoryName](type-aliases/RxDBRepositoryName.md) | Facade repository name |
| [RxDBScalar](type-aliases/RxDBScalar.md) | Scalar type. Defines the basic data types that can be stored directly |
| [RxDBSyncOrderByField](type-aliases/RxDBSyncOrderByField.md) | Ordering field |
| [RxDBSyncOverrideErrorReason](type-aliases/RxDBSyncOverrideErrorReason.md) | The reason an override entry is invalid. |
| [RxDBSyncRuleGroup](type-aliases/RxDBSyncRuleGroup.md) | Rule group base type |
| [RxDBSystemVersionKind](type-aliases/RxDBSystemVersionKind.md) | The "which number" reported to the user on a version mismatch — the **core's own** two. |
| [SortOrderErrorReason](type-aliases/SortOrderErrorReason.md) | Classification of [SortOrderError](classes/SortOrderError.md) |
| [SortOrderKey](type-aliases/SortOrderKey.md) | Manual ordering key |
| [StringArrayRules](type-aliases/StringArrayRules.md) | String array |
| [StringRules](type-aliases/StringRules.md) | String |
| [SyncDirection](type-aliases/SyncDirection.md) | Sync direction |
| [SyncOptions](type-aliases/SyncOptions.md) | Sync configuration union type. Contains all possible sync configuration types |
| [TransactionExecutorFun](type-aliases/TransactionExecutorFun.md) | Transaction callback: the parameter is this transaction's executor. |
| [TransactionExecutorState](type-aliases/TransactionExecutorState.md) | Transaction lifecycle state. |
| [TransactionFun](type-aliases/TransactionFun.md) | Transaction callback function. |
| [TrustedWriteIntent](type-aliases/TrustedWriteIntent.md) | Union of the values of [TrustedWriteIntent](variables/TrustedWriteIntent.md) |
| [TrustedWritePrimitive](type-aliases/TrustedWritePrimitive.md) | The write primitive actually invoked by a trusted call site |
| [TrustedWriteScope](type-aliases/TrustedWriteScope.md) | The scope object: an adapter instance or a transaction executor. |
| [UUID](type-aliases/UUID.md) | UUID type. Represents the standard UUID string format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |
| [UUIDRules](type-aliases/UUIDRules.md) | UUID |
| [WorkingTreeCaptureMountPointOrdinal](type-aliases/WorkingTreeCaptureMountPointOrdinal.md) | The row numbers in the contract §1 table, 1–4. |
| [WorkingTreeCaptureMountTarget](type-aliases/WorkingTreeCaptureMountTarget.md) | The minimal surface needed by the object [installWorkingTreeCapture](functions/installWorkingTreeCapture.md) rewrites. |
| [WorktreeHeldBranchWhere](type-aliases/WorktreeHeldBranchWhere.md) | The shape of [WorktreeTableSet.heldBranchWhere](classes/WorktreeTableSet.md#heldbranchwhere): a condition group with exactly one rule |
| [WorktreeSnapshotCursor](type-aliases/WorktreeSnapshotCursor.md) | Pagination cursor: the position of the last row of the previous page. |
| [WriteEntrance](type-aliases/WriteEntrance.md) | Union of the values of [WRITE\_ENTRANCES](variables/WRITE_ENTRANCES.md) |

## Variables

| Variable | Description |
| ------ | ------ |
| [ACTIVE\_BRANCH\_KEY](variables/ACTIVE_BRANCH_KEY.md) | The sentinel value written into the `activeKey` column of the active branch. |
| [CAPABILITY\_ENABLED\_EVENT](variables/CAPABILITY_ENABLED_EVENT.md) | A capability was just enabled on **another connection** (FR-037). |
| [CHECK\_NAME\_PREFIX](variables/CHECK_NAME_PREFIX.md) | The prefix of deterministic constraint names. |
| [CHECK\_OPERATORS](variables/CHECK_OPERATORS.md) | The whitelist of CHECK operators (US-030 AC#9). The `exists` / `contains` family / `startsWith` family are not in it. |
| [CONFLICT\_DETECTED\_EVENT](variables/CONFLICT_DETECTED_EVENT.md) | A conflict was detected during sync |
| [CONFLICT\_PENDING\_EVENT](variables/CONFLICT_PENDING_EVENT.md) | There are conflicts awaiting manual resolution; until the user makes a choice, sync of the related entities will not proceed |
| [CONSTRAINT\_NAME\_MAX\_BYTES](variables/CONSTRAINT_NAME_MAX_BYTES.md) | The total length limit of constraint names (in UTF-8 bytes): PG identifiers are limited to 63 bytes, SQLite is unlimited but both sides must be aligned. |
| [CORE\_SYSTEM\_ENTITIES](variables/CORE_SYSTEM_ENTITIES.md) | The system tables built into the core, present in every database |
| [ENTITY\_BASE\_METADATA\_OPTIONS](variables/ENTITY_BASE_METADATA_OPTIONS.md) | Entity base class decorator configuration. Defines the base properties common to all entities |
| [ENTITY\_BOOKKEEPING\_FIELDS](variables/ENTITY_BOOKKEEPING_FIELDS.md) | Bookkeeping fields on an entity row that do not express user intent: the sync-backfilled `remoteId` and the audit times `createdAt` / `updatedAt`. |
| [ENTITY\_FIELDS\_DTO\_VERSION](variables/ENTITY_FIELDS_DTO_VERSION.md) | The protocol version of the field description DTO. |
| [ENTITY\_LOCAL\_CREATE\_EVENT](variables/ENTITY_LOCAL_CREATE_EVENT.md) | A local entity was successfully inserted into the database (`type: 'INSERT'`); the payload's `patch` is the complete entity |
| [ENTITY\_LOCAL\_NEW\_EVENT](variables/ENTITY_LOCAL_NEW_EVENT.md) | An entity was just created with `new` and **has not been written yet** (`type: 'NEW'`) |
| [ENTITY\_LOCAL\_REMOVE\_EVENT](variables/ENTITY_LOCAL_REMOVE_EVENT.md) | A local entity was successfully deleted (`type: 'DELETE'`); the payload only has `inversePatch` — `patch` is `null` |
| [ENTITY\_LOCAL\_UPDATE\_EVENT](variables/ENTITY_LOCAL_UPDATE_EVENT.md) | A local entity was successfully updated (`type: 'UPDATE'`); the payload carries both `patch` and `inversePatch`, containing only the changed fields |
| [ENTITY\_OPERATIONS](variables/ENTITY_OPERATIONS.md) | The complete set of constrained write operations; the order is the order used for errors and backfill |
| [ENTITY\_REMOTE\_CREATE\_EVENT](variables/ENTITY_REMOTE_CREATE_EVENT.md) | An entity creation pulled from the remote |
| [ENTITY\_REMOTE\_REMOVE\_EVENT](variables/ENTITY_REMOTE_REMOVE_EVENT.md) | An entity deletion pulled from the remote; the payload is the whole row `data` before deletion, see [ENTITY\_REMOTE\_CREATE\_EVENT](variables/ENTITY_REMOTE_CREATE_EVENT.md) |
| [ENTITY\_REMOTE\_UPDATE\_EVENT](variables/ENTITY_REMOTE_UPDATE_EVENT.md) | An entity update pulled from the remote; the payload is the whole row `data` after the update, see [ENTITY\_REMOTE\_CREATE\_EVENT](variables/ENTITY_REMOTE_CREATE_EVENT.md) |
| [ENTITY\_STATIC\_TYPES](variables/ENTITY_STATIC_TYPES.md) | - |
| [EXCLUSION\_BOUNDS](variables/EXCLUSION_BOUNDS.md) | The bounds allowed for a range dimension: `[)` left-closed right-open, `[]` both ends closed. |
| [EXCLUSION\_NAME\_PREFIX](variables/EXCLUSION_NAME_PREFIX.md) | The prefix of deterministic range exclusion names. |
| [EXCLUSION\_VIOLATION\_MESSAGE\_PREFIX](variables/EXCLUSION_VIOLATION_MESSAGE_PREFIX.md) | The prefix of the SQLite exclusion trigger `RAISE` message (the PG-side plugin trigger uses the same format `rxdb:<kind>:<detail>`). |
| [FIELD\_FORMAT\_CARRIERS](variables/FIELD_FORMAT_CARRIERS.md) | The single source of truth of supported format kinds and their legal carrier PropertyTypes (shared with the AC#12 structure fixture). |
| [FIELD\_FORMAT\_CONFIG\_KEYS](variables/FIELD_FORMAT_CONFIG_KEYS.md) | The configuration keys allowed for each kind (excluding `kind` itself). |
| [FIELD\_FORMAT\_KINDS](variables/FIELD_FORMAT_KINDS.md) | The complete set of format kinds, in declaration order. |
| [MAIN\_BRANCH\_ID](variables/MAIN_BRANCH_ID.md) | The branch id of the root branch (also the recovery target when there is no active branch). |
| [MERGE\_BRANCH\_BEGIN](variables/MERGE_BRANCH_BEGIN.md) | Branch merge begins |
| [MERGE\_BRANCH\_COMMIT](variables/MERGE_BRANCH_COMMIT.md) | The branch merge is fully complete; together with [MERGE\_BRANCH\_FAILED](variables/MERGE_BRANCH_FAILED.md) they are the only two terminal states |
| [MERGE\_BRANCH\_FAILED](variables/MERGE_BRANCH_FAILED.md) | Branch merge failed event type |
| [~~REMOTE\_CHANGES\_PENDING\_EVENT~~](variables/REMOTE_CHANGES_PENDING_EVENT.md) | There are remote changes pending to be pulled |
| [REMOTE\_ENTITY\_INVALIDATED\_EVENT](variables/REMOTE_ENTITY_INVALIDATED_EVENT.md) | A remote entity's data has changed; the local query cache for it is no longer trustworthy (US-023). |
| [REPOSITORY\_SYNC\_BEGIN\_EVENT](variables/REPOSITORY_SYNC_BEGIN_EVENT.md) | Sync of a single repository begins |
| [REPOSITORY\_SYNC\_COMPLETE\_EVENT](variables/REPOSITORY_SYNC_COMPLETE_EVENT.md) | Sync of a single repository is complete; other repositories in the same round may still be in progress |
| [REPOSITORY\_SYNC\_ERROR\_EVENT](variables/REPOSITORY_SYNC_ERROR_EVENT.md) | Sync of a single repository failed |
| [RXDB\_BACKUP\_CHUNK\_SIZE](variables/RXDB_BACKUP_CHUNK_SIZE.md) | The maximum payload of a single data frame (64 KiB). |
| [RXDB\_BACKUP\_FORMAT](variables/RXDB_BACKUP_FORMAT.md) | Archive format identifier. |
| [RXDB\_BACKUP\_FORMAT\_VERSION](variables/RXDB_BACKUP_FORMAT_VERSION.md) | The current archive format version. Any other value read is rejected outright; no speculative compatibility. |
| [RXDB\_BACKUP\_SCOPE](variables/RXDB_BACKUP_SCOPE.md) | The frozen backup scope constants. |
| [RXDB\_CAPABILITY\_WATERMARK\_PREFIX](variables/RXDB_CAPABILITY_WATERMARK_PREFIX.md) | The name prefix of capability claim watermark rows |
| [RXDB\_CHANGE\_CODEC\_VERSION](variables/RXDB_CHANGE_CODEC_VERSION.md) | The version number of the current encoding/decoding protocol. |
| [RXDB\_CHANGE\_CODEC\_WATERMARK](variables/RXDB_CHANGE_CODEC_WATERMARK.md) | The full name of the current change codec watermark row |
| [RXDB\_CHANGE\_CODEC\_WATERMARK\_PREFIX](variables/RXDB_CHANGE_CODEC_WATERMARK_PREFIX.md) | The name prefix of change codec version watermark rows |
| [RXDB\_CHANGE\_ENTITY\_ID\_PREFIX](variables/RXDB_CHANGE_ENTITY_ID_PREFIX.md) | The fixed prefix of an encoded entityId, making it easy to determine "whether it has already been encoded" during deserialization. |
| [RXDB\_CHANGE\_SCHEMA\_VERSION](variables/RXDB_CHANGE_SCHEMA_VERSION.md) | - |
| [RXDB\_CHANGE\_VALUE\_ENVELOPE\_KEY](variables/RXDB_CHANGE_VALUE_ENVELOPE_KEY.md) | The key used when a field in a patch is a `bigint` / `binary` encoded value. |
| [RXDB\_SYSTEM\_SCHEMA\_VERSION](variables/RXDB_SYSTEM_SCHEMA_VERSION.md) | System table schema version |
| [RXDB\_SYSTEM\_SCHEMA\_WATERMARK](variables/RXDB_SYSTEM_SCHEMA_WATERMARK.md) | The full name of the current system schema watermark row; the adapter writes this row when backfilling via `migrateSystemSchema()` |
| [RXDB\_SYSTEM\_SCHEMA\_WATERMARK\_PREFIX](variables/RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX.md) | The name prefix of system schema watermark rows |
| [SKIP\_BRANCH\_SWITCH\_PREPARE](variables/SKIP_BRANCH_SWITCH_PREPARE.md) | A no-op implementation that explicitly states "this call has no branch to validate" |
| [SORT\_ORDER\_FIELD](variables/SORT_ORDER_FIELD.md) | The field name where the manual ordering key lives |
| [STORAGE\_CONSTRAINT\_NAME\_PREFIXES](variables/STORAGE_CONSTRAINT_NAME_PREFIXES.md) | The object name prefixes included in drift comparison: `ck_` CHECK, `uq_` conditional unique indexes, `ex_` range exclusions. |
| [SWITCH\_BRANCH\_BEGIN](variables/SWITCH_BRANCH_BEGIN.md) | Branch switch begins; dispatched inside the switch transaction, before touching the first row |
| [SWITCH\_BRANCH\_COMMIT](variables/SWITCH_BRANCH_COMMIT.md) | The branch switch has been committed |
| [SWITCH\_BRANCH\_ROLLBACK](variables/SWITCH_BRANCH_ROLLBACK.md) | The branch switch is rolled back; the database stays on the branch from before the switch |
| [SYNC\_BEGIN\_EVENT](variables/SYNC_BEGIN_EVENT.md) | A sync round begins |
| [SYNC\_COMPLETE\_EVENT](variables/SYNC_COMPLETE_EVENT.md) | A sync round ends normally |
| [SYNC\_DISABLED\_REASON](variables/SYNC_DISABLED_REASON.md) | The reason phrase when `RxDBSync.enabled` is turned off |
| [SYNC\_ERROR\_EVENT](variables/SYNC_ERROR_EVENT.md) | A sync round was interrupted by an error; mutually exclusive with [SYNC\_COMPLETE\_EVENT](variables/SYNC_COMPLETE_EVENT.md), only one of them is received per round |
| [SYSTEM\_ENTITIES](variables/SYSTEM_ENTITIES.md) | The identities of all system tables this process has seen |
| [SYSTEM\_ENTITY\_PERMISSIONS](variables/SYSTEM_ENTITY_PERMISSIONS.md) | The permission declarations of system tables: all three operations may only be written by the system |
| [TRANSACTION\_BEGIN](variables/TRANSACTION_BEGIN.md) | Transaction begins |
| [TRANSACTION\_COMMIT](variables/TRANSACTION_COMMIT.md) | Transaction commits; entity events inside this transaction were already emitted **before** it, do not wait for it to refresh the UI |
| [TRANSACTION\_ROLLBACK](variables/TRANSACTION_ROLLBACK.md) | Transaction rolls back |
| [TRUSTED\_CALLSITE\_REGISTRY](variables/TRUSTED_CALLSITE_REGISTRY.md) | The 12 trusted call sites verified against the real code (whole-table verification date 2026-09-16) |
| [TrustedWriteIntent](variables/TrustedWriteIntent.md) | The write intent declared by a trusted path |
| [UNIQUE\_INDEX\_NAME\_PREFIX](variables/UNIQUE_INDEX_NAME_PREFIX.md) | The prefix of deterministic conditional unique index names. |
| [WORKING\_TREE\_CAPTURE\_MOUNT\_POINT\_METHODS](variables/WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS.md) | The names of the mounted write primitives, in the order of the contract §1 table. |
| [WORKING\_TREE\_CAPTURE\_MOUNT\_POINTS](variables/WORKING_TREE_CAPTURE_MOUNT_POINTS.md) | The 4 mount points of contract §1, flattened into rows. |
| [WRITE\_ENTRANCES](variables/WRITE_ENTRANCES.md) | The identities of the registered write entrances |

## Functions

| Function | Description |
| ------ | ------ |
| [\_\_decorateClass](functions/decorateClass.md) | Applies decorators in order (back to front) per decorator semantics and returns the final result. |
| [applyExternalEntityUpdate](functions/applyExternalEntityUpdate.md) | Merges the incremental patch of an external event into the cached entity without recording it as a local user modification. |
| [assertClaimedCapabilities](functions/assertClaimedCapabilities.md) | Unclaimed capability guard |
| [assertEntityOperationAllowed](functions/assertEntityOperationAllowed.md) | The judgment of a single public write entrance |
| [assertMutationsAllowed](functions/assertMutationsAllowed.md) | Whole-batch precheck of a bulk public write entrance |
| [assertMutationsTableSet](functions/assertMutationsTableSet.md) | Verifies the table set an entity belongs to when the bulk write actually executes; must share the transaction boundary with the write. |
| [assertNoEntityConstraintDrift](functions/assertNoEntityConstraintDrift.md) | Asserts that an entity table has no constraint drift. |
| [assertOptionalNonNegativeSafeInteger](functions/assertOptionalNonNegativeSafeInteger.md) | Validates an optional non-negative safe integer without giving the default value any domain semantics. |
| [assertRxDBBackupCompatible](functions/assertRxDBBackupCompatible.md) | Determines whether the archive can be restored to the target configuration. |
| [assertSingleActiveBranch](functions/assertSingleActiveBranch.md) | Runtime validation: there must be **exactly** one active row; fixes nothing. |
| [assertSortOrderKey](functions/assertSortOrderKey.md) | Asserts that the ordering key written by the user is valid |
| [assertSupportedRxDBSystemVersions](functions/assertSupportedRxDBSystemVersions.md) | Asserts that the database's version is not higher than what this process supports; otherwise refuses to open. |
| [assertSystemEntityPermissions](functions/assertSystemEntityPermissions.md) | Asserts that every system table declares all three write operations as `'system'` |
| [assertUsableBranchId](functions/assertUsableBranchId.md) | Validates that a branch id is usable; throws if not. |
| [assertValidSystemContribution](functions/assertValidSystemContribution.md) | Validates the shape of a contribution |
| [branchMaterializationPageFingerprint](functions/branchMaterializationPageFingerprint.md) | Computes the fingerprint of a page snapshot payload — **this is the public standard for page fingerprints** (FR-044). |
| [buildOfflineWriteRepositoryRules](functions/buildOfflineWriteRepositoryRules.md) | Builds an OR group from "repositories that are writable offline but have no changelog endpoint", with exactly the same shape as [buildPushableRepositoryRules](functions/buildPushableRepositoryRules.md). |
| [buildPushableRepositoryRules](functions/buildPushableRepositoryRules.md) | Builds an OR group from "repositories eligible to push under the current configuration"; sync records only provide the watermark. |
| [calculateOrderBy](functions/calculateOrderBy.md) | Sorts a batch of results by `orderBy`. |
| [canonicalMaterializationJson](functions/canonicalMaterializationJson.md) | Folds a JSON value into a **key-order-independent** string — the canonical form shared by both ends of the materialization protocol. |
| [capabilityWatermarkName](functions/capabilityWatermarkName.md) | Encodes one capability claim into a migration row name |
| [checkConstraintName](functions/checkConstraintName.md) | Generates a deterministic constraint name: `ck_<table name>_<author name>_<8-digit hash of the normalized expression>`. |
| [classifyBackupIoError](functions/classifyBackupIoError.md) | Maps raw exceptions thrown by streams / storage to stable classifications; already-classified ones are returned as-is. |
| [cloneEntityClasses](functions/cloneEntityClasses.md) | Clones a set of entity classes, isolating registration side effects across instances / suites |
| [compactChanges](functions/compactChanges.md) | Compacts a change list into SwitchVersionActions (dedicated to the Push scenario) |
| [compileCheckConstraint](functions/compileCheckConstraint.md) | Compiles an entity-level CHECK. |
| [compileCheckExpression](functions/compileCheckExpression.md) | Compiles an entity-level CHECK into a normalized SQL expression (without the `CHECK (...)` wrapper). |
| [compileCheckRuleGroup](functions/compileCheckRuleGroup.md) | Compiles a single-row rule group into a parenthesized SQL expression (only literals are assembled). |
| [compileConditionalUniqueIndex](functions/compileConditionalUniqueIndex.md) | Compiles a conditional unique index. |
| [compileExclusionConstraint](functions/compileExclusionConstraint.md) | Compiles a range exclusion declaration. |
| [computeRxDBSchemaFingerprint](functions/computeRxDBSchemaFingerprint.md) | Computes the entity structure fingerprint. |
| [conditionalUniqueIndexesOf](functions/conditionalUniqueIndexesOf.md) | All conditional unique indexes of an entity (reads `indexMap`: the full set after merging inherited ones). |
| [createEntitySyncResolver](functions/createEntitySyncResolver.md) | Constructs the entity sync configuration resolver. |
| [createSha256](functions/createSha256.md) | Creates an incremental SHA-256 hasher. |
| [declaredCheckViolationOf](functions/declaredCheckViolationOf.md) | Determines whether a raw error is a metadata-declared CHECK violation (used to decide whether the message carries conflicting values). |
| [declaresStorageConstraints](functions/declaresStorageConstraints.md) | Whether an entity declares any declarative storage constraints (CHECK / conditional unique indexes / range exclusions, including inherited ones). |
| [declareTrustedWrite](functions/declareTrustedWrite.md) | Declares the intent of the immediately following write |
| [decodeRxDBChangeEntityId](functions/decodeRxDBChangeEntityId.md) | Deserialization of [encodeRxDBChangeEntityId](functions/encodeRxDBChangeEntityId.md). A value without the prefix is treated as "never encoded" and returned as-is (compatible with old RxDB data). |
| [decodeRxDBChangePatch](functions/decodeRxDBChangePatch.md) | The inverse of [encodeRxDBChangePatch](functions/encodeRxDBChangePatch.md); the semantics and column filtering rules are fully symmetric. |
| [decodeRxDBEntityIdentity](functions/decodeRxDBEntityIdentity.md) | Deserialization of [encodeRxDBEntityIdentity](functions/encodeRxDBEntityIdentity.md). |
| [describeEntityFields](functions/describeEntityFields.md) | Generates the complete field description of one entity. |
| [deterministicStringify](functions/deterministicStringify.md) | Deterministic JSON.stringify |
| [diffMetadata](functions/diffMetadata.md) | Compares remote metadata with local metadata to determine the sync action |
| [encodeRxDBChangeEntityId](functions/encodeRxDBChangeEntityId.md) | Wraps an `RxDBEntityId` into a string with a version number. **All** ids are wrapped in an envelope — string / number / bigint all carry a prefix, version number and type tag, distinguished by the tag during deserialization. |
| [encodeRxDBChangePatch](functions/encodeRxDBChangePatch.md) | Re-encodes an entity's field change package (`patch`) by column type so it remains valid JSON when persisted / sent across the network. |
| [encodeRxDBEntityIdentity](functions/encodeRxDBEntityIdentity.md) | Encodes the entity identity for AAD (Additional Authenticated Data) and identity keys. |
| [Entity](functions/Entity.md) | Entity decorator. Marks a class as an RxDB entity and handles metadata, proxies and the lifecycle |
| [entityDefaultNow](functions/entityDefaultNow.md) | The "now" inside default value functions. |
| [exclusionRangeExpressionPG](functions/exclusionRangeExpressionPG.md) | The `EXCLUDE` element expression of a one-dimensional range on the PG side. |
| [exclusionTriggerNames](functions/exclusionTriggerNames.md) | The two trigger names of one exclusion on the SQLite side: the constraint name plus `_i` (insert) / `_u` (update), still starting with `ex_` and included in drift comparison. |
| [expectedCheckConstraintNames](functions/expectedCheckConstraintNames.md) | All CHECK constraint names deterministically generated from metadata. |
| [expectedConditionalUniqueIndexNames](functions/expectedConditionalUniqueIndexNames.md) | All conditional unique index names deterministically generated from metadata (`uq_`, phase B). |
| [expectedExclusionConstraintNames](functions/expectedExclusionConstraintNames.md) | All range exclusion constraint names deterministically generated from metadata (`ex_`, phase C). |
| [~~extractEntityFields~~](functions/extractEntityFields.md) | - |
| [~~extractSystemFields~~](functions/extractSystemFields.md) | - |
| [findCheckByConstraintName](functions/findCheckByConstraintName.md) | Looks up the CHECK declared in entity metadata by constraint name (shared by drift comparison and violation normalization). |
| [findCurrentSyncRecord](functions/findCurrentSyncRecord.md) | Reads the sync record of a repository on the **current branch** (read-only, does not create) |
| [findExclusionByConstraintName](functions/findExclusionByConstraintName.md) | Looks up the range exclusion declared in entity metadata by constraint name (for violation normalization). |
| [formatEntityFieldValue](functions/formatEntityFieldValue.md) | - |
| [formatMetadataViolations](functions/formatMetadataViolations.md) | Renders aggregated cross-entity violations into a single exception message. |
| [gateRawWrite](functions/gateRawWrite.md) | Judges one raw write and only executes the statement when allowed |
| [getCurrentBranch](functions/getCurrentBranch.md) | Gets the current branch: the branch held by the table set this instance mounts; activates (or creates) `main` when the main table set has no active branch. |
| [getEntityColumnName](functions/getEntityColumnName.md) | Converts an entity property name or relation ID name to a database column name. |
| [getEntityId](functions/getEntityId.md) | Gets the entity ID |
| [getEntityMetadata](functions/getEntityMetadata.md) | Gets the entity metadata. |
| [getEntityMutations](functions/getEntityMutations.md) | Gets the entity mutation map |
| [getEntityPermission](functions/getEntityPermission.md) | Reads an entity's permission for a write operation |
| [getEntityStatus](functions/getEntityStatus.md) | Gets the entity status. |
| [getEntitySync](functions/getEntitySync.md) | Gets the entity's effective sync configuration. |
| [getEntityType](functions/getEntityType.md) | Retrieves the entity class from entity metadata. |
| [getFingerprintByEntities](functions/getFingerprintByEntities.md) | Fingerprint computation for multiple entities |
| [getFingerprintByEntity](functions/getFingerprintByEntity.md) | Fingerprint computation for a single entity |
| [getFingerprintPrimitive](functions/getFingerprintPrimitive.md) | Value type fingerprint computation. Used for queries that return raw values such as count |
| [getLocalSystemRepositories](functions/getLocalSystemRepositories.md) | Gets the system table repositories on the local adapter. |
| [getOrCreateSyncRecord](functions/getOrCreateSyncRecord.md) | Fetches (or creates for the first time) the sync watermark record of a repository/branch |
| [getRemoteSystemRepositories](functions/getRemoteSystemRepositories.md) | Gets the system table repositories on the remote adapter. |
| [getRxDBBackupAuthDomain](functions/getRxDBBackupAuthDomain.md) | The encryption auth domain: the database name when some entity declares encrypted columns (same origin as the keyring's namespace), otherwise `null`. |
| [getRxDBBackupConstraintFingerprint](functions/getRxDBBackupConstraintFingerprint.md) | Entity-level storage constraint fingerprint (CHECK / conditional unique indexes / range exclusions), written into the manifest's `constraintFingerprint`. |
| [getRxDBBackupSchemaFingerprint](functions/getRxDBBackupSchemaFingerprint.md) | Entity structure fingerprint. |
| [getRxDBChangeEntityIdQueryValues](functions/getRxDBChangeEntityIdQueryValues.md) | Splits a set of IDs into a string collection "for use in a SQL `IN (...)` list". |
| [getRxDBChangeKey](functions/getRxDBChangeKey.md) | Constructs the unique key of a business entity (for the deletes/updates/inserts Maps) |
| [getRxDBEntityIdentityKey](functions/getRxDBEntityIdentityKey.md) | Computes a stable, indexable "identity key" string: `rxid1:` + the hex of the encoded bytes. |
| [getRxDBSystemVersionState](functions/getRxDBSystemVersionState.md) | Extracts the two version numbers from the set of migration names. |
| [getSyncableRepositories](functions/getSyncableRepositories.md) | Gets the list of repositories that need syncing |
| [getSyncCapability](functions/getSyncCapability.md) | Reads the capability of a sync type |
| [getSyncConfig](functions/getSyncConfig.md) | Gets an entity's effective sync configuration (supports falling back to the global configuration) |
| [getSyncType](functions/getSyncType.md) | Gets the sync type from EntityMetadata |
| [getSystemEntityIdentities](functions/getSystemEntityIdentities.md) | The identities of all system tables (`namespace:name`, e.g. `rxdb:RxDBBranch`) |
| [getSystemEntityNames](functions/getSystemEntityNames.md) | The entity names of all system tables (the `name` on `@Entity`, without the namespace) |
| [groupBySyncType](functions/groupBySyncType.md) | Groups repositories by sync type |
| [hashConstraintDefinition](functions/hashConstraintDefinition.md) | The 8-digit hash of a normalized definition (FNV-1a 32-bit, lowercase hex). |
| [hasRxDBBackupWebLocks](functions/hasRxDBBackupWebLocks.md) | Whether the current environment provides Web Locks. |
| [inDriftScope](functions/inDriftScope.md) | Whether it is within the comparison scope (starting with `ck_` / `uq_` / `ex_`). |
| [installWorkingTreeCapture](functions/installWorkingTreeCapture.md) | Installs the four capture mount points on one local adapter instance |
| [isAdapterShutdownError](functions/isAdapterShutdownError.md) | Determines whether an error was caused by the adapter shutting down / disconnecting. |
| [isConditionalUniqueIndex](functions/isConditionalUniqueIndex.md) | Whether an index is a conditional unique index (declares `where`). |
| [isCrossTabEvent](functions/isCrossTabEvent.md) | Determines whether an event comes from another tab. |
| [isCurrentRxDBSystemVersion](functions/isCurrentRxDBSystemVersion.md) | Determines whether the database has already settled at the current watermark; both numbers must be equal. |
| [isEntityInternalName](functions/isEntityInternalName.md) | Determines whether a field name is an internal reserved field. Includes base class fields, private fields and fields starting with an underscore |
| [isEntityMatchWhere](functions/isEntityMatchWhere.md) | Determines whether an entity matches a rule group |
| [isEntitySyncResolver](functions/isEntitySyncResolver.md) | Determines whether the argument is a resolver (rather than a database-level `SyncOptions`). |
| [isExclusionNarrowingUpdate](functions/isExclusionNarrowingUpdate.md) | Whether an update "narrows" all of an entity's range exclusions: at least one exclusion column is touched, equal columns stay unchanged, and every new range dimension falls within the old range (endpoint comparison; inverted / empty ranges remain empty after narrowing). |
| [isManualOrderEntity](functions/isManualOrderEntity.md) | Whether an entity has manual ordering enabled |
| [isNetworkError](functions/isNetworkError.md) | Determines whether an error is a network failure (cannot reach the remote), rather than a business result given by the remote. |
| [isNoSync](functions/isNoSync.md) | Checks whether a repository is not synced at all |
| [isRemoteNewer](functions/isRemoteNewer.md) | Determines whether the remote record is newer than the local one. |
| [isRepositorySyncEnabled](functions/isRepositorySyncEnabled.md) | Determines whether the repository's sync switch is enabled |
| [isRuleGroup](functions/isRuleGroup.md) | Determines whether it is a RuleGroup |
| [isRxDBBackupError](functions/isRxDBBackupError.md) | Determines whether a value is an [RxDBBackupError](classes/RxDBBackupError.md) with the given code. |
| [isRxDBEntity](functions/isRxDBEntity.md) | Checks whether it is an RxDB entity. |
| [isStaleEntityEvent](functions/isStaleEntityEvent.md) | Determines whether an entity change event is stale relative to the entity cache. |
| [isStaleEntityRemoveEvent](functions/isStaleEntityRemoveEvent.md) | Determines whether a DELETE event is stale relative to the entity cache. |
| [isSystemEntity](functions/isSystemEntity.md) | Determines whether an entity class is a system table injected by RxDB |
| [isUniqueConstraintViolation](functions/isUniqueConstraintViolation.md) | Determines whether an error is a unique/primary key constraint conflict. |
| [isWorkingTreeCaptureMountPoint](functions/isWorkingTreeCaptureMountPoint.md) | Determines whether a write primitive signature is a capture mount point |
| [manualOrderGroupFields](functions/manualOrderGroupFields.md) | The grouping fields of a manually ordered entity |
| [needsOfflineWrite](functions/needsOfflineWrite.md) | Checks whether a repository accepts local writes when the remote is unreachable (and replays them after the connection recovers) |
| [needsPull](functions/needsPull.md) | Checks whether a repository needs a pull |
| [needsPush](functions/needsPush.md) | Checks whether a repository needs a push |
| [normalizeCreateEntity](functions/normalizeCreateEntity.md) | Normalizes creation data (filters out unassigned fields). |
| [normalizeManualOrderBy](functions/normalizeManualOrderBy.md) | Adds the default ordering to queries of manually ordered entities |
| [normalizeUpdateEntity](functions/normalizeUpdateEntity.md) | Normalizes update data and filters out readonly fields. |
| [orderExclusionUpdates](functions/orderExclusionUpdates.md) | Orders a group of updates of one entity: narrowing ones first, the rest keep their original relative order (stable grouping, no full sort). |
| [ordersWritesForExclusion](functions/ordersWritesForExclusion.md) | Whether an entity's writes are ordered "delete → update → insert" (true when range exclusions are declared). |
| [parseCapabilityWatermark](functions/parseCapabilityWatermark.md) | Reads a capability claim back from a migration row name |
| [parseCheckConstraintViolation](functions/parseCheckConstraintViolation.md) | Parses the constraint name of a CHECK violation from a raw database error. |
| [parseEntityFieldsDescriptor](functions/parseEntityFieldsDescriptor.md) | Parses and validates a field description coming from the network or storage. |
| [parseEntityFieldValue](functions/parseEntityFieldValue.md) | Normalizes a raw value into the entity-side runtime representation according to the field type. |
| [parseEntityRecordValues](functions/parseEntityRecordValues.md) | Decodes a whole raw record into entity-side runtime values according to the entity metadata. |
| [parseExclusionViolation](functions/parseExclusionViolation.md) | Parses a range exclusion violation from a raw database error. |
| [parseRxDBBackupManifest](functions/parseRxDBBackupManifest.md) | Validates and normalizes the archive manifest. |
| [parseRxDBChangeKey](functions/parseRxDBChangeKey.md) | Parses the entity key |
| [parseRxDBEntityIdentityKey](functions/parseRxDBEntityIdentityKey.md) | The inverse of [getRxDBEntityIdentityKey](functions/getRxDBEntityIdentityKey.md); a value without the prefix is treated as a "non-identity key" and returned as-is — so that `parseRxDBEntityIdentityKey(decodeRxDBEntityIdentityKey(x)) === x` does not throw for any string `x`, and callers can round-trip unconditionally. |
| [parseUpdatedAt](functions/parseUpdatedAt.md) | Parses `updatedAt` into a millisecond timestamp. |
| [planMutationWrites](functions/planMutationWrites.md) | Orders the execution of one bulk write (`mutations`). |
| [prepareIncrementalUpdate](functions/prepareIncrementalUpdate.md) | Prepares the incremental merge context for a batch of UPDATE events. |
| [queryNeedRefreshCreate](functions/queryNeedRefreshCreate.md) | - |
| [queryNeedRefreshRemove](functions/queryNeedRefreshRemove.md) | - |
| [queryNeedRefreshUpdate](functions/queryNeedRefreshUpdate.md) | Determines whether a batch of UPDATEs must go back to SQL or can take the JS incremental path. |
| [quoteSqlIdentifier](functions/quoteSqlIdentifier.md) | Wraps an identifier (table name, column name) in double quotes. |
| [referencedCheckFields](functions/referencedCheckFields.md) | Collects all fields referenced by a rule tree (including `ref` targets), deduplicated in declaration order. |
| [registerSystemEntities](functions/registerSystemEntities.md) | Registers the system tables contributed by plugins |
| [reorderTargetForDrop](functions/reorderTargetForDrop.md) | Converts "drop above / below the target row" into the neighbor target of `Repository.reorder()` |
| [reorderTargetForMove](functions/reorderTargetForMove.md) | Converts "drag row `fromIndex` to row `toIndex`" into the neighbor target of `Repository.reorder()` |
| [repositoryKey](functions/repositoryKey.md) | Renders a repository identifier as `namespace:entity` (the key format shared by the dependency graph and error messages) |
| [resolve\_current\_branch](functions/resolve_current_branch.md) | Resolves the "current branch": the branch held by the table set this instance mounts; activates `main` when the main table set has no active branch, and creates one if `main` does not exist either. |
| [resolvePullIneligibility](functions/resolvePullIneligibility.md) | Determines whether a repository can currently pull (two checks: syncType + `RxDBSync.enabled`) |
| [resolvePushIneligibility](functions/resolvePushIneligibility.md) | Determines whether a repository can currently push (two checks: syncType + `RxDBSync.enabled`) |
| [resolveSingleActiveBranch](functions/resolveSingleActiveBranch.md) | **Only for the first-enable migration**: reads the single active branch, and recovers to `main` when there is no active branch. |
| [runRxDBBackupWhenQueued](functions/runRxDBBackupWhenQueued.md) | Executes the backup task in the adapter's serial queue; the queueing itself has a time limit and can be cancelled. |
| [sha256Hex](functions/sha256Hex.md) | Computes the SHA-256 of a chunk of bytes. |
| [sqlBooleanLiteral](functions/sqlBooleanLiteral.md) | Assembles a boolean value into a SQL boolean literal. |
| [sqlIntegerLiteral](functions/sqlIntegerLiteral.md) | Assembles an integer into a SQL numeric literal. |
| [sqlStringLiteral](functions/sqlStringLiteral.md) | Assembles a string into a SQL string literal. |
| [sqlTimestampLiteral](functions/sqlTimestampLiteral.md) | Assembles a timestamp into a SQL string literal (ISO 8601, UTC). |
| [storageConstraintName](functions/storageConstraintName.md) | Generates a deterministic constraint name: `<prefix><table name>_<author name>_<8-digit hash of the normalized definition>`. |
| [syncTypeIneligibility](functions/syncTypeIneligibility.md) | Reads the reason a sync type lacks capability in the given direction |
| [takeDeclaredWrite](functions/takeDeclaredWrite.md) | Takes out and clears the declaration on this scope |
| [toCheckViolationError](functions/toCheckViolationError.md) | Normalizes a raw CHECK violation error into [RxDBCheckViolationError](classes/RxDBCheckViolationError.md). |
| [toCheckViolationErrorForRows](functions/toCheckViolationErrorForRows.md) | CHECK violation normalization for multi-row bulk writes: conflicting values are listed row by row (the native message does not say which row a bulk INSERT hit, so the values of all candidate rows are listed). |
| [toEntitySyncResolver](functions/toEntitySyncResolver.md) | Normalizes the historical `databaseSync` parameter into a resolver. |
| [toExclusionViolationError](functions/toExclusionViolationError.md) | Normalizes a raw range exclusion violation error into [RxDBExclusionViolationError](classes/RxDBExclusionViolationError.md). |
| [toStorageConstraintViolationError](functions/toStorageConstraintViolationError.md) | Storage constraint violation normalization on the write path: CHECK goes to [RxDBCheckViolationError](classes/RxDBCheckViolationError.md), range exclusions go to [RxDBExclusionViolationError](classes/RxDBExclusionViolationError.md), the rest are returned as-is. |
| [transitionMetadata](functions/transitionMetadata.md) | Converts metadata options (metadataOptions) into entity metadata (metadata) |
| [trustedCallsiteKey](functions/trustedCallsiteKey.md) | Registry key: file + symbol + intent |
| [tryAcquireRxDBBackupLock](functions/tryAcquireRxDBBackupLock.md) | Immediately tries to acquire the lock; returns `null` if unavailable, without queueing. |
| [tryGetEntityMetadata](functions/tryGetEntityMetadata.md) | Probes entity metadata: returns `undefined` when not found, does not throw. |
| [tryGetEntityStatus](functions/tryGetEntityStatus.md) | Probes entity status: returns `undefined` when not found, does not throw. |
| [uninstallWorkingTreeCapture](functions/uninstallWorkingTreeCapture.md) | Uninstalls the capture mount points, restoring the five write primitives to their pre-installation state |
| [uuid](functions/uuid.md) | - |
| [~~validateEntityFieldValue~~](functions/validateEntityFieldValue.md) | Validates a field value against [EntityFieldConfig](interfaces/EntityFieldConfig.md). |
| [validateEntityMetadata](functions/validateEntityMetadata.md) | Validates the metadata declaration of a single entity and returns all violations sorted by `namespace/entity/field/rule`. |
| [validateEntityMetadataSet](functions/validateEntityMetadataSet.md) | Aggregates validation across entities and returns all violations sorted, in one go. |
| [validateFieldValue](functions/validateFieldValue.md) | Validates a single field value against [EntityFieldDescriptor](type-aliases/EntityFieldDescriptor.md). |
