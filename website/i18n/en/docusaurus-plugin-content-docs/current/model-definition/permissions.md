# Entity operation permissions

Every entity can declare, for each of the three write operations - create, update, and delete - who it is open to:

- `'both'`: users and the system can both write (the default, same as the current behavior)
- `'system'`: system writes only - a user write through a public write entry point is rejected on the spot, naming the entity and the operation

The same declaration drives two things at once: fast failure at the write entry points (throwing `PermissionDeniedError`), and which create, edit, and delete entry points the entity management UI (the `EntityList` of Angular / React / Vue) shows. Permission declarations live in the `@aiao/rxdb` core package, so there is nothing extra to install.

:::warning This is fast failure, not a defensive boundary
Permission checks are only placed at the public write entry points (the `Repository` facade and `EntityManager`). Writes at the adapter / executor layer are not checked - sync pulls, migrations, history replay, and working-tree materialization all go through that layer. So "no error" does not mean "blocked"; true immutability needs SQL triggers as a backstop, which is beyond what this model means.
:::

## What it solves

Before the permission model, system tables could only stay read-only through per-field `readonly` and the `isSystemEntity()` special case: per-field flags cannot stop creates and deletes, and one unmarked new field leaves the table exposed. The permission model collapses "can this entity be touched" into a single declaration on the entity:

- The 14 system tables (4 core + 10 contributed by the working-tree plugin) explicitly declare all three operations as `'system'`, making the whole table read-only to users
- Entities written only by sync or migrations (such as an exchange rate table) can tighten just `create`; the UI then hides "+ New"
- All three framework UIs derive their entry points from the same declaration instead of each maintaining its own special cases

