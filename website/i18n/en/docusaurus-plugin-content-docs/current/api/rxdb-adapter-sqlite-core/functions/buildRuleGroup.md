# buildRuleGroup()

```ts
function buildRuleGroup<RG>(ruleGroup, fieldAliasMap?, entityMetadata?, adapter?, params?, scope?): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.ts#L102)

Generates the SQL query condition for a ruleGroup

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-rg"></a> `RG` _extends_ [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md) |

## Parameters

| Parameter         | Type                                                                                  | Default value     | Description                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ruleGroup`       | `RG`                                                                                  | `undefined`       | Rule group object                                                                                                                                           |
| `fieldAliasMap?`  | `Map`&lt;`string`, `string`&gt;                                                       | `...`             | Field alias map                                                                                                                                             |
| `entityMetadata?` | `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; | `undefined`       | Entity metadata (optional)                                                                                                                                  |
| `adapter?`        | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)                        | `undefined`       | SQLite adapter instance (optional, used for EXISTS queries)                                                                                                 |
| `params?`         | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[]                   | `undefined`       | Collector for bigint/binary query parameters                                                                                                                |
| `scope?`          | [`RuleScope`](../interfaces/RuleScope.md)                                             | `MAIN_RULE_SCOPE` | The query layer the rule sits in, defaulting to the top-level main table `_` (tree query recursive members and EXISTS subqueries each pass their own alias) |

## Returns

`string`

SQL condition string
