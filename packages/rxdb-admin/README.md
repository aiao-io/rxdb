# @aiao/rxdb-admin

Framework-independent admin-shell state for Aiao RxDB. It provides preferences, themes, layouts, tabs, shortcuts, command palette state, storage helpers, widgets, and the shared i18n wiring used by the Angular, React, and Vue templates.

The package owns state and contracts. Framework packages render the shell and connect lifecycle events to their native reactive systems.

## Run a template from the workspace

```bash
pnpm nx serve rxdb-admin-template-react
```

## Create the shared runtime

```ts
import { createAdminI18n } from '@aiao/rxdb-admin';

const i18n = createAdminI18n();
```

An explicit `locale` wins over the device locale. When no explicit choice is stored, the runtime follows the host language and falls back to `zh-Hans`. The same contract is used by all three admin templates.

## Shell state

Use the exported shell, preference, layout, menu, tab, shortcut, palette, theme, and widget modules to build a custom admin surface. The state layer does not require a specific router or component library.

The `@aiao/rxdb-admin/admin.css` export contains the shared shell styles. Add it only when using the package's visual primitives.

## Framework templates

- `@aiao/rxdb-admin-angular` for Angular Signals and DI.
- `@aiao/rxdb-admin-react` for React components and hooks.
- `@aiao/rxdb-admin-vue` for Vue 3 components and composables.

The templates share application, model, backup, language, and preference behavior. Run core tests with:

```bash
pnpm nx test rxdb-admin --run
```

Read the [English admin-shell guide](https://rxdb.aiao.io/en/docs/admin-shell/) and the [Chinese mirror](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-admin/README.zh-CN.md) for template setup.
