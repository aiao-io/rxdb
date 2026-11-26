# SwitchVersionSqlItem

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts#L84)

The SQL set of one kind of operation (delete/insert/update) in a version switch, along with its change records.

## Properties

### beforeInserts? \{#beforeinserts\}

```ts
beforeInserts?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts#L95)

Whether the update items run before all inserts (entities declared with range exclusion, US-030 AC#14). Statements are already ordered "narrowing first"; see the core's `orderExclusionUpdates`.

---

### changes \{#changes\}

```ts
changes: Map<RxDBEntityId, SwitchVersionChangeData>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts#L90)

---

### ids \{#ids\}

```ts
ids: Set<RxDBEntityId>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts#L86)

---

### metadata \{#metadata\}

```ts
metadata: EntityMetadata;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts#L85)

---

### selectStatements? \{#selectstatements\}

```ts
selectStatements?: SqliteStatement[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts#L88)

---

### statements \{#statements\}

```ts
statements: SqliteStatement[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts#L87)

---

### successResults? \{#successresults\}

```ts
successResults?: SqliteSuccessResult;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts#L89)
