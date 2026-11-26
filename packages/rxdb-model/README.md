# @aiao/rxdb-model

Framework-independent entity-model utilities for Aiao RxDB. The package derives form fields, detail layouts, editable table columns, validation, formatting, and query-builder state from `EntityMetadata`.

It has no Angular, React, or Vue runtime dependency. Use the framework bindings in `@aiao/rxdb-model-angular`, `@aiao/rxdb-model-react`, or `@aiao/rxdb-model-vue` when you need ready-made components.

## Run the workspace example

The model on this branch uses the workspace i18n package. From the repository root, install the locked dependencies and start a demo to see the generated entity UI.

```sh
pnpm install
pnpm nx serve dev-rxdb-react
```

For Angular or Vue, use `dev-rxdb-angular` or `dev-rxdb-vue`. For an application using a published release, follow the dependencies declared by that release of `@aiao/rxdb-model`.

The default table entry also uses `@visactor/vtable` and `@visactor/vtable-editors`. Use `@aiao/rxdb-model/headless` when you only need state and actions without VTable.

## Build UI state from metadata

```ts
import { buildDetailTabs, buildEditableColumns, buildFormFields } from '@aiao/rxdb-model';

const fields = buildFormFields(metadata, 'create');
const columns = buildEditableColumns(metadata);
const tabs = buildDetailTabs(metadata);
```

The headless entry exposes controllers such as `createEntityFormController`, query-builder services, list state, detail state, and QueryTable state. The controller snapshot and actions can be rendered by any UI layer.

```ts
import { createQueryBuilderService, createSchemaFromEntity } from '@aiao/rxdb-model';

const queryBuilder = createQueryBuilderService({ fields: createSchemaFromEntity(metadata) });
queryBuilder.addRule(null, { field: 'title', operator: 'contains', value: 'draft' });
const query = queryBuilder.toRxDBQuery();
```

## Internationalization

Register the bundled catalogs with `@aiao/rxdb-i18n` when the model UI should follow the application locale.

```ts
import { I18n } from '@aiao/rxdb-i18n';
import { modelEnMessages, modelMessages } from '@aiao/rxdb-model';

const i18n = new I18n({
  defaultLocale: 'zh-Hans',
  deviceLocale: navigator.language,
  catalogs: [...modelMessages, { locale: 'en', namespace: 'rxdb-model', messages: modelEnMessages }]
});
```

`buildFormFields`, `buildDetailTabs`, and table helpers accept the runtime where their formatting or message behavior needs to track the current locale.

## Framework parity

Angular, React, and Vue bindings share the same metadata, query, validation, and mutation semantics. Framework-specific code is limited to rendering and reactive subscription lifecycles.

Run package tests with:

```bash
pnpm nx test rxdb-model --run
```

Read the [English entity model guide](https://rxdb.aiao.io/en/docs/entity-model/) and the [Chinese mirror](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-model/README.zh-CN.md) for the full API examples.
