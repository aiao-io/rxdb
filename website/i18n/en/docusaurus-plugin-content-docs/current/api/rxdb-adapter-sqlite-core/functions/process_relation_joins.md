# process_relation_joins()

```ts
function process_relation_joins(
   adapter, 
   context, 
   relations, 
   joinTableName
): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L158)

Processes JOINs for relation fields.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `context` | [`JoinContext`](../interfaces/JoinContext.md) |
| `relations` | [`RelationPair`](../interfaces/RelationPair.md)[] |
| `joinTableName` | `string` |

## Returns

`void`
