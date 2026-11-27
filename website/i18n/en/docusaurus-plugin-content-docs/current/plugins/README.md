# Plugins

Start with the capability your application needs. For plugins installed with `rxdb.use()`, register the plugin before the database is first initialized or connected. Each guide lists the required entities and adapter support.

| Capability             | What it adds                                                    | Detailed guide (Chinese)                                    |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| History                | Change history, undo, redo, and branches                        | [History](/plugins/rxdb-plugin-history/README.md)           |
| Sync                   | Push and pull changes between local and remote stores           | [Sync](/plugins/rxdb-plugin-sync/README.md)                 |
| Query cache            | Local caching and offline reads for remote queries              | [Query cache](/plugins/rxdb-plugin-querycache/README.md)    |
| Full-text search       | SQLite FTS5 or PostgreSQL text search, depending on the adapter | [Search](/plugins/rxdb-plugin-search/README.md)             |
| Working tree           | Isolate edits, compare changes, and merge them                  | [Working tree](/plugins/rxdb-plugin-working-tree/README.md) |
| Replay                 | Record and replay application sessions                          | [Replay](/plugins/rxdb-plugin-replay/README.md)             |
| Tree                   | Model hierarchies and query ancestors or descendants            | [Tree](/plugins/rxdb-plugin-tree/README.md)                 |
| Graph                  | Model edges and query neighbors and paths                       | [Graph](/plugins/rxdb-plugin-graph/README.md)               |
| Workspace              | Recover drafts of new entities after a page reload              | [Workspace](/plugins/rxdb-plugin-workspace/README.md)       |
| File storage           | Store and query file metadata                                   | [Storage](/plugins/rxdb-plugin-storage/README.md)           |
| Task board             | Use board services and views in Angular, React, or Vue          | [Board](/plugins/rxdb-plugin-board/README.md)               |
| Peer-to-peer transfers | Transfer files in chunks between authenticated devices          | [P2P](/plugins/rxdb-plugin-p2p/README.md)                   |

To build a plugin, start with its registration, lifecycle, and framework contracts. See [Plugin authoring](/plugins/authoring.md).

For message catalogs, date and number formatting, and language preferences, use the standalone i18n runtime. See [Client internationalization](/i18n/README.md).
