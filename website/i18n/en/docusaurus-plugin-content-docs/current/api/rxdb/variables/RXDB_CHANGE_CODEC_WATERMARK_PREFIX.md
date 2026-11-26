# RXDB_CHANGE_CODEC_WATERMARK_PREFIX

```ts
const RXDB_CHANGE_CODEC_WATERMARK_PREFIX: "__rxdb_change_codec__:";
```

Defined in: [packages/rxdb/src/system/migration.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L88)

Name prefix of the watermark row for the change codec version.

## Remarks

Same mechanism and the same "never change after release" constraint as [RXDB\_SYSTEM\_SCHEMA\_WATERMARK\_PREFIX](RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX.md), but the two numbers **must each occupy their own row**: the codec version governs how already-persisted payloads in `rxdb_change` are decoded, and has no migration ladder (an old client cannot read a new payload — it can only upgrade); the schema version governs the table structure, which can catch up when behind. Merging them into one row would leave [UnsupportedRxDBSystemVersionError](../classes/UnsupportedRxDBSystemVersionError.md) unable to answer "upgrade the client or run a migration".
