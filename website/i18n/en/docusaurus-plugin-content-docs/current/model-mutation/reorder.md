# Manual ordering (manualOrder and reorder)

Manual ordering is an explicit opt-in at entity level. When you declare `manualOrder`, the engine takes over the entity's `sortOrder` key: queries without an `orderBy` return rows in manual order by default, a created row missing the key is appended to the end of its group, and `Repository.reorder()` moves a row to a target position. Ordering lives in the core package `@aiao/rxdb`, independent of the tree plugin — it works without installing `@aiao/rxdb-plugin-tree`.

## Declaring it

Declare `manualOrder` in the `@Entity()` decorator options, in one of two shapes:

- `manualOrder: true` — one sequence for the whole table
- `manualOrder: { groupBy: [...] }` — one sequence per combination of the grouping fields (ordering domain)

```ts
import { EntityBase, Entity, ISortableEntity, PropertyType, SortOrderKey } from '@aiao/rxdb';

// One sequence for the whole table: flat lists such as categories or menus
@Entity({
  name: 'Category',
  manualOrder: true,
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string }
  ]
})
class Category extends EntityBase implements ISortableEntity {
  name!: string;
  sortOrder!: SortOrderKey;
}

// Grouped ordering domains: one sequence per board column
@Entity({
  name: 'Task',
  manualOrder: { groupBy: ['completed'] },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean },
    { name: 'sortOrder', type: PropertyType.string }
  ]
})
class Task extends EntityBase implements ISortableEntity {
  title!: string;
  completed!: boolean;
  sortOrder!: SortOrderKey;
}
```

Declaration rules:

- Explicit opt-in: ordering applies only when declared. An entity that happens to have a `sortOrder` field but no declaration behaves exactly as before.
- You declare the `sortOrder` field yourself; the engine does not inject it. It must be a string, writable, non-computed, non-encrypted, and non-nullable (`NOT NULL` at table creation). Violations are reported clearly at registration.
- Grouping fields must be scalar columns of the entity itself (including many-to-one foreign key columns such as `categoryId`): non-computed, writable, non-encrypted. `NULL` is its own group and sorts first in the default ordering.
- `ISortableEntity` is only a TypeScript convenience type (`sortOrder: SortOrderKey`, where `SortOrderKey` is an alias of `string`), not a runtime declaration — at runtime `@Entity({ manualOrder })` is what counts.
- The declaration inherits along the prototype chain; a subclass can write `false` to turn it off or override the grouping fields.
- Keys are generated with fractional indexing (default alphabet) and compared by code-point lexicographic order. Each group starts from `a0`; keys can repeat across groups.

:::warning Enabling on an existing entity

Columns of an existing table are not altered to `NOT NULL` — the engine only creates missing tables, it never alters columns. When you enable manual ordering on an existing entity, existing rows must be backfilled with keys explicitly in a migration. For a `NOT NULL` constraint at the DDL level you need a new entity.

:::

## Default ordering contract

For an entity that declares `manualOrder`, queries without an `orderBy` are normalized to:

- Whole-table ordering: `[sortOrder asc, id asc]`
- Grouped ordering: `[group fields… asc, sortOrder asc, id asc]`, with the `NULL` group first

This covers the four read entry points of `Repository`: `find` / `findAll` / `findOne` / `findOneOrFail` (`count` does not sort, `get` reads a single row by id, and `findByCursor` requires an explicit `orderBy`). An `orderBy` supplied by the caller is respected as-is — nothing appended, nothing rewritten.

## Automatic appending

