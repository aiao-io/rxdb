# Client generator

Generates type-safe client code from your entity models — entity types, query/mutation APIs, and relation field rules — cutting boilerplate and frontend/backend drift.

## What this page covers

- Reads entity decorator definitions (`@Entity` from `@aiao/rxdb`, `@TreeEntity` from `@aiao/rxdb-plugin-tree`, `@GraphEntity` from `@aiao/rxdb-plugin-graph`)
- Generates entity types and static type mappings
- Generates `Repository` query method signatures (`get/find/findAll/findByCursor/...`)
- Generates rule types for relation fields, enabling dot-notation relation queries
- Configurable relation query depth; default 3 levels

## Install

```bash npm2yarn
npm i -D @aiao/rxdb-client-generator
```

## Usage 1: CLI

1. Create a config file `rxdb.config.ts`

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    entities: [path.join(__dirname, 'entities', '*.ts')], // glob supported
    outDir: path.join(__dirname, 'dist', 'entities'),
    relationQueryDeep: 3
  }
];
```

2. Run the generator

```bash
# node / bun / pnpm scripts all work
node node_modules/@aiao/rxdb-client-generator/dist/cli.js ./rxdb.config.ts

# or use the package CLI directly (shebang exposed)
npx @aiao/rxdb-client-generator ./rxdb.config.ts
```

Reference example: `packages/rxdb-test/rxdb.config.ts`.

## Usage 2: Vite plugin

Generate automatically after the build finishes:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { rxdbClientGeneratorVitePlugin } from '@aiao/rxdb-client-generator/vite';

export default defineConfig({
  plugins: [
    rxdbClientGeneratorVitePlugin([
      {
        entities: ['src/entities/*.ts'],
        outDir: 'src/generated/entities',
        relationQueryDeep: 3
      }
    ])
  ]
});
```

## Generated output example

```text
dist/
  entities/
    index.ts           # Aggregate exports
    Todo.ts            # Entity type, query types, relation rule types
    Menu.ts
```

## Wiring the output back into your project

```ts
// 1) Import the generated entity types
import { Todo } from './dist/entities';

// 2) Register them with RxDB
const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
});

// 3) Use the static methods directly for type-safe queries
Todo.find({
  where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] },
  orderBy: [{ field: 'createdAt', sort: 'desc' }],
  limit: 20
}).subscribe(items => console.log(items));
```

## Options

- `entities`: entity files to scan (glob supported)
- `outDir`: output directory for the generated code
- `relationQueryDeep`: expansion depth of relation query types; minimum 1 (default 3)

## Usage notes

- Generates declarations and type helpers only, from decorators and type information; no runtime code
- Make sure your entities can be imported normally (paths and build must work under ESM)
- Generated code is best committed to version control, or generated at build time

## References

- Package source: `packages/rxdb-client-generator`
- Example config: `packages/rxdb-test/rxdb.config.ts`
