# Database adapters

Adapters connect the framework-independent RxDB model to a local or remote execution engine. Choose the adapter from the database semantics, persistence requirements, and runtime constraints of the application.

| Adapter family | Typical use |
| --- | --- |
| wa-sqlite / SQLite | Browser-local relational data, transactions, and indexes |
| PGlite | PostgreSQL-compatible local SQL and types |
| Supabase / HTTP | Remote data and synchronization boundaries |
| Electron / Tauri | Desktop host storage |
| Mini-program adapters | Experimental platform-specific runtimes |

Start with [installation and initialization](../getting-started/install.md), then read the adapter-specific guide before selecting a production VFS or worker topology.
