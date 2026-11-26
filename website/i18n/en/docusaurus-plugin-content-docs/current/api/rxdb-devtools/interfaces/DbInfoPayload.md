# DbInfoPayload

Defined in: [types.ts:220](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L220)

The database info response payload.

## Remarks

`null` means the connector has not obtained the entity metadata yet (`getEntityMetadata` was not passed at `init` time), which is a different thing from "the database is empty" — do not merge the two cases.

## Properties

### capabilities \{#capabilities\}

```ts
capabilities: DevToolsCapability;
```

Defined in: [types.ts:226](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L226)

The capability tier this page grants to DevTools; the panel disables out-of-scope buttons accordingly.

***

### dbName \{#dbname\}

```ts
dbName: string;
```

Defined in: [types.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L224)

The name of the observed database.

***

### entities \{#entities\}

```ts
entities: DbInfoEntity[];
```

Defined in: [types.ts:228](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L228)

The list of entities that are registered and have usable metadata.

***

### version \{#version\}

```ts
version: string;
```

Defined in: [types.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L222)

The version number of the observed RxDB instance.
