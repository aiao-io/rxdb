# RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX

```ts
const RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX: "__rxdb_system_schema__:";
```

Defined in: [packages/rxdb/src/system/migration.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L77)

Name prefix of the watermark row for the system table structure version.

## Remarks

The watermark does not get its own table; it **borrows one row of `rxdb_migration`**: the name looks like `__rxdb_system_schema__:6`, with the version number encoded after the prefix. This way "read the version" and "record the version" naturally reuse the existing unique index and transaction semantics of the migration table — the version bump and the DDL batch that produces it land in the same transaction, so there is no intermediate state where "the DDL succeeded but the version was not recorded".

The cost is that this prefix sits inside the user migration namespace: the double underscores exist to avoid colliding with user migration names. [getRxDBSystemVersionState](../functions/getRxDBSystemVersionState.md) recognizes it via `startsWith`, so **the prefix must never change once released** — changing it would make the watermark rows of existing databases disappear en masse, and [isCurrentRxDBSystemVersion](../functions/isCurrentRxDBSystemVersion.md) would judge an already-up-to-date database as needing a migration, then hit the unique index while backfilling.
