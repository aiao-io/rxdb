# DevToolsSnapshotCursor

Defined in: [provider/snapshot.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L48)

Pagination cursor; it carries the last two of the three binding conditions (session, snapshot, page boundary).

## Properties

### offset \{#offset\}

```ts
readonly offset: number;
```

Defined in: [provider/snapshot.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L52)

Starting index of the page; must fall on a materialized page boundary.

***

### snapshotId \{#snapshotid\}

```ts
readonly snapshotId: string;
```

Defined in: [provider/snapshot.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L50)

The identity of the target snapshot.
