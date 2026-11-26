# buildRuleGroup

```ts
const buildRuleGroup: <RG>(ruleGroup, fieldAliasMap?, entityMetadata?, adapter?, params?, scope?) => string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/query/query\_sql.d.ts:47

Builds the ruleGroup SQL query condition

## Type Parameters

| Type Parameter                                                                                          |
| ------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-__typerg"></a> `RG` _extends_ [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md) |

## Parameters

| Parameter         | Type                                                                                            | Description                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ruleGroup`       | `RG`                                                                                            | The rule group object                                                                                                                                        |
| `fieldAliasMap?`  | `Map`&lt;`string`, `string`&gt;                                                                 | Field alias map                                                                                                                                              |
| `entityMetadata?` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)                                   | Entity metadata (optional)                                                                                                                                   |
| `adapter?`        | [`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md)                               | SQLite adapter instance (optional, used for EXISTS queries)                                                                                                  |
| `params?`         | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] | Collector for bigint/binary query parameters                                                                                                                 |
| `scope?`          | [`RuleScope`](../../rxdb-adapter-sqlite-core/interfaces/RuleScope.md)                           | The query layer the rules live in; defaults to the top-level main table `_` (recursive members of tree queries and EXISTS subqueries pass their own aliases) |

## Returns

`string`

SQL condition string
