# RxDBRepositories

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1200)

The type registry of registered facade repositories

## Remarks

The name table of the facade axis (`@Entity({ repository: 'X' })` → what `getRepository(E)` returns).
The core only ships the single `Repository` entry (registered into the runtime by the `EntityManager` constructor),
and plugin packages merge their facades in via `declare module '@aiao/rxdb'`, first-class citizens alongside the core entry
(`TreeRepository` comes from `@aiao/rxdb-plugin-tree`).

Same template and same taboo as [RxDBAdapters](RxDBAdapters.md): **never add an index signature**.
Once added, `keyof RxDBRepositories` collapses to `string` and all `declare module` blocks silently stop working.
The fact that "the name can be any string" is carried by the `(string & {})` branch of [RxDBRepositoryName](../type-aliases/RxDBRepositoryName.md).

The values are written as `typeof X` (constructor types) rather than instance types: the three facades' type parameters all have no defaults,
so instance types cannot be written out here, and what the registry wants in the first place is "which class".

## Example

```ts
declare module '@aiao/rxdb' {
  interface RxDBRepositories {
    GraphRepository: typeof GraphRepository;
  }
}
```

## Properties

### Repository \{#repository\}

```ts
Repository: typeof Repository;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1201)
