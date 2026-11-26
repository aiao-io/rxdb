# Headless entity capabilities

The headless entry points provide state, actions, and events without creating DOM, and without pulling in Tailwind, daisyUI, or VTable. Consumers own field controls, layout, styling, keyboard, and focus semantics. The default component entry points keep working; this story is still being implemented, and the default QueryBuilder, list, and detail have not all migrated to the new controllers yet.

## Framework-agnostic form state

Import `createEntityFormController` from `@aiao/rxdb-model/headless`. Use this subpath when you need to isolate display dependencies; the root entry also exports the default table facilities.

```ts
import { createEntityFormController } from '@aiao/rxdb-model/headless';

const form = createEntityFormController({ fields, data: { title: 'Initial value', count: 0 }, mode: 'edit' });
const stop = form.subscribe((snapshot, event) => {
  render(snapshot);
  log(event);
});

form.setField('title', inputValue);
const result = form.submit();
if (result.valid) await save(result.data, result.changes);
form.cancel();
stop();
form.dispose();
```

`snapshot` provides `fieldStates`, `fields`, `data`, `initialData`, `errors`, `valid`, `dirty`, `mode`, and `readonly`. `fieldStates` contains each field's config, value, display text, errors, and read-only state. The structured form value in the snapshot is isolated from internal state.

`setField` parses strictly first; on failure it keeps the most recent valid value and exposes the field error, which stays until a valid value is entered for that field, `cancel()`, or a host reset — during that time both `validate()` and `submit()` refuse. On failure, the returned `result` and the concurrently emitted `validationErrors` event contain only this input's parse errors (consistent with the default form's `validationErrors` output); read the form's full errors from `snapshot.errors`, and the full result from the `validationChanged` event emitted by `validate()`. If a control echoes the most recent valid value after a parse failure (e.g. a controlled input bound to `snapshot.data`), call `discardInput(field)` to drop this input so submission validates against the most recent valid value; the default form keeps its original submission semantics this way. `setData` / `setEntity` set the host input as the new baseline and clear old errors; `cancel` restores the most recent baseline. `view` mode blocks editing and submission. Consumers release the core instance with `dispose()`.

## React

```tsx
import { useEntityForm } from '@aiao/rxdb-model-react/headless';

function Form({ fields, data }: Props): React.JSX.Element {
  const { controller, snapshot } = useEntityForm({ fields, data, mode: 'edit' });
  return (
    <input
      value={String(snapshot.data.title ?? '')}
      onChange={event => controller.setField('title', event.target.value)}
    />
  );
}
```

Each `use*` hook returns `{ controller, snapshot }`; subscriptions are set up and torn down with the effect, and the external snapshot cache keeps the stable references React needs. The controller lives in component state; the hooks do not call `dispose()`: StrictMode replays, `<Activity>` hiding, and Fast Refresh all tear down and rebuild effects while keeping state, indistinguishable from a real unmount. After being shown again, the same controller's drafts and actions keep working; after unmount the controller is collected with the component, in-flight list queries are not aborted, and late results only write into the detached controller. Field, mode, and relation candidate updates to forms and details keep local drafts; only `data` / `entity` with actual content changes reset the inputs.

## Angular

```ts
import { signal } from '@angular/core';
import { injectEntityForm, injectEntityList } from '@aiao/rxdb-model-angular/headless';

const source = signal({ fields, data, mode: 'edit' as const });
const form = injectEntityForm(source);
const list = injectEntityList(() => ({ query: activeQuery(), load }));
const title = form.snapshot().data['title'];
```

Call `injectEntityForm`, `injectQueryBuilder`, `injectEntityList`, `injectEntityDetail`, `injectEntityDialog`, or `injectQueryTable` in an injection context. The input can be a plain object, a signal, or a getter returning options; pass a signal/getter when it must follow signal updates. The returned `snapshot()` is a read-only signal, cleaned up automatically when the `DestroyRef` is destroyed. Form/detail inputs compare by content; other configuration updates do not overwrite unsubmitted drafts.

## Vue

```ts
import { reactive } from 'vue';
import { useEntityForm } from '@aiao/rxdb-model-vue/headless';

const options = reactive({ fields, data, mode: 'edit' as const });
const form = useEntityForm(options);
const title = form.snapshot.value.data['title'];
```

Vue's `use*` composables of the same names return `{ controller, snapshot }`, where `snapshot` is a ref. Pass reactive options to follow input changes; subscriptions and the controller are cleaned up on component unmount.

