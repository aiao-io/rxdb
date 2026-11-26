# getEntityObjectFromResult()

```ts
function getEntityObjectFromResult(metadata, row, opts?): Promise<Record<string, unknown>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:602](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L602)

Gets entity object data from a PGlite result row
PGlite returns rows as objects; mainly used for type conversion

## Parameters

| Parameter  | Type                                                          | Description                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | -                                                                                                                                                                                                                                                |
| `row`      | `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt;         | -                                                                                                                                                                                                                                                |
| `opts?`    | [`EncryptionContext`](../interfaces/EncryptionContext.md)     | Optional encryption context; when it contains a keyring, envelope string columns are decrypted automatically. When decrypting any column fails, the whole row is rejected and the already-decrypted plaintext is wiped (partial-failure policy). |

## Returns

`Promise`&lt;`Record`&lt;`string`, `unknown`&gt;&gt;
