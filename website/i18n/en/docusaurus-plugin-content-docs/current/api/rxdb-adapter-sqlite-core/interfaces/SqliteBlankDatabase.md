# SqliteBlankDatabase

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L86)

The result of [SqliteClientLike.describeBlankDatabase](SqliteClientLike.md#describeblankdatabase).

## Properties

### description \{#description\}

```ts
readonly description: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L92)

Description of all rows; the empty string when there are no objects. Identical structure and identical row descriptions mean identical content.

***

### objects \{#objects\}

```ts
readonly objects: readonly string[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L88)

`type:name` of user objects (excluding internal objects starting with `sqlite_`), in lexicographic order.

***

### shape \{#shape\}

```ts
readonly shape: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L90)

Description of the structure and each table's row count; the empty string when there are no objects. Restore compares this first and only reads the target's rows when it matches.
