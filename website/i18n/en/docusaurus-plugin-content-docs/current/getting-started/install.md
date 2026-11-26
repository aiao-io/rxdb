# Installation and initialization

This page lists the core dependencies and the browser setup for the supported SQLite and PGlite adapters. Read [Getting Started](/getting-started/README.md) first if you have not chosen an application path yet.

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

The JavaScript loader and WASM binary must come from the same `wa-sqlite` build. In the app where you installed the adapter, save this as `copy-wa-sqlite.mjs` and run `node copy-wa-sqlite.mjs` from the app root. Resolving the binary through the adapter also works with pnpm’s isolated dependencies.

```javascript
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const fromAdapter = createRequire(import.meta.resolve('@aiao/rxdb-adapter-wa-sqlite'));
const wasm = fromAdapter.resolve('wa-sqlite/dist/wa-sqlite-async.wasm');
mkdirSync('public/wa-sqlite', { recursive: true });
copyFileSync(wasm, 'public/wa-sqlite/wa-sqlite-async.wasm');
```

### Serve the browser example with Vite

Place the configuration below in `vite.config.ts`. Vite serves `public/wa-sqlite/wa-sqlite-async.wasm` at `/wa-sqlite/wa-sqlite-async.wasm` when the app runs at the origin root. Use that URL for `wasmPath`. For an app deployed under a subpath, include the app’s base path in the URL.

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  optimizeDeps: { exclude: ['@aiao/rxdb-adapter-wa-sqlite'] }
});
```

Enable `experimentalDecorators` in your app’s TypeScript configuration and copy the model, initialization, and read/write examples into your browser entry point, such as `src/main.ts`. Start Vite with your app’s dev script and open the local URL it prints. The example uses `IDBBatchAtomicVFS` with asynchronous WASM on the main thread and persists data in IndexedDB. [Getting Started](/getting-started/README.md)

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

The repository currently targets Node.js 26+, pnpm 10+, TypeScript 6, Angular 22, React 19, Vue 3.5, and RxJS 7.8. Check the [compatibility matrix](/compatibility.md) before selecting a package version.
