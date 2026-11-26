# PGliteEngineInfo

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts#L31)

Engine version and data format compatibility keys.

## Properties

### compatibility \{#compatibility\}

```ts
readonly compatibility: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts#L35)

`postgres-<major>`: PostgreSQL only guarantees data directory interchangeability within the same major version.

***

### version \{#version\}

```ts
readonly version: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts#L33)

Raw text of `SHOW server_version`.
