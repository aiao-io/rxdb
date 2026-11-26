# RXDB_SYSTEM_SCHEMA_WATERMARK

```ts
const RXDB_SYSTEM_SCHEMA_WATERMARK: "__rxdb_system_schema__:9";
```

Defined in: [packages/rxdb/src/system/migration.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L97)

Full name of the watermark row for the current system table structure; written by the adapter's `migrateSystemSchema()` when backfilling.

## Remarks

Assembled by template from the prefix and [RXDB\_SYSTEM\_SCHEMA\_VERSION](RXDB_SYSTEM_SCHEMA_VERSION.md), so bumping the version number carries it along automatically — which is also why "a constant stuck at an old value fails to compile nowhere"; see the notes on [RXDB\_SYSTEM\_SCHEMA\_VERSION](RXDB_SYSTEM_SCHEMA_VERSION.md).
