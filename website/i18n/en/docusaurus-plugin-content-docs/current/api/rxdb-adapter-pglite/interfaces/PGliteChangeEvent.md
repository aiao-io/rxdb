# PGliteChangeEvent

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L36)

PGlite change event
A database change event sent by a trigger via NOTIFY

## Properties

### dbName \{#dbname\}

```ts
dbName: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L40)

Database name

***

### recordAt \{#recordat\}

```ts
recordAt: Date;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L46)

Record time

***

### rowIds \{#rowids\}

```ts
rowIds: (string | number)[];
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L44)

List of affected row IDs

***

### tableName \{#tablename\}

```ts
tableName: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L42)

Table name

***

### type \{#type\}

```ts
type: PGliteChangeType;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.interface.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.interface.ts#L38)

Event type
