# buildRuleGroup()

```ts
function buildRuleGroup<RG>(ruleGroup, fieldAliasMap?, entityMetadata?, adapter?, params?, scope?): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.ts#L102)

Generates the ruleGroup sql query condition

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-rg"></a> `RG` _extends_ [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md) |

## Parameters

| Parameter         | Type                                                                                  | Default value     | Description                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ruleGroup`       | `RG`                                                                                  | `undefined`       | The rule group object                                                                                                                                          |
| `fieldAliasMap?`  | `Map`&lt;`string`, `string`&gt;                                                       | `...`             | Field alias map                                                                                                                                                |
| `entityMetadata?` | `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; | `undefined`       | Entity metadata (optional)                                                                                                                                     |
| `adapter?`        | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)                        | `undefined`       | The SQLite adapter instance (optional, for EXISTS queries)                                                                                                     |
| `params?`         | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[]                   | `undefined`       | Collector for bigint/binary query parameters                                                                                                                   |
| `scope?`          | [`RuleScope`](../interfaces/RuleScope.md)                                             | `MAIN_RULE_SCOPE` | The query layer the rule lives in; default is the top-level main table `_` (recursive members of tree queries and EXISTS subqueries each pass their own alias) |

## Returns

`string`

The SQL condition string
