# Angular usage

`@aiao/rxdb-model-angular` provides the entity list, detail, form, dialog, table, and query builder components as Angular components (standalone, signal inputs / outputs). Components locate entity metadata by `namespace` + `name`; queries and writes go through the entity class's Repository path.

## Install and integrate

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-model @aiao/rxdb-model-angular
```

Components read `RxDB` through dependency injection; the app must provide the instance with `provideRxDB` first (see [Angular integration](/frameworks/angular.md)). `provideRxDB` resolves the database during app initialization, so pages themselves do not need to inject `RxDB`.

## Entity list

`EntityListComponent` (selector `rxdb-entity-list`): infinite-scroll editable table, inline editing, undo/redo, filter popover, cascading creation, many-to-many selection mode, column-header sorting, and row drag-and-drop for manual-order entities.

```typescript
import { EntityListComponent } from '@aiao/rxdb-model-angular';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-entity-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityListComponent],
  template: ` <rxdb-entity-list
    class="block h-full"
    [fixedQuery]="fixedQuery()"
    [name]="name()"
    [namespace]="namespace()"
  />`,
  host: { class: 'page-host flex h-full flex-col bg-base-100' }
})
export default class EntityListPage {
  /** Route params :namespace / :name (bound automatically by withComponentInputBinding) */
  readonly namespace = input.required<string>();
  readonly name = input.required<string>();
  /** Optional fixed query (grouped sortable entities can only be drag-reordered after the list is pinned to a fixed query) */
  readonly fixedQuery = input<{ combinator: 'and' | 'or'; rules: unknown[] } | undefined>(undefined);
}
```

Main inputs:

| Input                         | Meaning                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| `namespace` / `name`          | Entity locator (required)                                              |
| `fixedQuery`                  | Fixed query for the list (the JSON shape of `{ combinator, rules }`)   |
| `initialFilter`               | Refills the filter from an existing query                              |
| `mode`                        | `'default'` (default) or `'select'` (many-to-many selection mode)      |
| `creationChain` / `editChain` | Cycle-prevention chain for cascading creation and relation drill-downs |

"View" on a row → the component opens the built-in edit detail dialog (relation tabs drill down the same way; `editChain` prevents cycles).

## Entity detail

`EntityDetailComponent` (selector `rxdb-entity-detail`): tabbed detail with a basic form plus relation tables. In create mode, when `metadata` is passed (via the DIALOG_DATA / direct input channel), a draft entity is generated in memory first and persisted only on save; with route inputs only (`namespace` + `name`) no draft is created and the save is handed to the caller through `(formSubmitted)`.

```typescript
import { EntityDetailComponent, type EntityFormData } from '@aiao/rxdb-model-angular';

@Component({
  selector: 'app-entity-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityDetailComponent],
  template: ` <rxdb-entity-detail
    class="block h-full"
    [entityId]="entityId()"
    [name]="name()"
    [namespace]="namespace()"
    (formCancelled)="onCancelled()"
    (formSubmitted)="onSaved($event)"
  />`
})
export default class EntityDetailPage {
  readonly namespace = input.required<string>();
  readonly name = input.required<string>();
  readonly entityId = input.required<string>();

  onSaved(data: EntityFormData): void {
    // Saving happens inside the component (instance path in edit mode); here only navigate after saving
  }

  onCancelled(): void {
    // Navigation after cancel
  }
}
```

Main inputs / outputs:

| Input / output                                      | Meaning                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `namespace` / `name` / `entityId`                   | Route input channel (alternative to `metadata`)                                   |
| `metadata` / `formFields` / `formData` / `formMode` | Pass metadata and form data directly (Dialog / metadata input channel)            |
| `fixedFormData` / `delegateSave`                    | Cascading creation: prefill foreign key data, delegate saving to the parent chain |
| `(formSubmitted)` / `(formCancelled)`               | Save / cancel                                                                     |
| `(fieldChanged)` / `(validationErrors)`             | Field change and validation failure events                                        |

While the edit target is not ready (loading by `entityId` or failed to load), the form's internal actions are hidden, only "Cancel" remains under the tabs, and submission is blocked; once ready the form resets from the loaded instance, and inputs made while not ready are not kept. `fixedFormData` is merged only into create drafts and passthrough forms without an instance; in edit mode with a loaded instance, the corresponding fields are made read-only and show the instance's own values. Both points match React and differ from Vue (see the "Entity detail" section of the Vue page).

## Entity form

`EntityFormComponent` (selector `rxdb-entity-form`): renders input controls for all field types by mode — create / edit / view, with all fields read-only in view mode.

```html
<rxdb-entity-form
  (fieldChanged)="onFieldChanged($event)"
  (formCancelled)="onFormCancelled()"
  (formSubmitted)="onFormSubmitted($event)"
  (validationErrors)="onValidationErrors($event)"
  [data]="data()"
  [fields]="fields()"
  [mode]="'edit'"
/>
```

Inputs: `fields` (`FormFieldConfig[]`, usually produced by `buildFormFields(metadata, mode)`), `data` (`EntityFormData`), `mode` (defaults to `view`), `showActions` (whether to render the save/cancel buttons, defaults to `true`), `relatedEntityProvider` (dropdown data source for relation fields).

## Query builder

`QueryBuilderComponent` (selector `rxdb-query-builder`): AND/OR groups, rule add/remove, drag reorder, field/operator/value pickers, sub-queries, nesting depth limit. The `EntityList` filter popover embeds the query builder already — just use the list; standalone usage:

```html
<rxdb-query-builder
  (queryChange)="onQueryChange($event)"
  (validationChange)="onValidationChange($event)"
  [fields]="fields()"
  [initialQuery]="initialQuery()"
  [maxDepth]="5"
/>
```

On mount, `(queryChange)` / `(validationChange)` each emit the current value once (the loaded `initialQuery` and its validation result, or an empty query when none was passed), then again on edits.

Theme injection: `provideQueryBuilderTheme(theme)` provides a custom `QueryBuilderTheme` at any level of the component tree (replacement implementations for the field picker / operator picker / value input components); the built-in `DEFAULT_QUERY_BUILDER_THEME` is used by default.
