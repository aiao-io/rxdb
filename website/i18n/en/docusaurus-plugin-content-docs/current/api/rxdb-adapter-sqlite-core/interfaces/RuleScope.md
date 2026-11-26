# RuleScope

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/sql\_alias.utils.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/sql_alias.utils.ts#L25)

The query layer a rule is compiled in.

## Remarks

Bare fields, keyValue / array columns, and EXISTS correlation conditions in a rule all point to the main table of **this layer**: `_` for a top-level query, the alias assigned to this layer for an EXISTS subquery, and `children` for the recursive member of a tree query. Each additional level of nested EXISTS must be given an alias unused by outer layers, with inner correlation conditions referencing the previous layer's alias; when `_` and `child` were hard-coded, the second layer would correlate to the top-level entity, and a same-named `child` would shadow the previous layer.

## Extended by

- [`ExistsScope`](ExistsScope.md)

## Properties

### alias \{#alias\}

```ts
readonly alias: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/sql\_alias.utils.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/sql_alias.utils.ts#L27)

Alias of this layer's main table

***

### reservedAliases \{#reservedaliases\}

```ts
readonly reservedAliases: readonly string[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/sql\_alias.utils.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/sql_alias.utils.ts#L29)

Aliases already taken by this layer and all outer layers: new aliases for subqueries and JOIN planning inside subqueries must avoid them
