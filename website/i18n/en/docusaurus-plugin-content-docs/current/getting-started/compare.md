# Differences from rxdb.info

The [`rxdb`](https://rxdb.info) package on npm is a mature NoSQL document database and has **no relation** to this project (`@aiao/rxdb` and the other `@aiao/*` packages): no fork, no plugin, no shared code or protocol. The two projects share a similar name but solve different problems with different trade-offs. Review this table before choosing one.

| Dimension | `rxdb` (rxdb.info) | `@aiao/rxdb` (this project) |
| --- | --- | --- |
| Data model | JSON documents + JSON Schema, collections | TypeScript decorator entities (`@Entity` / `@TreeEntity` / `@GraphEntity`); relations and indexes live in the declarations |
| Storage engine | Pluggable storage (IndexedDB / Dexie / SQLite / in-memory, among others) | Relational engines: in-browser SQLite (wa-sqlite / sqlite-wasm / sqliteai) or PostgreSQL (PGlite), and Electron `node:sqlite` / Tauri `rusqlite` on desktop |
| Queries | Mango-style document queries | Type-safe `RuleGroup` conditions with sorting / pagination / cursors that compile to real SQL; tree and graph queries built in |
| Relations | Document references, manual `population` | 1:1 / 1:N / N:1 / M:N with automatic join tables; cascading queries and mutations |
| Reactivity | RxJS Observables | RxJS Observables → Angular Signals / React Hooks / Vue Composables; symmetric APIs across the three frameworks |
| Synchronization | Built-in replication protocol + several remote plugins | Adapter layer: Supabase, HTTP (remote server as the source of truth + local row cache), custom remote adapters |
| Versioning and collaboration | No built-in version graph | Git-style branches / merges / undo-redo; the working tree and commit history are provided by the [Working tree](/plugins/rxdb-plugin-working-tree/README.md) plugin `@aiao/rxdb-plugin-working-tree` (including `commit` / `diff` / `restore`, and `switchBranch` with `requireClean` / `expectedActivationRevision` preconditions) |
| Encryption | Encryption plugin | Field-level AES-GCM-256 built into the SQLite / PGlite adapters |
| License and commercialization | Open-source core, some plugins are paid | Fully MIT |
| Maturity | Years of production use | 0.x, the API is not frozen yet; see [Versioning](/versioning.md) |

The linked working-tree plugin guide and the version policy page are not translated yet and remain in Chinese.

## Which one to use

- Your data is naturally document-shaped and you want ready-made multi-device replication and a large ecosystem → use `rxdb`.
- You want a **relational** model (foreign keys, join tables, transactions, SQL-level indexes) in the browser or on desktop, driven by one TypeScript declaration for the schema, types, queries, and the three-framework UI → use `@aiao/rxdb`.

> The description of rxdb.info comes from its public documentation and may change with its versions; their official site is authoritative.
