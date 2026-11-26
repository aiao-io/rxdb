# React usage

`@aiao/rxdb-model-react` provides the entity list, detail, form, dialog, table, and query builder React components. Naming and behavior are functionally equivalent to the Angular / Vue sides.

## Install and integrate

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-model @aiao/rxdb-model-react
```

Components read the database through `@aiao/rxdb-react`; the app must provide the instance with `RxDBProvider` first (see [React integration](/frameworks/react.md)). Pages themselves do not need to call `useRxDB()`: it only reads the nearest Provider and performs no initialization.

## Entity list

`EntityList`: infinite-scroll editable table, inline editing, undo/redo, filter popover, cascading creation, many-to-many selection mode, column-header sorting, and row drag-and-drop for manual-order entities.

```tsx
import { EntityList } from '@aiao/rxdb-model-react';
import { useParams } from 'react-router-dom';

export default function EntityListPage(): React.JSX.Element {
  const { namespace = '', name = '' } = useParams();

  return (
    <div className="page-host bg-base-100 flex h-full flex-col">
      <EntityList name={name} namespace={namespace} />
    </div>
  );
}
```

Main props:

| prop                                            | Meaning                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `namespace` / `name`                            | Entity locator (required)                                                                                                             |
| `fixedQuery`                                    | Fixed query for the list (`{ combinator, rules }`; grouped sortable entities can only be drag-reordered once pinned to a fixed query) |
| `mode`                                          | `'default'` or `'select'` (many-to-many selection mode, with `onSelectionConfirmed`)                                                  |
| `onSelectionConfirmed` / `onSelectionCancelled` | Selection mode confirm / cancel                                                                                                       |
| `creationChain` / `editChain`                   | Cycle-prevention chain for cascading creation and relation drill-downs                                                                |

"View" on a row → the component opens the built-in edit detail dialog (relation tabs drill down the same way; `editChain` prevents cycles).

## Entity detail

`EntityDetail`: tabbed detail with a basic form plus relation tables. In create mode, when `metadata` is passed (dialog / direct input channel), a draft entity is generated in memory first and persisted only on save; with route inputs only (`namespace` + `name`) no draft is created and the save is handed to the caller through `onFormSubmitted`.

```tsx
import { EntityDetail, type EntityFormData } from '@aiao/rxdb-model-react';
import { useNavigate, useParams } from 'react-router-dom';

export default function EntityDetailPage(): React.JSX.Element {
  const { namespace = '', name = '', entityId = '' } = useParams();
  const navigate = useNavigate();

  return (
    <div className="page-host bg-base-100 flex h-full flex-col">
      <EntityDetail
        entityId={entityId}
        name={name}
        namespace={namespace}
        onFormCancelled={() => void navigate('..', { relative: 'path' })}
        onFormSubmitted={(data: EntityFormData) => void navigate('..', { relative: 'path' })}
      />
    </div>
  );
}
```

Main props: `namespace` / `name` / `entityId` (route input channel, alternative to `metadata`), `metadata` / `formFields` / `formData` / `formMode` (pass metadata and form data directly), `onFormSubmitted` / `onFormCancelled` / `onFieldChanged` / `onValidationErrors`.

Without an `RxDBProvider` in the component tree, the form runs standalone: both create and edit hand the form data to the caller through `onFormSubmitted`. With a Provider whose database has not arrived yet (including a failed async source creation), create's save is disabled, and inputs made while waiting are merged into the draft once the database arrives. While the edit target is not ready (database not arrived, loading by `entityId`, or failed to load), the form's internal actions are hidden, only "Cancel" remains under the tabs, and submission is blocked; once ready the form resets from the loaded instance, and inputs made while not ready are not kept. `fixedFormData` is merged only into create drafts and passthrough forms without an instance; in edit mode with a loaded instance, the corresponding fields are made read-only and show the instance's own values. Both points match Angular and differ from Vue (see the "Entity detail" section of the Vue page).

## Entity form

`EntityForm`: renders input controls for all field types by mode — create / edit / view, with all fields read-only in view mode.

```tsx
import {
  EntityForm,
  type EntityFormData,
  type FormFieldConfig,
  type FormValidationResult
} from '@aiao/rxdb-model-react';

