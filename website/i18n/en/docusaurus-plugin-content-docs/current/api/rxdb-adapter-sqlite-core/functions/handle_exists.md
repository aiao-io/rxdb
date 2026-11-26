# handle_exists()

```ts
function handle_exists(
   rule, 
   entityMetadata, 
   adapter, 
   buildWhere?, 
   scope?
): string | null;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:912](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L912)

Handles the EXISTS/NOT EXISTS operators

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `rule` | `QueryRule` | `undefined` | Rule object |
| `entityMetadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | `undefined` | Outer entity metadata |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) | `undefined` | SQLite adapter instance |
| `buildWhere?` | (`ruleGroup`, `relationMetadata`, `existsScope`) => [`ExistsSubquery`](../interfaces/ExistsSubquery.md) | `undefined` | Subquery where compiler, returning the condition and the JOINs needed inside the subquery (SQLC-010); the third parameter is the alias assigned to this layer of the subquery, and fields in the where must hang on `existsScope.alias` |
| `scope?` | [`RuleScope`](../interfaces/RuleScope.md) | `MAIN_RULE_SCOPE` | The query layer this rule sits in, defaulting to the top-level main table `_`; the "current entity" side of relation conditions uses its alias |

## Returns

`string` \| `null`

EXISTS condition SQL; returns null when the rule is not exists/notExists or the field is not a relation
