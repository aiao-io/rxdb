# build_rule()

```ts
function build_rule(rule, fieldAliasMap, entityMetadata?, adapter?, buildRuleGroupFn?, params?, scope?): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:636](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L636)

Generates the SQL query condition for a rule

## Parameters

| Parameter           | Type                                                                                  | Default value     | Description                                                                  |
| ------------------- | ------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `rule`              | `QueryRule`                                                                           | `undefined`       | Rule object                                                                  |
| `fieldAliasMap`     | `Map`&lt;`string`, `string`&gt;                                                       | `undefined`       | Field alias map                                                              |
| `entityMetadata?`   | `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; | `undefined`       | Entity metadata                                                              |
| `adapter?`          | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)                        | `undefined`       | SQLite adapter instance (optional, used for EXISTS queries)                  |
| `buildRuleGroupFn?` | [`BuildRuleGroupFn`](../type-aliases/BuildRuleGroupFn.md)                             | `undefined`       | buildRuleGroup function reference (optional, used for EXISTS subqueries)     |
| `params?`           | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[]                   | `undefined`       | Collector for bigint/binary query parameters                                 |
| `scope?`            | [`RuleScope`](../interfaces/RuleScope.md)                                             | `MAIN_RULE_SCOPE` | The query layer the rule sits in, defaulting to the top-level main table `_` |

## Returns

`string`

SQL condition string
