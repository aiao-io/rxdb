# Framework-agnostic core

`@aiao/rxdb-model` is a pure logic layer with no UI framework dependency; any frontend stack can consume it. All rendering configuration and validation for UI components is derived from entity metadata by the functions here.

## Field value utilities

Parsing (raw input → typed value), formatting (typed value → display string), and structural equality:

```typescript
import { parseEntityFieldValue, formatEntityFieldValue, structuralEqual } from '@aiao/rxdb-model';

// '2026-10-09' → ISO string; 'a,b' → ['a', 'b']; invalid input returns null instead of throwing
const parsed = parseEntityFieldValue('date', '2026-10-09');

// Raw input → locale-formatted display string; arrays joined with comma and space; JSON-like values serialized as JSON strings
const shown = formatEntityFieldValue('date', parsed);

// Deep comparison that ignores key order and is safe on circular references
structuralEqual({ a: 1, b: 2 }, { b: 2, a: 1 }); // true
```

## Forms: field config, two-way conversion, and validation

```typescript
import { getEntityMetadata } from '@aiao/rxdb';
import {
  buildFormFields,
  createDefaultFormData,
  entityToFormData,
  formDataToEntityChanges,
  validateForm,
  type EntityFormData,
  type EntityInstance
} from '@aiao/rxdb-model';
import { Todo } from './entities/Todo';

const metadata = getEntityMetadata(Todo);

// Generate field lists by mode: create excludes computed fields and has no system fields;
// edit appends read-only system fields (ID / createdAt / updatedAt / createdBy / updatedBy); view makes all fields read-only
const createFields = buildFormFields(metadata, 'create');
const editFields = buildFormFields(metadata, 'edit');

// Generate form data from field defaults (the initial shape in create mode; booleans default to false, arrays to [], everything else to null)
const draft = createDefaultFormData(createFields);

// Submission validation: returns a structured result (valid + per-field error list), never throws uncaught exceptions
const result = validateForm(createFields, draft);
if (!result.valid) {
  console.error(result.errors); // [{ field, message }, …]
}

// edit: loaded entity → form data; on save, form data → entity changes, producing only the fields that actually changed
function loadForm(todo: EntityInstance): EntityFormData {
  return entityToFormData(todo, editFields);
}

async function saveForm(todo: EntityInstance, formData: EntityFormData): Promise<void> {
  Object.assign(todo, formDataToEntityChanges(todo, formData, editFields));
  await todo.save();
}
```

## Detail: tab structure

`buildDetailTabs` generates one basic form block plus one table block per one-to-many / many-to-many relation:

```typescript
import { buildDetailTabs } from '@aiao/rxdb-model';

const tabs = buildDetailTabs(metadata);
// [{ key: 'basic', type: 'form', label: 'Basic info' }, { key, type: 'table', relationName, … }, …]
```

## Tables: editable column config

`buildEditableColumns` produces columns in a fixed order: ID column → ordinary property columns (skipping `id` / `createdAt` / `updatedAt` and the audit fields `createdBy` / `updatedBy`) → computed property columns → foreign key relation columns → the `createdAt` / `updatedAt` system time columns → the action column (view + delete):

```typescript
import { actionsColumn, buildEditableColumns, deriveEntityCapabilities } from '@aiao/rxdb-model';

const { canDelete } = deriveEntityCapabilities(metadata);
const columns = buildEditableColumns(metadata, {
  relatedItemsProviderFactory(fkField, relatedEntityName) {
    // Return the candidate entity provider for the foreign key field (the dropdown data source for relation columns)
  }
});
```

Each property type maps to a suitable cell editor (boolean switch, enum dropdown, date, JSON, key-value, relation picker, and so on); read-only records degrade to no editing. Table runtime capabilities (system clipboard copy/paste, keyboard navigation, row deletion, drag reorder, batch edits merged into one write) are driven by the utilities under `entity-table/vtable`, usually through the `EntityTable` / `QueryTable` components.

> Action-column delete predicate: the third argument of `actionsColumn` is a **required** `canDelete` predicate (see [Migration notes](migration.md#action-column-delete-predicate)).

## Query builder engine

The full operation surface over a query condition tree (rules, AND/OR groups, nesting), mutually convertible with the repository query format:

```typescript
import { getEntityMetadata } from '@aiao/rxdb';
import { createQueryBuilderService, createSchemaFromEntity } from '@aiao/rxdb-model';
import { Todo } from './entities/Todo';

// Field metadata is derived from entity metadata; validation uses it to check field existence, operator and value against field type
const service = createQueryBuilderService({ fields: createSchemaFromEntity(getEntityMetadata(Todo)) });

// Add/remove rules and groups (a missing target means the root group; returns the new item id), toggle AND/OR, move items, enforce maximum nesting depth
const titleRuleId = service.addRule(null, { field: 'title', operator: 'contains', value: 'draft' });
service.addRule(null, { field: 'completed', operator: '=', value: false });
const rootGroupId = service.getState().rootGroup.id;
service.updateGroupCombinator(rootGroupId, 'or');
service.moveItem(titleRuleId, rootGroupId, 1);

// Two-way conversion with the repository query format (toRxDBQuery → repository query; fromRxDBQuery ← refill state from an existing query)
const repositoryQuery = service.toRxDBQuery();
service.fromRxDBQuery(repositoryQuery);

// Per-rule validation: missing field (fieldExists), operator/field type mismatch (operatorTypeMatch),
// value type mismatch (valueType) each produce structured errors
const result = service.validate();
if (!result.valid) {
  console.error(result.errors); // [{ field, rule, message }, …]
}
```

Use without a state container: `QueryConverter` (`toRxDBQuery(state)` / `fromRxDBQuery(query)`, where `state` is `QueryBuilderState` in `{ rootGroup }` shape), `ValidationService` (`validateRule` / `validateGroup`), `createOperatorRegistry` / `getDefaultOperatorRegistry`, `createSchemaParser`. The core models (`UIRule`, `QueryBuilderRuleGroup`, `FieldMetadata`, `ValidationResult`) and the full exports are in the [API reference](../api).

## Manual ordering entities (US-028)

Entities that declare an ordering domain are sorted by "grouping field combination + manual order"; `defaultListOrderBy` gives the entity's default ordering, `canReorderEntityList` decides whether the current list allows drag reordering, and `commitRowMove` persists a row drag-and-drop. `EntityList` has these behaviors built in — use the component directly. The engine-side manual ordering declaration and `Repository.reorder()` semantics are in [Manual ordering (manualOrder and reorder)](../model-mutation/reorder.md).

## UI capability derivation (US-027)

`deriveEntityCapabilities(metadata)` projects an entity's write permissions (create / update / delete, each `both` or `system`) to UI capabilities `{ canCreate, canEdit, canDelete }`: `EntityList` uses them to hide the "+ New" button, degrade rows to read-only (details open in view mode), or hide the delete entry in the action column. Permission declarations and runtime semantics are in [Entity operation permissions](/model-definition/permissions.md).
