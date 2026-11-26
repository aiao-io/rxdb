# FtsField

Defined in: [packages/rxdb-adapter-sqlite-core/src/fts5/types.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/fts5/types.ts#L6)

FTS5 field descriptor.

## Properties

### isArray \{#isarray\}

```ts
readonly isArray: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/fts5/types.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/fts5/types.ts#L14)

Whether it is a `StringArrayProperty`:
- `true`  → the source table stores JSON array text; the trigger expands it with a `json_each + group_concat` subquery
- `false` → an ordinary `TEXT` column; the trigger reads `NEW.<field>` / `OLD.<field>` directly

***

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/fts5/types.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/fts5/types.ts#L8)

Field column name (also used as the FTS5 column name)
