# RXDB_CAPABILITY_WATERMARK_PREFIX

```ts
const RXDB_CAPABILITY_WATERMARK_PREFIX: '__rxdb_capability__:';
```

Defined in: [packages/rxdb/src/system/capability-watermark.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/capability-watermark.ts#L28)

Name prefix of the capability claim watermark row.

## Remarks

Does not overlap with `RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX` / `RXDB_CHANGE_CODEC_WATERMARK_PREFIX`, so `readWatermarkVersion()` never reads these rows and the set of executed names in `runMigrations()` never collides with them.
