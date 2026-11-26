# RXDB_CHANGE_CODEC_WATERMARK

```ts
const RXDB_CHANGE_CODEC_WATERMARK: "__rxdb_change_codec__:1";
```

Defined in: [packages/rxdb/src/system/migration.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L106)

Full name of the watermark row for the current change codec.

## Remarks

The version number comes from `RXDB_CHANGE_CODEC_VERSION` in `change-codec.ts`, and evolves independently of the schema version in this file.
