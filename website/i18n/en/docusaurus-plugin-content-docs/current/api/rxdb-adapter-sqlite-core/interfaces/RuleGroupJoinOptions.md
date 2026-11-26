# RuleGroupJoinOptions

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:343](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L343)

JOIN planning options.

## Remarks

The defaults correspond to the main query; EXISTS subqueries and the recursive member of a recursive CTE rewrite the planning context through these three fields (SQLC-010).

## Properties

### baseAlias? \{#basealias\}

```ts
baseAlias?: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:347](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L347)

Query root table alias; defaults to the main table alias `_`

***

### fieldAliasMap? \{#fieldaliasmap\}

```ts
fieldAliasMap?: ReadonlyMap<string, string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:365](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L365)

Preset field alias mapping.

#### Remarks

Matching fields use the given SQL directly, skipping relation resolution. Subqueries use it to bind bare fields and foreign-key names to the subquery root table; tree recursive members use it to preserve the existing convention that `children.<field>` ≡ "the recursive member's own column".

***

### reservedAliases? \{#reservedaliases\}

```ts
reservedAliases?: readonly string[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:356](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L356)

Table aliases already taken and not reusable as relation aliases.

#### Remarks

In subqueries `child` / `junction`, and in recursive CTEs `children` / `c` / `__children`, are fixed aliases; if a relation name collides with one of them, `_generate_unique_alias` would generate a same-named alias that shadows the original table.