## Query, list, and detail actions

`createQueryBuilderController` reuses the existing `QueryBuilderService`'s grouping, rules, validation, and query conversion. `setFields` updates field metadata; rule operations go through `addRule`, `addGroup`, `updateRule`, `updateGroupCombinator`, `moveItem`, `remove`, and `clear`.

The list and QueryTable `load` receives `{ query, sorts, page, pageSize, signal }` and returns `{ records, total? }`. `setQuery`, `setSorts`, and `setPage` invalidate the old query and clear the old page, doing nothing when the values equal the current ones; call `refresh()` to run the current request. Refreshing the same page keeps the existing records; failures surface through `snapshot.error`. Stale results are never written back; data sources should pass `signal` into their own cancellable requests.

The three framework bindings treat `query`, `sorts`, `page`, `pageSize`, `records`, and `capabilities` as inputs the host can update; through `syncInput()` they forward only the items that actually changed since the last input, applying them in the order query, sorts, paging, records, capabilities: new page records passed in the same batch are not wiped by a subsequent page turn, and re-passing equal inputs does not abort in-flight queries. The controller keeps copies of the query, sorts, and capabilities, so hosts that mutate these objects in place are still recognized when syncing. `load` and the write callbacks are read only at creation.

`create`, `update`, and `remove` use the consumer-provided write callbacks and the `capabilities` passed in. Updates to the same entity run in call order; with a data source, a successful write re-queries. Without a data source, `create` on the first page with no query and no sorts matches the default list's newest-first order: the new record goes first and the page size is kept, with the oldest record pushed off this page removed along with its selection; with a query, sorts, or when not on the first page, the current page is cleared and the host refills the data. Starting a write aborts in-flight queries, and the public `loading` returns to false right after; a failed write only reports through a rejected Promise — it does not write into `snapshot.error` and does not auto re-query; consumers call `setError()` or `refresh()` when needed. Batch `remove` can partially succeed: succeeded items are removed from the current records and selection first, failure reasons are thrown as `AggregateError.errors`, and consumers should inform the user from the actual result and decide whether to refresh. The current headless controllers are not yet wired to the default list's undo/redo and manual ordering actions.

Detail `save(onSave)` only hands a valid draft to the persistence callback; instance creation and relation assembly are the consumer's job. Repeated saves are refused; when inputs switch, editing continues, or the session is cancelled or closed during a save, a late success does not overwrite the new draft or re-close the new session, and a late failure only rejects the original Promise without writing into the new session's `snapshot.error`. A save failure in the current session surfaces through the rejected Promise and `snapshot.error`. `cancel()` resets the draft, `close()` closes the state; your own dialogs should wire both actions plus result handling. The dialog's `setData` compares by content and does not emit `dataChanged` when the data is structurally equal to the most recent one: hosts that rebuild equal-content `data` on every render (e.g. inline objects in React) do not cause re-render loops. Functions in the data compare by reference and must keep stable references.

## Integrating into a real app

Each of the three demo apps has a sample page `/headless` driven only through the headless entry points (`pages/headless/` under `apps/dev-rxdb-{angular,react,vue}/`): the DOM, controls, and styles of the form, filter, list, detail, and dialogs all belong to the page; no default components render. `apps/dev-rxdb-*-e2e/src/headless-entity.spec.ts` is the same test suite on all three sides, run against the production builds. Points to watch when integrating:

### Query builder fields, operators, and input types

Fields, operators, and input types all come from `/headless`; there is no need to import the root entry for them:

```ts
import { createSchemaFromEntity, getDefaultOperatorRegistry, getInputType, modelText } from '@aiao/rxdb-model/headless';

const fields = createSchemaFromEntity(getEntityMetadata(Article), {
  fieldFilter: field => ['title', 'viewCount'].includes(field.name)
});
const operators = getDefaultOperatorRegistry().getForField(fields[0]);
const kind = getInputType(field.type, rule.operator, field.enum); // 'string' | 'number' | 'enum' | 'none' …
```

A rule's `value` is recorded exactly as the control passes it; for numeric fields convert the input text to a number before writing. Capability constraints also come from here via `deriveEntityCapabilities(metadata, { readOnly })`, passed to the list's `capabilities`.

### The create form's baseline

The default components create a draft with `entityManager.instantiate(Entity)` first, keeping the defaults from the entity constructor. The controller's default baseline `createDefaultFormData` sets unfilled fields to `null`, and building an entity from the whole `data` would overwrite those defaults; columns that have a default and are NOT NULL (e.g. `Article.viewCount` in the sample) then fail to write. Use an instantiated draft as the baseline when creating:

```ts
const blank = entityToFormData(rxdb.entityManager.instantiate(Article), fields);
const form = createEntityFormController({ fields, data: blank, mode: 'create' });
```

Alternatively, persist only the `changes` returned by `submit()`: untouched fields are not in it.

### Internationalization

The controllers do not read the app's translation runtime automatically: the form, detail, and query builder `i18n` option defaults to built-in Chinese. Pass the app's runtime in (each framework's `useI18nRuntime()` from `@aiao/rxdb-i18n-{react,vue,angular}`) so validation copy follows the app language; display text for built-in operators is translated with `modelText(operator.labelKey, undefined, i18n)`. The published catalogs carry only Chinese; to display English, register the English catalog in the app's runtime — both catalogs come from `/headless`:

```ts
import { modelEnMessages, modelMessages } from '@aiao/rxdb-model/headless';

const catalogs = [...modelMessages, { locale: 'en', namespace: 'rxdb-model', messages: modelEnMessages }];
```

When the runtime has `changes$` (the app's `I18n` does), the controllers rebuild already-displayed validation copy in the new language after a language or catalog change — no need to trigger it yourself: the form and query builder re-emit `validationChanged` (the detail forwards through `formChanged`), while data, inputs, and query output stay the same; with no errors to refresh, nothing is rebuilt or notified. Revalidation does not touch drafts, so an in-flight detail save is unaffected. Subscriptions hold only weak references to the controller: when the host does not call `dispose()` (like the React binding, collected with the component after unmount), the subscriptions clean up once the controller is collected.

Display names in field config are yours to build (e.g. the system field names of `buildFormFields(metadata, mode, i18n)`); rebuild them with `setFields` after a language change. `setFields` emits a `reset`, but keeps unresolved parse failures on same-type fields; controls that store input text themselves must not unconditionally clear fields that still have parse errors on `reset`.

### When the list fetches

The list controller does not fetch by itself: query, sort, and paging changes only clear the old page, after which you call `refresh()`. The `sorts` in the snapshot is a new array on every publish and cannot be used directly as a dependency; trigger with a serialized request key:

```ts
const key = JSON.stringify([snapshot.query, snapshot.sorts, snapshot.page, snapshot.pageSize]);
useEffect(() => {
  void controller.refresh().catch(() => undefined); // Failures are already written into snapshot.error
}, [controller, key]);
```

### Per-framework notes

- **Angular**: signal inputs are only readable after component instantiation, while `injectEntity*` reads its options immediately in the injection context. When options depend on inputs, create with placeholder options first, then write the real options from an effect (the default form components do the same).
- **All three frameworks**: the detail's `tabs` and `activeTab` are read only at creation; bindings do not sync later changes. When tabs vary by mode, keep `tabs` unchanged and hide unneeded tabs in your own template.
- **Vue**: the `controller` returned by `useEntity*` must not go into `reactive` / `ref` — ES private fields raise `Cannot read private member`. Use the return value directly.
- **Focus in your own dialogs**: `<dialog>.showModal()` provides focus containment, but the browser does not return focus to the opening element when the dialog unmounts; record `document.activeElement` before opening and call `focus()` yourself on close.

## Dependency and interaction responsibilities

The `/headless` entries of the four public packages are independent build entry points; VTable is an optional peer. Rendering the default `EntityTable` / `QueryTable` or using VTable column utilities still requires installing the table peer. `pnpm verify:headless-consumer` checks the built artifact entries and rejects runtime imports of VTable; when any of the four model packages or that script changes, the CI extras job runs it as well. It reuses the workspace's third-party dependencies and cannot replace the still-pending out-of-repo tarball install and full three-framework UI samples.

Consumers must wire native labels or `aria-label`, `aria-describedby` from inputs to errors, read-only/disabled states, submit/cancel keyboard behavior, and — for custom dialogs — initial focus, focus containment, and focus restore on close. See [Styling](styling.md) for the default components' style wiring.

## Incremental migration

Start with one form using custom controls, connecting event handling to the shared controller; after confirming labels, error associations, keyboard, and focus behavior, extend to query, list, and detail. Default components and headless consumers can coexist on the same page. Default display reuse, list history/manual ordering, and the standalone consumer closed loop are still accepted under US-403; do not claim them all complete based on the current API.