- **Creation without a key**: rows created through `Repository.create` / `EntityManager.create` / entity `save()` (new entity) / `saveMany` / `mutations` without a `sortOrder` are appended to the end of the row's ordering domain (the engine reads only the group's tail key; an empty group gets `a0`).
- **Batch creation**: rows are split by group, and each group's keys are generated once in batch order without collisions.
- **Grouping field changed**: when a normal update changes any grouping field and the same write provides no `sortOrder`, the row is appended to the end of the new group inside the same primary adapter transaction; the other rows of the old group are untouched. Multiple rows in one batch are split and appended by their new groups.
- **Explicit keys**: a valid explicitly supplied key is kept as-is; an invalid one raises a clear error (`SortOrderError` with `invalidKey`).
- Rows from non-user sources (sync pulls, recovery, history replay) are written as-is — no keys assigned or rewritten.

Batch appending (`appendToGroupTails`) has an optimization: when a batch creates a parent row whose group is new, the group's tail key is not read (the `KnownEmptyGroup` check), keeping the same order as appending to existing groups.

## Repository.reorder()

```ts
const repository = rxdb.entityManager.getRepository(Category);

// Move within a group: insert between row a and row b (one side is null at the group edges)
await repository.reorder(movedId, { prevId: a.id, nextId: b.id });

// Append to the end of a group: {} for whole-table ordering
await repository.reorder(movedId, { group: {} });

// Move across groups: append to the end of the "completed" group
await repository.reorder(todoId, { group: { completed: true } });
```

`reorder(id, target)` takes a move intention, not a final arrangement. The target position has two shapes:

- `{ prevId, nextId }` — neighbors within a group: one side is `null` at the group start / end; both sides `null` is invalid — use `{ group }` to move to the end
- `{ group: {...} }` — append to the end of a group: the key set must be exactly the declared grouping fields (`{}` for whole-table ordering). A target group different from the current one is a cross-group move; only the grouping fields and `sortOrder` are written within the same transaction

Write-path guarantees:

- Reading neighbors, re-checking adjacency, computing the key, and writing all happen in the same transaction on the primary adapter; the transaction re-checks that the moved row still exists and that both neighbors belong to the target group and are still adjacent — any failure rejects with zero writes
- A within-group move writes only `sortOrder`; a cross-group move writes only the grouping fields and `sortOrder`, without saving other unsaved changes on the instance
- Already at the target position: zero writes, returned as-is
- Entities declaring `update: 'system'` throw `PermissionDeniedError` before the transaction opens — zero writes
- remote-only or QueryCache primaries are rejected (`unsupportedPrimary`) — the local side only holds a subset of the sequence, and computing keys from it would disagree with the remote

## Error handling

A failed reorder throws `SortOrderError`; nothing is committed when it throws — all validation happens before writing, and a failed in-transaction re-check aborts the whole transaction. Branch on `reason`:

| reason               | Meaning                                                                                                                                  | Response            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `notManualOrder`     | `reorder` called on an entity that does not declare `manualOrder`                                                                        | Caller error        |
| `invalidKey`         | A user-supplied sort key is invalid                                                                                                      | Caller error        |
| `corruptAnchor`      | A key read as an anchor (tail key / neighbor) is invalid, or two neighbors do not satisfy `prev < next`                                  | Data is corrupt     |
| `unsupportedPrimary` | Primary is remote-only or QueryCache; the full sequence cannot be read                                                                   | Unsupported backend |
| `invalidTarget`      | The target does not hold: both neighbors empty, a neighbor is the moved row itself, or the `group` keys do not match the grouping fields | Caller error        |
| `notFound`           | The moved row no longer exists                                                                                                           | Re-query            |
| `staleTarget`        | A neighbor no longer exists, is no longer adjacent, or is in another group — the caller's view of the order is stale                     | Re-query and retry  |

```ts
import { SortOrderError } from '@aiao/rxdb';

try {
  await repository.reorder(id, { prevId, nextId });
} catch (error) {
  if (error instanceof SortOrderError && error.reason === 'staleTarget') {
    refresh(); // Normal under concurrency: re-query and retry
  } else {
    throw error;
  }
}
```

