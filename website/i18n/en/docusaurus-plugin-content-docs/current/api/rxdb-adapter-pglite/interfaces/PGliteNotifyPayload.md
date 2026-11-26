# PGliteNotifyPayload

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L23)

PGlite notification payload structure
Data parsed from a NOTIFY message

## Properties

### ids \{#ids\}

```ts
ids: (string | number)[];
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L29)

Array of affected row IDs

---

### operation \{#operation\}

```ts
operation: PGliteChangeType;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L25)

Operation type

---

### table \{#table\}

```ts
table: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L27)

Table name
