# build_rule_group_join()

```ts
function build_rule_group_join(adapter, entityMetadata, ruleGroup, orderBy?, options?): object;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:512](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L512)

Computes the JOIN string needed by a query

## Parameters

| Parameter        | Type                                                            | Description                                                                  |
| ---------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `adapter`        | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)  | Adapter                                                                      |
| `entityMetadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)   | Metadata of the entity to query                                              |
| `ruleGroup`      | [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md)             | Query conditions                                                             |
| `orderBy?`       | [`OrderBy`](../../rxdb/interfaces/OrderBy.md)&lt;`string`&gt;[] | Ordering conditions; dotted fields in them also participate in JOIN planning |
| `options?`       | [`RuleGroupJoinOptions`](../interfaces/RuleGroupJoinOptions.md) | Planning context rewrite for subquery / recursive member scenarios           |

## Returns

`object`

JOIN SQL, the field alias map, and the orderBy after foreign key normalization

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

where and orderBy must share the same JoinContext (SQLC-025): only then do the two sides referencing the same relation reuse the same table alias;
otherwise the same table gets LEFT JOINed twice and the row count doubles. After orderBy is passed in, take the normalized result from the returned `orderBy` field —
`_process_dotted_field` rewrites foreign key paths into local table column names in place (`owner.id` → `ownerId`);
this does a shallow copy before iterating, to avoid polluting the caller's orderBy array.
