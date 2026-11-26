# transformEntityValueToSql()

```ts
function transformEntityValueToSql(
   metadata, 
   entity, 
   opts?
): Promise<Record<string, unknown>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:437](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L437)

Converts an entity value into a SQL-compatible format

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | - |
| `entity` | `object` | - |
| `opts?` | [`EncryptionContext`](../interfaces/EncryptionContext.md) & `object` | Optional encryption context; when it contains a keyring, columns with `property.encrypted === true` are encrypted automatically |

## Returns

`Promise`&lt;`Record`&lt;`string`, `unknown`&gt;&gt;