Division of labor with field-level `readonly`: entity-level permissions are the "gate" (whether this entity's operations are open to users), and field-level `readonly` is the "fence" (which fields of an editable entity updates do not rewrite). The two do not override each other - a field declared `readonly: true` inside an editable entity is still not rewritten by updates.

## Declaring permissions

The permission types come from `@aiao/rxdb`:

```ts
type EntityOperation = 'create' | 'update' | 'delete';
type EntityOperationPermission = 'both' | 'system';

interface EntityPermissionOptions {
  create?: EntityOperationPermission;
  update?: EntityOperationPermission;
  delete?: EntityOperationPermission;
}
```

Declare them on the `permissions` key of the `@Entity` decorator:

```ts
import { Entity, EntityBase } from '@aiao/rxdb';

@Entity({
  name: 'ExchangeRate',
  permissions: {
    create: 'system', // Written only by sync pulls: the UI has no "+ New", and create through the public write entry points is rejected
    update: 'system', // User read-only: rows carry _readonly, and "View" opens in view mode
    delete: 'system' // Users cannot delete: the action column has no "Delete"
  }
})
export class ExchangeRate extends EntityBase {}
```

| Value      | Meaning                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `'both'`   | Users and the system can both write (the default)                                                                               |
| `'system'` | System writes only: a user write through a public entry point throws `PermissionDeniedError`, and the UI hides the entry points |

When `permissions` is not configured or a key is omitted, all three operations count as `'both'`, and write and UI behavior stay exactly as they were before the permission model.

`'none'` and `'user'` are not supported: `'none'` (nobody may write) cannot stop sync, migrations, and direct adapter writes at the facade layer, so declaring it is an illusion; `'user'` (only users may write, not the system) has no decidable meaning in a layered model. Declaring either value fails at initialization, and the error message explains the reason instead of just saying "invalid value".

## Nearest-ancestor inheritance

Permissions inherit along the prototype chain **per operation, key by key**: an operation a subclass does not declare uses the nearest ancestor that declares it, and an operation no ancestor on the whole chain declares takes `'both'`. It is not whole-key override - when a subclass writes only `{ delete: 'system' }`, the parent's tightened `update` still comes through.

For example, with a parent that declares `update: 'system'`:

- Subclass A declares only `delete: 'system'`: its runtime permissions are `create: 'both'`, `update: 'system'`, `delete: 'system'`
- Subclass B declares nothing: identical to the parent (`update: 'system'`, the rest `'both'`)

In runtime metadata, `permissions` is the completed object with all three keys (`Readonly<Required<EntityPermissionOptions>>`) and can be read as a whole.

:::tip Many-to-many join tables do not inherit
The Junction entity generated for a many-to-many relation is created by `SchemaManager.init()` from default metadata. It declares no `permissions` and takes the default `'both'` - independent of what the two end entities declare. Linking business rows to an entity with `update: 'system'` therefore only adds and removes Junction rows and never writes that read-only entity, and is let through as usual.
:::

## System tables

The system tables are "14 tables, each explicitly declared": 4 core tables plus 10 contributed by the working-tree plugin, and each one writes `permissions: SYSTEM_ENTITY_PERMISSIONS` (all three operations `'system'`) on its own `@Entity`.

The 4 core tables (`packages/rxdb/src/system/`):

| Entity          | Description              |
| --------------- | ------------------------ |
| `RxDBBranch`    | Branch table             |
| `RxDBChange`    | Change log table         |
| `RxDBMigration` | Migration registry table |
| `RxDBSync`      | Sync watermark table     |

The 10 tables contributed by working-tree (`@aiao/rxdb-plugin-working-tree`):

| Entity                            |
| --------------------------------- |
| `Commit`                          |
| `CommitBranchRef`                 |
| `CommitChangeSet`                 |
| `CommitCapabilityState`           |
| `WorkingTreeState`                |
| `WorkingTreeEntry`                |
| `WorkingTreeActivationState`      |
| `WorkingTreeMaterializationStage` |
| `WorkingTreeMaterializationPage`  |
| `WorkingTreeRestoreSession`       |

After plugins are installed and before `schemaManager.init()`, `RxDB.init()` asserts for each table in the instance list `rxdb.systemEntities` that all three operations are declared `'system'`. A system table contributed by a plugin that misses the declaration (or has any operation that is not `'system'`) throws during initialization, and the message names each table and the operation it lacks.

System tables rely on **explicit declarations**, not "tighten automatically because it is a system table": the UI's hiding and the facade's interception both read the same declaration, while automatic tightening would leave plugin authors unable to see what constraints apply to their tables, and a missed declaration would silently go unprotected. A fully declared system table is read-only throughout the entity management UI: no "+ New", no "Delete", every row read-only, and "View" opens the detail in view mode.

## Runtime behavior

### Where checks happen

Checks exist only at the public write entry points, five in total:

| Entry point                                            | When the check runs                                                                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Facade `Repository.create()` / `update()` / `remove()` | Before `primary$` picks the primary side - independent of which side wins; a rejection never touches the adapter                                                          |
| `EntityManager.mutations()`                            | A **whole-batch precheck** of the create / update / delete groups, before the primary side is picked                                                                      |
| `Repository.reorder()`                                 | Checks itself against `update` before opening the transaction (its reads of neighboring rows and its write go through the executor, which belongs to the unchecked layer) |

All other write methods funnel into the points above: a single `EntityManager.save()` routes to `create()` / `update()` / `remove()` based on the entity's state; `saveMany()` / `removeMany()`, and a single `save()` that carries associated entities or join-table rows pending deletion, go through `mutations()`; the entity instance's `save()` / `remove()` delegate through `EntityManager` to the same entry points.

Whole-batch precheck semantics: if **any** item in the batch violates, the whole batch is rejected and nothing is written. The violation list on `PermissionDeniedError` names **all** violating entities and operations in the batch, not just the first - the caller sees in one shot which writes to remove, instead of fixing one and hitting the next. QueryCache batches are then checked again item by item through the facade, with the same results as the precheck.

### PermissionDeniedError

`PermissionDeniedError` is a subclass of `RxDBError` with a read-only violation list:

```ts
class PermissionDeniedError extends RxDBError {
  readonly violations: readonly PermissionViolation[];
}

interface PermissionViolation {
  namespace: string; // Namespace of the entity
  entity: string; // Entity name (the `name` in metadata)
  operation: 'create' | 'update' | 'delete'; // The rejected write operation
}
```

```ts
try {
  await entityManager.saveMany(entities);
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    console.warn(error.violations.map(v => `${v.entity}.${v.operation}`));
  } else {
    throw error;
  }
}
```

A single entry point rejection yields exactly one item in the list. A rejection never changes data: a rejected create leaves no new row, a rejected update leaves the row as it was, and a rejected remove leaves the row in place.

### Unchecked paths

The writes below belong to the adapter / executor layer (the system write channel) and are not permission-checked:

- Adapters obtained from `rxdb.getAdapter()` or `localAdapter$` / `remoteAdapter$`, through their `mutations()` / `saveMany()` / `removeMany()` / `transaction()` executor / `rawQuery()`
- Projection rewrites: `rxdb.switchBranch()`, undo/redo, merges, and pulls - they replay writes that already happened
- Foreign key cascades (executed at the SQL layer)
- The graph plugin's `addEdge()` / `removeEdge()` (writing auto-generated edge entities)

:::warning No "true immutability"
`'system'` means "the public write entry points are closed", not a permit for system writes, and not true immutability: sync, migrations, branch switches, and foreign key cascades at the adapter layer still write these rows. When you need "nobody can change it after creation", use SQL triggers as the backstop and handle logging, branches, and sync separately - that is a different story.
:::

## Framework entry point derivation

Entry point visibility in the entity management UI is uniformly derived from metadata by `deriveEntityCapabilities()` in `@aiao/rxdb-model`:

```ts
import { getEntityMetadata } from '@aiao/rxdb';
import { deriveEntityCapabilities } from '@aiao/rxdb-model';

const { canCreate, canEdit, canDelete } = deriveEntityCapabilities(getEntityMetadata(Invoice));
```

| Capability  | Value               | What the UI shows when false                                                                                                                        |
| ----------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canCreate` | `create === 'both'` | The list hides "+ New"                                                                                                                              |
| `canEdit`   | `update === 'both'` | Rows carry `_readonly`: cells, paste, drag, and keyboard switching are all non-writable; "View" opens the detail in view mode (no save entry point) |
| `canDelete` | `delete === 'both'` | The action column has no "Delete"; "View" remains                                                                                                   |

Delete capability and row read-only are **decoupled**: an entity with `update: 'system'` has read-only rows but can still be deleted when `delete: 'both'`; an entity with `delete: 'system'` has editable rows but no delete button. The action column's `actionsColumn()` takes a per-row predicate `(record) => boolean` as its third argument, which `buildEditableColumns()` derives from `canDelete` - applications that call `actionsColumn()` directly must pass it themselves; see [Action column delete predicate migration](/migration/actions-column-can-delete.md) (in Chinese).

The `EntityList` of all three frameworks follows the same derivation path:

- Angular: the `rxdb-entity-list` component in `@aiao/rxdb-model-angular`
- React: the `EntityList` component in `@aiao/rxdb-model-react`
- Vue: the `EntityList` component in `@aiao/rxdb-model-vue`

The Relations tab of the detail dialog embeds `EntityList` itself; the associated entities follow the same derivation, so the Relations tab needs no separate configuration.

## Interaction with sync and the query cache

- **System writes are unchecked, so sync is unaffected.** Sync pushes and pulls, migration registration, undo/redo, and working-tree commits all go through the adapter / executor layer. An entity with `create: 'system'` (such as an exchange rate table) can still be written by sync pulls; declaring system tables user-unwritable does not interfere with sync, undo, or branch deletion.
- **QueryCache batches are prechecked as a whole before any write goes out.** The `mutations()` precheck completes before any write is issued, and QueryCache batches are then checked again item by item through the facade with the same results - there is no half-written batch where "the first N-1 items were already written and only the Nth was rejected".
- **Many-to-many Junctions default to `'both'`**: linking to a read-only entity only writes join-table rows, and is let through.

## Continue reading

- [Defining an entity](/model-definition/README.md)
- [Writing and deleting entities](/model-mutation/README.md)
- [Action column delete predicate migration](/migration/actions-column-can-delete.md) (in Chinese)
