# JoinContext

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L32)

Shared context during JOIN planning: the alias table, relation aliases, and field alias mappings.

## Properties

### baseAlias \{#basealias\}

```ts
baseAlias: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L40)

Alias of the query root table.

#### Remarks

The main query uses the main table alias `_`, an EXISTS subquery uses `child`, and the recursive member of a recursive CTE uses `children`. The first hop of a relation path attaches to this alias; otherwise JOINs inside a subquery would reference the outer table (SQLC-010).

---

### fieldAliasMap \{#fieldaliasmap\}

```ts
fieldAliasMap: Map<string, string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L43)

---

### joinMap \{#joinmap\}

```ts
joinMap: Map<Readonly<EntityMetadataType>, JoinOptions[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L41)

---

### relationAliasMap \{#relationaliasmap\}

```ts
relationAliasMap: Map<string, string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L44)

---

### usedAliases \{#usedaliases\}

```ts
usedAliases: Set<string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/query/join\_sql.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/query/join_sql.ts#L42)
