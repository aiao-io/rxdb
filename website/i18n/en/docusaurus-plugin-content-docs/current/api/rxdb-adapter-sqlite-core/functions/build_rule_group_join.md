# build_rule_group_join()

```ts
function build_rule_group_join(adapter, entityMetadata, ruleGroup, orderBy?, options?): object;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:512](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L512)

Computes the JOIN string needed by a query

## Parameters

| Parameter        | Type                                                            | Description                                                                |
| ---------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `adapter`        | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)  | The adapter                                                                |
| `entityMetadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)   | The metadata of the entity to query                                        |
| `ruleGroup`      | [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md)             | The query conditions                                                       |
| `orderBy?`       | [`OrderBy`](../../rxdb/interfaces/OrderBy.md)&lt;`string`&gt;[] | Ordering conditions; dotted fields in it also participate in JOIN planning |
| `options?`       | [`RuleGroupJoinOptions`](../interfaces/RuleGroupJoinOptions.md) | Planning context rewrites for subquery / recursive member scenarios        |

## Returns

`object`

The JOIN SQL, the field alias map, and the orderBy after foreign key normalization

### fieldAliasMap

```ts
fieldAliasMap: Map<string, string> = context.fieldAliasMap;
```

### joinSQL

```ts
joinSQL: string;
```

### orderBy

```ts
orderBy: object[] | undefined = normalizedOrderBy;
```

## Remarks

where and orderBy must share the same JoinContext (SQLC-025): only when both sides reference the same relation is the same table alias reused,
otherwise the same table is LEFT JOINed twice and the row count doubles. After passing orderBy in, take the normalized result from the returned `orderBy` field —
`_process_dotted_field` rewrites foreign key paths into own-table column names on the spot (`owner.id` → `ownerId`);
here it shallow-copies first and then iterates, to avoid polluting the caller's orderBy array.
