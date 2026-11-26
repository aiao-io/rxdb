# SearchOptions

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:7

Adjustable parameters for a single search request; can override the [SearchPluginOptions](../../rxdb-plugin-search/interfaces/SearchPluginOptions.md) global defaults.

## Properties

### collections? \{#collections\}

```ts
collections?: readonly string[];
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:18

Restricts the collections participating in the aggregation (accepts entity names or table names); by default aggregates all
searchable collections outside the plugin-level exclusion rules. Throws when an unknown name is included or the resolved scope is empty (fail-fast).

***

### debounce? \{#debounce\}

```ts
debounce?: number;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:9

The input debounce window (ms); default 300, pass `0` to disable debounce

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

The number of results per page; default 50

***

### snippetLength? \{#snippetlength\}

```ts
snippetLength?: number;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:13

The hit snippet length (in characters); default 120
