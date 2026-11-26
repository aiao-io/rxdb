# Vue usage

`@aiao/rxdb-model-vue` provides the entity list, detail, form, dialog, table, and query builder Vue 3 components. Naming and behavior are functionally equivalent to the Angular / React sides.

## Install and integrate

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-model @aiao/rxdb-model-vue
```

Components read the database through `@aiao/rxdb-vue`; an ancestor component must provide the instance with `provideRxDB()` first (see [Vue integration](/frameworks/vue.md)). Pages themselves do not need to call `injectRxDB()`: it only reads the injected instance and performs no initialization.

## Entity list

`EntityList`: infinite-scroll editable table, inline editing, undo/redo, filter popover, cascading creation, many-to-many selection mode, column-header sorting, and row drag-and-drop for manual-order entities.

```vue
<script lang="ts" setup>
import { EntityList } from '@aiao/rxdb-model-vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

/** Route params :namespace / :name */
const route = useRoute();
const namespace = computed(() => String(route.params.namespace ?? ''));
const name = computed(() => String(route.params.name ?? ''));
</script>

<template>
  <div class="page-host bg-base-100 flex h-full flex-col">
    <EntityList class="block h-full" :name="name" :namespace="namespace" />
  </div>
</template>
```

Main props: `namespace` / `name` (entity locator, required), `fixed-query` (fixed query for the list; grouped sortable entities can only be drag-reordered once pinned to a fixed query), `mode` (`'default'` or `'select'` many-to-many selection mode), `creation-chain` / `edit-chain` (cycle-prevention chain for cascading creation and relation drill-downs).

"View" on a row → the component opens the built-in edit detail dialog (relation tabs drill down the same way; `editChain` prevents cycles).

## Entity detail

`EntityDetail`: tabbed detail with a basic form plus relation tables. In create mode, when `metadata` is passed (dialog / direct input channel), a draft entity is generated in memory first and persisted only on save; with route inputs only (`namespace` + `name`) no draft is created and the save is handed to the caller through the `formSubmitted` event.

```vue
<script lang="ts" setup>
import { EntityDetail, type EntityFormData } from '@aiao/rxdb-model-vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const namespace = computed(() => String(route.params.namespace ?? ''));
const name = computed(() => String(route.params.name ?? ''));
const entityId = computed(() => String(route.params.entityId ?? ''));

function onSaved(data: EntityFormData): void {
  // Saving happens inside the component (instance path in edit mode); here only navigate after saving
  void router.push({ name: 'entity-list', params: { namespace: namespace.value, name: name.value } });
}
</script>

<template>
  <div class="page-host bg-base-100 flex h-full flex-col">
    <EntityDetail
      class="block h-full"
      :entity-id="entityId"
      :name="name"
      :namespace="namespace"
      @form-cancelled="router.back()"
      @form-submitted="onSaved"
    />
  </div>
</template>
```

Main props: `namespace` / `name` / `entity-id` (route input channel, alternative to `metadata`), `metadata` / `form-fields` / `form-data` / `form-mode` (pass metadata and form data directly); events `form-submitted` / `form-cancelled` / `field-changed` / `validation-errors`.

While the edit target is loading (database or instance not ready), the form's internal actions are hidden, only "Cancel" remains, and submission is blocked — but input is allowed: input is staged, merged into the loaded instance data once ready, and persisted with the next submission (discarded on cancel or when switching edit targets). In edit mode `fixedFormData` is overlaid on the instance data for display (the corresponding fields are read-only; saving does not rewrite the instance's original values). These two points are the framework differences from Angular / React: on those sides, inputs made while not ready are not kept, and `fixedFormData` is merged only into create drafts and passthrough forms without an instance.

## Entity form

`EntityForm`: renders input controls for all field types by mode — create / edit / view, with all fields read-only in view mode.

```vue
<script lang="ts" setup>
import { EntityForm, type EntityFormData, type FormFieldConfig } from '@aiao/rxdb-model-vue';
import { ref } from 'vue';

const fields = ref<FormFieldConfig[]>([]); // Usually produced by buildFormFields(metadata, mode)
const formData = ref<EntityFormData>({});
</script>

<template>
  <EntityForm
    :data="formData"
    :fields="fields"
    @field-changed="({ field, value }) => console.log(field, value)"
    @form-submitted="data => void save(data)"
    mode="edit"
  />
</template>
```

Props: `fields` (`FormFieldConfig[]`), `data` (`EntityFormData`), `mode` (defaults to `view`), `related-entity-provider` (dropdown data source for relation fields), `show-actions` (whether to render the save/cancel buttons, defaults to `true`); events `field-changed` / `form-submitted` / `form-cancelled` / `validation-errors`.

## Dialog shell

`EntityDialog`: draggable title bar, eight-direction resizing, fullscreen. Use it as a panel inside the app's dialog context; used standalone (no dialog context) it renders only the slot content (consistent with Angular's "only the projected content renders outside a DIALOG context").

```vue
<template>
  <EntityDialog @close-requested="close" title="Add Todo">
    <EntityForm :data="formData" :fields="fields" mode="create" />
  </EntityDialog>
</template>
```

## Query builder

`QueryBuilder`: AND/OR groups, rule add/remove, drag reorder, field/operator/value pickers, sub-queries, nesting depth limit. The `EntityList` filter popover embeds the query builder already — just use the list; standalone usage:

```vue
<script lang="ts" setup>
import { QueryBuilder, type FieldMetadata, type RxDBQueryOutput, type ValidationResult } from '@aiao/rxdb-model-vue';
import { ref } from 'vue';

const fields = ref<FieldMetadata[]>([]);
const initialQuery = ref({ combinator: 'and' as const, rules: [] });

function onQueryChange(query: RxDBQueryOutput<Record<string, unknown>>): void {
  console.log(query);
}

function onValidationChange(result: ValidationResult): void {
  console.log(result);
}
</script>

<template>
  <QueryBuilder
    :fields="fields"
    :initial-query="initialQuery"
    :max-depth="5"
    @query-change="onQueryChange"
    @validation-change="onValidationChange"
  />
</template>
```

Main props: `fields` (field list, takes precedence over `schema`), `schema` (schema information), `initial-query` (can refill an existing query), `max-depth` (maximum nesting depth, defaults to `5`), `height` (maximum content height, defaults to `'80vh'`), `enable-drag` / `enable-collapse`; events `query-change` / `validation-change`.

The type parameter of `RxDBQueryOutput<T>` is required: `T` is the queried entity type and constrains the `field` in rules; the Vue component's events always emit as `Record<string, unknown>`.

On mount, `queryChange` / `validationChange` each emit the current value once (the loaded `initialQuery` and its validation result, or an empty query when none was passed), then again on edits.

Theme injection: `provideQueryBuilderTheme(theme)` provides a custom `QueryBuilderTheme` (replacement implementations for the field picker / operator picker / value input components); the built-in `DEFAULT_QUERY_BUILDER_THEME` is used by default.
