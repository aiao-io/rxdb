# RXDB_CHANGE_ENTITY_ID_PREFIX

```ts
const RXDB_CHANGE_ENTITY_ID_PREFIX: "__rxdb_change_id__:";
```

Defined in: [packages/rxdb/src/system/change-codec.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L36)

Fixed prefix of an encoded entityId, making it easy to tell "whether it has already been encoded" during deserialization.
