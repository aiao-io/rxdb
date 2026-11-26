# ExistsSubquery

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L57)

The where compilation result of an EXISTS subquery.

## Remarks

Relation paths in `where` (e.g. `items.productName`) need additional JOINs attached inside the subquery, and JOINs can only be placed after FROM — so the condition and the JOIN must be returned separately (SQLC-010).

## Properties

### join \{#join\}

```ts
join: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L66)

The JOIN clause produced by relation paths inside the subquery (with its own leading space); the empty string when there are no relation paths

---

### where \{#where\}

```ts
where: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/query\_sql.utils.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L61)

The WHERE condition of the subquery
