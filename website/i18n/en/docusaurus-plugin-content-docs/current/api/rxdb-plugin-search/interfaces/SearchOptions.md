# SearchOptions

Defined in: [packages/rxdb-plugin-search/src/types.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L8)

Tunable parameters for a single search request; can override the [SearchPluginOptions](SearchPluginOptions.md) global defaults.

## Properties

### collections? \{#collections\}

```ts
collections?: readonly string[];
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L19)

Restricts the collections participating in aggregation (accepts entity names or table names); by default aggregates all searchable collections outside the plugin-level exclusion rules. Throws when it contains unknown names or the resolved scope is empty (fail-fast).

***

### debounce? \{#debounce\}

```ts
debounce?: number;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L10)

Input debounce window (ms); default 300, pass `0` to disable debouncing

***

### initialQuery? \{#initialquery\}

```ts
initialQuery?: string;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L21)

Initial query executed immediately when the subscription is first established

***

### pageSize? \{#pagesize\}

```ts
pageSize?: number;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L12)

Number of results returned per page; default 50

***

### snippetLength? \{#snippetlength\}

```ts
snippetLength?: number;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L14)

Hit snippet length (in characters); default 120