function EditForm({ fields, initial }: { fields: FormFieldConfig[]; initial: EntityFormData }): React.JSX.Element {
  const [formData, setFormData] = React.useState(initial);

  return (
    <EntityForm
      data={formData}
      fields={fields}
      mode="edit"
      onFieldChanged={({ field, value }) => console.log(field, value)}
      onFormCancelled={() => setFormData(initial)}
      onFormSubmitted={(data: EntityFormData) => void save(data)}
      onValidationErrors={(result: FormValidationResult) => console.error(result.errors)}
    />
  );
}
```

Props: `fields` (`FormFieldConfig[]`, usually produced by `buildFormFields(metadata, mode)`), `data` (`EntityFormData`), `mode` (defaults to `view`), `relatedEntityProvider` (dropdown data source for relation fields), `showActions` (whether to render the save/cancel buttons, defaults to `true`), `onFieldChanged` / `onFormSubmitted` / `onFormCancelled` / `onValidationErrors`.

## Dialog shell

`EntityDialog`: draggable title bar, eight-direction resizing, fullscreen. Use it as a panel inside the app's dialog context; used standalone (no dialog context) it renders only `children` (consistent with Angular's "only the projected content renders outside a DIALOG context").

```tsx
import { EntityDialog } from '@aiao/rxdb-model-react';

<EntityDialog title="Add Todo" onCloseRequested={close}>
  <EntityForm data={formData} fields={fields} mode="create" />
</EntityDialog>;
```

## Query builder

`QueryBuilder`: AND/OR groups, rule add/remove, drag reorder, field/operator/value pickers, sub-queries, nesting depth limit. The `EntityList` filter popover embeds the query builder already — just use the list; standalone usage:

```tsx
import { QueryBuilder, type FieldMetadata, type RxDBQueryOutput, type ValidationResult } from '@aiao/rxdb-model-react';

function FilterPanel({ fields }: { fields: FieldMetadata[] }): React.JSX.Element {
  return (
    <QueryBuilder
      fields={fields}
      initialQuery={{ combinator: 'and', rules: [] }}
      onQueryChange={(query: RxDBQueryOutput<Record<string, unknown>>) => console.log(query)}
      onValidationChange={(result: ValidationResult) => console.log(result)}
    />
  );
}
```

Main props: `fields` (field list, takes precedence over `schema`), `schema` (schema information), `initialQuery` (can refill an existing query), `maxDepth` (maximum nesting depth, defaults to `5`), `height` (maximum content height, defaults to `'80vh'`), `enableDrag` / `enableCollapse`, `onQueryChange` / `onValidationChange`.

The type parameter of `RxDBQueryOutput<T>` is required: `T` is the queried entity type and constrains the `field` in rules; when no concrete entity is bound, write `Record<string, unknown>` (the component's default generic).

On mount, `onQueryChange` / `onValidationChange` each call the current value once (the loaded `initialQuery` and its validation result, or an empty query when none was passed), then again on edits.

When `SubqueryBuilder` is used alone and hidden by `<Activity>` then shown again, its internal state is torn down and rebuilt with the effect, restarting from the current `initialQuery` (an empty query when absent); edits not written back to the host before hiding are not kept. Embedded in `QueryBuilder`, it is restored from the parent component's query snapshot and is unaffected. To keep edits across hiding, write the `onQueryChange` result back to `initialQuery` as a new reference.

Theme injection: wrap the component tree with `QueryBuilderThemeProvider` to provide a custom `QueryBuilderTheme` (replacement implementations for the field picker / operator picker / value input components); the built-in `DEFAULT_QUERY_BUILDER_THEME` is used by default.
