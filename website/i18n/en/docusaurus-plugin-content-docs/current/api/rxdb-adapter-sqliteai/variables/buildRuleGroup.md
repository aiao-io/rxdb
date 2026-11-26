# buildRuleGroup

```ts
const buildRuleGroup: <RG>(ruleGroup, fieldAliasMap?, entityMetadata?, adapter?, params?, scope?) => string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/query/query\_sql.d.ts:47

Generates the ruleGroup SQL query condition

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-__typerg"></a> `RG` *extends* [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ruleGroup` | `RG` | The rule group object |
| `fieldAliasMap?` | `Map`&lt;`string`, `string`&gt; | The field alias map |
| `entityMetadata?` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | The entity metadata (optional) |
| `adapter?` | [`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md) | The SQLite adapter instance (optional, used for EXISTS queries) |
| `params?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] | The collector for bigint/binary query parameters |
| `scope?` | [`RuleScope`](../../rxdb-adapter-sqlite-core/interfaces/RuleScope.md) | The query layer the rules belong to; defaults to the top-level main table `_` (the recursive member of a tree query and EXISTS subqueries each pass their own alias) |

## Returns

`string`

The SQL condition string
