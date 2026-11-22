# Installation and initialization

This page lists the core dependencies and the browser setup for the supported SQLite and PGlite adapters. Read [Getting Started](./README.md) first if you have not chosen an application path yet.

## Core dependencies

```bash npm2yarn
npm install @aiao/rxdb rxjs
```

## Choose an adapter

The adapter determines how the local database is executed and persisted.

### SQLite

```bash npm2yarn
npm install @aiao/rxdb-adapter-wa-sqlite
```

Place the matching `wa-sqlite` WASM asset under the public path used by your application, then configure `wasmPath` when creating `RxDBAdapterWaSqlite`.

`IDBBatchAtomicVFS` is the default browser path in the examples because it provides IndexedDB-backed persistence. OPFS VFS support is experimental and should be selected explicitly after checking its browser and deployment constraints.

### PGlite

```bash npm2yarn
npm install @aiao/rxdb-adapter-pglite
```

Use PGlite when PostgreSQL-compatible SQL and types are a better fit for the application. The adapter documentation covers its worker and persistence options.

## Framework packages

```bash npm2yarn
npm install @aiao/rxdb-angular
npm install @aiao/rxdb-react
npm install @aiao/rxdb-vue
```

Install only the binding used by the application. The core entity, query, and write semantics stay shared across the three bindings.

## Version requirements

The repository currently targets Node.js 26+, pnpm 10+, TypeScript 6, Angular 22, React 19, Vue 3.5, and RxJS 7.8. Check the [compatibility matrix](../compatibility.md) before selecting a package version.
