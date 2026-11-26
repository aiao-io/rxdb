# Entity model UI and headless state

`@aiao/rxdb-model` is a metadata-driven UI toolchain. Define entity metadata once, then derive form fields, detail layouts, editable table columns, and query conditions.

## Package structure

| Package                    | Role                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| `@aiao/rxdb-model`         | Framework-independent value, form, detail, table, and query helpers |
| `@aiao/rxdb-model-angular` | Angular components and Signals integration                          |
| `@aiao/rxdb-model-react`   | React components and Hooks integration                              |
| `@aiao/rxdb-model-vue`     | Vue 3 components and Composables integration                        |

Headless consumers can use the framework-independent state and actions and render their own UI.

## Why metadata matters

The metadata is the boundary shared by the three framework packages. Field types, relationships, display names, validation, and formatting stay consistent while the presentation layer remains native to each framework.

Continue with [the core entity model guide](/entity-model/core.md), [framework bindings](/entity-model/angular.md), or the [headless API](/entity-model/headless.md).
