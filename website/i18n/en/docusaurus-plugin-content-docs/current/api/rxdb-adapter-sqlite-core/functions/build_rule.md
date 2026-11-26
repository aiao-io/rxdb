# build_rule()

```ts
function build_rule(rule, fieldAliasMap, entityMetadata?, adapter?, buildRuleGroupFn?, params?, scope?): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:636](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L636)

Generates the rule sql query condition

## Parameters

| Parameter           | Type                                                                                  | Default value     | Description                                                                |
| ------------------- | ------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------- |
| `rule`              | `QueryRule`                                                                           | `undefined`       | The rule object                                                            |
| `fieldAliasMap`     | `Map`&lt;`string`, `string`&gt;                                                       | `undefined`       | Field alias map                                                            |
| `entityMetadata?`   | `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt; | `undefined`       | Entity metadata                                                            |
| `adapter?`          | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)                        | `undefined`       | The SQLite adapter instance (optional, for EXISTS queries)                 |
| `buildRuleGroupFn?` | [`BuildRuleGroupFn`](../type-aliases/BuildRuleGroupFn.md)                             | `undefined`       | A buildRuleGroup function reference (optional, for EXISTS subqueries)      |
| `params?`           | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[]                   | `undefined`       | Collector for bigint/binary query parameters                               |
| `scope?`            | [`RuleScope`](../interfaces/RuleScope.md)                                             | `MAIN_RULE_SCOPE` | The query layer the rule lives in; default is the top-level main table `_` |

## Returns

`string`

The SQL condition string
