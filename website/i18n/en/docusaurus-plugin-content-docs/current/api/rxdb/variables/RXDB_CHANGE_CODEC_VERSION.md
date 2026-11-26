# RXDB_CHANGE_CODEC_VERSION

```ts
const RXDB_CHANGE_CODEC_VERSION: 1;
```

Defined in: [packages/rxdb/src/system/change-codec.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L33)

Current version number of the encoding/decoding protocol.

Every externally serialized structure (`{codecVersion, schemaVersion, type, value}`) carries both versions; when either mismatches RXDB\_CHANGE\_CODEC\_VERSION it is always treated as incompatible and throws [UnsupportedRxDBChangeVersionError](../classes/UnsupportedRxDBChangeVersionError.md).
