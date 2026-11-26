# buildAAD()

```ts
function buildAAD(parts): Uint8Array;
```

Defined in: [packages/rxdb-adapter-encrypted/src/envelope.ts:190](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/envelope.ts#L190)

Deterministic v2 AAD constructor.

Each field uses a uint32 big-endian length prefix, and the primary key additionally carries a type tag. The database authentication domain, entity namespace,
table, column, record and kid all participate in authentication; no string content can move a tuple boundary.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `parts` | \{ `columnName`: `string`; `databaseNamespace`: `string`; `entityNamespace`: `string`; `kid`: `string`; `primaryKey`: [`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md); `tableName`: `string`; \} |
| `parts.columnName` | `string` |
| `parts.databaseNamespace` | `string` |
| `parts.entityNamespace` | `string` |
| `parts.kid` | `string` |
| `parts.primaryKey` | [`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md) |
| `parts.tableName` | `string` |

## Returns

`Uint8Array`