# BuildRuleGroupFn

```ts
type BuildRuleGroupFn = (rg, fam, em?, ad?, queryParams?, scope?) => string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:583](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L583)

The function shape of `buildRuleGroup`: called back when an EXISTS subquery recursively compiles a where

## Parameters

| Parameter      | Type                                                           |
| -------------- | -------------------------------------------------------------- |
| `rg`           | [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md)            |
| `fam`          | `Map`&lt;`string`, `string`&gt;                                |
| `em?`          | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)  |
| `ad?`          | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `queryParams?` | [`SQLiteCompatibleType`](SQLiteCompatibleType.md)[]            |
| `scope?`       | [`RuleScope`](../interfaces/RuleScope.md)                      |

## Returns

`string`
