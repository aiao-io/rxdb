# PGliteServerExtensionRequirements

Defined in: [packages/rxdb-adapter-pglite/src/pglite-server-extensions.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite-server-extensions.ts#L17)

Server extensions the adapter loads on the user's behalf.

## Properties

### btreeGist \{#btreegist\}

```ts
readonly btreeGist: boolean;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite-server-extensions.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite-server-extensions.ts#L19)

Whether to load `btree_gist` (true when any entity declares `exclusions`)
