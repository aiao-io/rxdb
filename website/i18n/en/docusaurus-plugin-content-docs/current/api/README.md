# API reference

Each package page starts with its README and lists the signatures of its exports. Start with the package for the task you are working on.

| Task                                                          | Package reference                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Define entities, query a repository, or look up an error code | [Core database](/api/rxdb/README.md)                                                                                                       |
| Build forms and tables from entity metadata                   | [Entity model](/api/rxdb-model/README.md)                                                                                                  |
| Connect a component to a live query                           | [Angular](/api/rxdb-angular/README.md) · [React](/api/rxdb-react/README.md) · [Vue](/api/rxdb-vue/README.md)                               |
| Store data in the browser                                     | [SQLite with wa-sqlite](/api/rxdb-adapter-wa-sqlite/README.md) · [PostgreSQL with PGlite](/api/rxdb-adapter-pglite/README.md)              |
| Set up the admin shell                                        | [Admin](/api/rxdb-admin/README.md)                                                                                                         |
| Load message catalogs and resolve a locale                    | [i18n runtime](/api/rxdb-i18n/README.md)                                                                                                   |
| Follow language changes in a component                        | [Angular i18n](/api/rxdb-i18n-angular/README.md) · [React i18n](/api/rxdb-i18n-react/README.md) · [Vue i18n](/api/rxdb-i18n-vue/README.md) |

The detailed symbol pages are English translations of the generated reference.

> **Maintenance note**: the reference under this directory is generated from the package sources by `pnpm nx api-docs website` (typedoc → flatten). The English pages are a translated snapshot of the generated Chinese docs. After an API change that adds or rewrites Chinese descriptions, re-translate the affected pages (batch lists used for the last refresh live in `website/tmp/api-en-batches.json`); unchanged pages can be copied over verbatim.

For a working example that combines a database and a framework binding, follow [Getting Started](/getting-started/README.md).
