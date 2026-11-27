# RxDBRepositories

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1200)

Type registry of registered facade repositories.

## Remarks

The name table of the facade axis (`@Entity({ repository: 'X' })` → what `getRepository(E)` returns).
The core only ships one entry, `Repository` (registered at runtime by the `EntityManager`'s constructor);
plugin packages merge their own facades in via `declare module '@aiao/rxdb'`, first-class citizens alongside
the core's entry (`TreeRepository` comes from `@aiao/rxdb-plugin-tree`).

Same template as [RxDBAdapters](RxDBAdapters.md), same taboo: **never add an index signature**.
Once added, `keyof RxDBRepositories` collapses to `string`, and every `declare module` silently stops working.
The "name may be any string" concern is carried by the `(string & {})` branch of
[RxDBRepositoryName](../type-aliases/RxDBRepositoryName.md).

Values are written as `typeof X` (constructor type) rather than instance type: the type parameters of the
three facades all lack defaults, so the instance type cannot be written out here — and what the registry
wants in the first place is "which class".

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