`staleTarget` / `notFound` are normal outcomes under concurrency — re-query and retry. The others indicate a caller or data problem; retrying will not change the outcome.

## Utility functions

The core exports six primitives for checking and converting, so UIs and import scripts can validate before writing and plugin mock repositories share the same source as the core:

- `assertSortOrderKey(entity, key): asserts key is SortOrderKey` — asserts the sort key is valid: throws `SortOrderError` (`invalidKey`) for empty strings, non-strings, malformed formats, or keys outside the default alphabet
- `isManualOrderEntity(metadata)` — whether the entity has manual ordering enabled
- `manualOrderGroupFields(metadata)` — the grouping fields in declaration order; empty array for whole-table ordering or when not enabled
- `normalizeManualOrderBy(metadata, options)` — normalizes query options to the default ordering: without an `orderBy` (or with an empty array) returns a new object completed as `[group fields… asc, sortOrder asc, id asc]`, otherwise returns it unchanged

The last two conversion functions turn a drag-and-drop landing spot into a neighbor target for `reorder()`:

```ts
// Flat list: convert "drag the row at fromIndex to toIndex" into a neighbor target
const target = reorderTargetForMove(
  rows.map(row => row.id),
  fromIndex,
  toIndex
);
if (target) await repository.reorder(rows[fromIndex].id, target);

// Tree / cross-group drop: convert "drop above or below the target row" into a neighbor target
const target = reorderTargetForDrop(siblingIds, draggedId, overId, 'after');
if (target) await repository.reorder(draggedId, target);
```

- `reorderTargetForMove(ids, fromIndex, toIndex)` — a drop in place (`fromIndex === toIndex`) returns `null`; the caller should not start a reorder. Invalid indices or a sequence with fewer than two rows throw `RangeError`.
- `reorderTargetForDrop(groupIds, movedId, targetId, position)` — `position` is `'before'` or `'after'`. `groupIds` must be the target group's complete sequence (including rows hidden by filters or outside the render window); passing only the visible rows can sandwich a hidden sibling between the two neighbors and make `reorder()` report `staleTarget`. Returns `null` when the dragged row is already at that position.

Use `getEntityMetadata(Task)` to read metadata.

## Relationship to the tree plugin

Ordering lives in the `@aiao/rxdb` core: default query ordering and creation-time appending are on the engine's write path, and flat-list ordering does not need the tree plugin. The dependency direction is tree plugin → ordering module.

- A tree entity that declares `manualOrder: { groupBy: ['parentId'] }` (with a non-null `sortOrder`) makes the siblings under one parent an ordering domain; the root is the `NULL` group
- `TreeRepository` extends `Repository`, so it inherits `reorder()`
- A cross-parent drop is a cross-group move: append to the end of the target node's children, without reading the target's children — it is correct even when the target is collapsed

```ts
await repository.reorder(draggedId, { group: { parentId: target.id } });
```

Cycle detection is not part of `reorder()` — the caller must reject dropping a node into its own descendants first. The tree plugin's `ISortableTreeEntity` only composes a nullable `sortOrder` from the core `SortOrderKey` type; implementing it does not grant the manual-order declaration. See the "Sortable tree entities" section of [Tree structure](/model-definition/structure-tree.md).

## Drag and drop in rxdb-model entity lists

The three-framework `EntityList` enables drag handles automatically for sortable entities that qualify (string primary key, `normal` sort state, fully loaded data, no drafts or pending edits, and so on). A drop is converted by `reorderTargetForMove` into a neighbor target and passed to `Repository.reorder()`; on failure the latest committed order is restored and the error is shown, and the next drag works again. See [Entity model (rxdb-model) entity lists](/entity-model/README.md) for usage and details.

## Further reading

- [Writing and deleting entities](/model-mutation/README.md)
- [Tree structure](/model-definition/structure-tree.md)
- [findDescendants](/model-query/findDescendants.md) / [findAncestors](/model-query/findAncestors.md)
