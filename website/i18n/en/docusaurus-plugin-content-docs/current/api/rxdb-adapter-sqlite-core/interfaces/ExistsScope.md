# ExistsScope

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L76)

The aliases assigned to one level of an EXISTS subquery.

## Remarks

`alias` is the subquery root table alias (`child` under the top level, `child_2` one level deeper, and so on); `reservedAliases` already contains the aliases of all outer levels plus the two newly assigned for this level, and the subquery's where compiles against them (see [RuleScope](RuleScope.md)).

## Extends

- [`RuleScope`](RuleScope.md)

## Properties

### alias \{#alias\}

```ts
readonly alias: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/sql\_alias.utils.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/sql_alias.utils.ts#L27)

Alias of this layer's main table

#### Inherited from

[`RuleScope`](RuleScope.md).[`alias`](RuleScope.md#alias)

***

### junctionAlias \{#junctionalias\}

```ts
readonly junctionAlias: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L80)

Alias of the MANY_TO_MANY junction table

***

### outerAlias \{#outeralias\}

```ts
readonly outerAlias: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L78)

Alias of the outer entity (the "current entity" side in the correlation condition)

***

### reservedAliases \{#reservedaliases\}

```ts
readonly reservedAliases: readonly string[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/sql\_alias.utils.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/sql_alias.utils.ts#L29)

Aliases already taken by this layer and all outer layers: new aliases for subqueries and JOIN planning inside subqueries must avoid them

#### Inherited from

[`RuleScope`](RuleScope.md).[`reservedAliases`](RuleScope.md#reservedaliases)
