# Action column delete rules: `actionsColumn` gains `canDelete`

`actionsColumn` from `@aiao/rxdb-model` gained a new **required** third parameter, `canDelete`. The old third parameter (the view label) moves to the fourth position:

```typescript
// Before
actionsColumn(title: string, deleteLabel: string, viewLabel?: string): ColumnDefine;

// After
actionsColumn(title: string, deleteLabel: string, canDelete: RecordDeletePredicate, viewLabel?: string): ColumnDefine;
```

This is a **breaking change**. Old two- and three-argument calls fail at compile time with TS2554 / TS2345; JavaScript calls that bypass type checking throw `canDelete is not a function` when a cell with a record is rendered. Applications that only use the action column through `EntityList` (Angular / React / Vue) or `buildEditableColumns` and never call `actionsColumn` directly are unaffected.

## Why

The old version decided what to show based on whether a row was read-only: read-only rows got an empty action column, and every other row got a delete button. After the entity capability model (US-027) split create, edit, and delete into three independent capabilities, that rule was wrong in both directions:

- A row on an entity with `update: 'system'` is read-only, but with `delete: 'both'` it should still be deletable;
- A row on an entity with `delete: 'system'` is editable, but should not get a delete button.

Delete capability can only be supplied by the caller based on entity capabilities; `actionsColumn` no longer guesses for you, so `canDelete` is required with no default. The view button is likewise decoupled from read-only status: if you pass `viewLabel`, every row gets it.

## How to update

Derive it from entity metadata, matching the decision logic inside `EntityList`:

```typescript
import { actionsColumn, deriveEntityCapabilities } from '@aiao/rxdb-model';

const { canDelete } = deriveEntityCapabilities(metadata);

// Before
actionsColumn('Actions', 'Delete', 'View');
// After
actionsColumn('Actions', 'Delete', () => canDelete, 'View');
```

`canDelete` is called per row; when you really need per-row decisions, read the record:

```typescript
actionsColumn('Actions', 'Delete', record => record['locked'] !== true);
```

To keep the old behavior exactly (read-only rows cannot be deleted), use the public `isReadonly`:

```typescript
import { actionsColumn, isReadonly } from '@aiao/rxdb-model';

actionsColumn('Actions', 'Delete', record => !isReadonly(record), 'View');
```

Note that the old version did not even show the view button on read-only rows; the new view button is no longer affected by read-only status.
