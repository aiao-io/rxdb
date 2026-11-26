# SearchOptions

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:7

Tunable parameters of a single search request; can override the [SearchPluginOptions](../../rxdb-plugin-search/interfaces/SearchPluginOptions.md) global defaults.

## Properties

### collections? \{#collections\}

```ts
collections?: readonly string[];
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:18

Limits the collections taking part in aggregation (accepts entity names or table names); defaults to aggregating all searchable collections outside the plugin-level exclusion rules. Throws when it contains unknown names or when the resolved scope is empty (fail-fast).

***

### debounce? \{#debounce\}

```ts
debounce?: number;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:9

Input debounce window (ms); default 300, pass `0` to disable debouncing

***

### initialQuery? \{#initialquery\}

```ts
initialQuery?: string;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:20

The initial query executed immediately when the subscription is first established

***

### pageSize? \{#pagesize\}

```ts
pageSize?: number;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:11

Number of results per page; default 50

***

### snippetLength? \{#snippetlength\}

```ts
snippetLength?: number;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:13

Hit snippet length (characters); default 120
