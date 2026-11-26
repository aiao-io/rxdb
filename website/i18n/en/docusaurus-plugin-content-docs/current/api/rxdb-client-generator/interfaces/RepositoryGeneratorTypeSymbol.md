# RepositoryGeneratorTypeSymbol

Defined in: [generators/RepositoryGenerator.interface.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L50)

A top-level type name self-reported by a generator.

## Properties

### exported? \{#exported\}

```ts
readonly exported?: boolean;
```

Defined in: [generators/RepositoryGenerator.interface.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L54)

Whether it is re-exported by `index.d.ts`; in split mode the exported name occupies a scope of its own.

---

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [generators/RepositoryGenerator.interface.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-client-generator/src/generators/RepositoryGenerator.interface.ts#L52)

Type name, for example `FolderTreeRuleGroup`.
