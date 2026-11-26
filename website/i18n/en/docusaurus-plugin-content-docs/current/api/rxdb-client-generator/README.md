# rxdb-client-generator

The RxDB client code generator, generating JavaScript entity entry points and TypeScript declarations from entity definitions.

## Features

- Generates client code as a single file or split per entity
- Generates RxDB, Repository, relation and query rule types
- Provides a CLI and a Vite plugin
- Uses a manifest to clean up only the stale outputs owned by the generator, without deleting other files in the output directory

## Installation

```bash
pnpm add -D @aiao/rxdb-client-generator
```

## CLI

```bash
rxdb-client-generator ./rxdb.config.ts
```

The config file is executed by `jiti` and can export one config or an array of configs:

```typescript
export default {
  entities: ['./src/entities/**/*.ts'],
  outDir: './src/generated',
  relationQueryDeep: 3,
  splitFiles: true
};
```

Paths are resolved relative to the config file. Multiple distinct output directories can be generated in parallel; the same physical `outDir` (including normalized paths and symlink aliases; symlinks resolve via the nearest existing parent when the directory does not exist yet) must not appear in multiple configs — the CLI reports an error at config load time and the Vite plugin at creation time. To aggregate generation, merge the `entities` patterns and keep a single output config.

Fail-closed by default: when `entities` is empty, any glob matches nothing, or no file contains entities, the old outputs are kept and an error is reported. An empty client genuinely needed requires explicitly setting `allowEmpty: true`.

The analyzer loads all entity files into a shared TypeScript Project at once; cross-file, multi-level inheritance does not depend on glob order. A parent class with entity decorators that cannot be resolved reports an error directly — no client missing the parent's fields is generated.

## Vite plugin

Single config:

```typescript
import { rxdbClientGeneratorVitePlugin } from '@aiao/rxdb-client-generator/vite';

export default {
  plugins: [
    rxdbClientGeneratorVitePlugin({
      entities: ['./src/entities/**/*.ts'],
      outDir: './src/generated'
    })
  ]
};
```

Multiple configs:

```typescript
rxdbClientGeneratorVitePlugin([
  {
    entities: ['./src/entities/**/*.ts'],
    outDir: './src/generated'
  },
  {
    entities: ['./src/admin/**/*.ts'],
    outDir: './src/generated-admin'
  }
]);
```

Production builds generate at `buildStart`, and the outputs participate in the module resolution of the current bundle. Before the dev server starts, generation runs first, followed by watching entity files for additions, changes and deletions; rebuilds run serially through a single-flight queue, trigger a full reload on success, and show the Vite error overlay on failure.

## Custom Repository generators

`GeneratorContext.file` is a purely in-memory `SourceFile`. Use `getText()` to read the generated text; committing to disk is the responsibility of the CLI/Vite builder, and `save()` / `saveSync()` throw explicitly. Of the public structures usable for declaration files, scopes, optional members and rest parameters are rendered; fields that do not apply to ambient declarations — initializers, definite assignment, async/body and decorators — fail fast instead of being silently dropped.

## Entity metadata safety boundary

Entity scanning does not execute decorator arguments. The arguments of `@Entity`, `@TreeEntity` and `@GraphEntity` must be inline objects that are statically evaluable, allowing only:

- Objects, arrays
- Strings, numbers, booleans, `null`
- `PropertyType.*`, `RelationKind.*`, `OnDeleteAction.*`
- Parentheses, `as`, `satisfies` used only for type narrowing

Local variables, function calls, arrow functions, object spread, computed property names and other dynamic expressions report an error directly; the error includes the file path, line and column. The config file is still executed by `jiti` per the existing contract.

## Output ownership

Each `outDir` gets a `.rxdb-client-generator-manifest.json`. Later generations only delete files that existed in the old manifest but are no longer generated this time; hand-written files and other tools' outputs are never cleaned up. A corrupted or out-of-bounds manifest reports an error directly instead of being silently ignored.

## Fileoverview

RxDB Client Generator
The RxDB client code generator, generating type definitions and entity class code from entity metadata

Main features:
- Generates .d.ts type definition files from EntityMetadata
- Generates the .js files of entity classes (using decorators)
- Supports both split-file (splitFiles) and single-file generation modes
- Loads extended Repository generators provided by plugin packages through `repositoryGenerators`

## Classes

| Class | Description |
| ------ | ------ |
| [RepositoryGeneratorBase](classes/RepositoryGeneratorBase.md) | Base Repository generator (abstract base class). Provides common utility methods; subclasses generate their own Repository properties and methods |
| [RepositoryMethodsGenerator](classes/RepositoryMethodsGenerator.md) | Repository generator. Generates common CRUD properties and methods for all entities: get, find, findOne, save, remove, etc. |
| [RxDBClientGenerator](classes/RxDBClientGenerator.md) | RxDB Client generator |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [EntitySourceGetter](interfaces/EntitySourceGetter.md) | Read-only getter carried from the entity source into the generation runtime and declaration files. |
| [GeneratorContext](interfaces/GeneratorContext.md) | Generator context. Contains all context information needed for generating properties and methods |
| [IRepositoryGenerator](interfaces/IRepositoryGenerator.md) | Repository generator interface |
| [RepositoryGeneratorSymbols](interfaces/RepositoryGeneratorSymbols.md) | Output symbols self-reported by the generator |
| [RepositoryGeneratorTypeSymbol](interfaces/RepositoryGeneratorTypeSymbol.md) | One top-level type name self-reported by the generator. |
| [RuleTypeData](interfaces/RuleTypeData.md) | Type description of a single query rule. |
| [RxDBClientGeneratorOptions](interfaces/RxDBClientGeneratorOptions.md) | Code shape and query type configuration of the RxDB client generator. |
| [SourceFile](interfaces/SourceFile.md) | The lightweight source file interface used by the generator. |

## Variables

| Variable | Description |
| ------ | ------ |
| [NAMESPACE\_PUBLIC](variables/NAMESPACE_PUBLIC.md) | The default namespace used by generated code. Entities without a namespace fall into this space. |
| [REPOSITORY\_TYPE\_GRAPH\_REPOSITORY](variables/REPOSITORY_TYPE_GRAPH_REPOSITORY.md) | Registration name of the graph Repository generator, for plugin extensions. |
| [REPOSITORY\_TYPE\_REPOSITORY](variables/REPOSITORY_TYPE_REPOSITORY.md) | Registration name of the built-in plain Repository generator. |
| [REPOSITORY\_TYPE\_TREE\_REPOSITORY](variables/REPOSITORY_TYPE_TREE_REPOSITORY.md) | Registration name of the tree Repository generator, for plugin extensions. |

## Functions

| Function | Description |
| ------ | ------ |
| [buildRules](functions/buildRules.md) | Renders rule data into rule type literals, registering the required named imports along the way. |
| [generateEntityRules](functions/generateEntityRules.md) | Recursively collects all query rules of an entity (including foreign keys and relation counterparts). |
