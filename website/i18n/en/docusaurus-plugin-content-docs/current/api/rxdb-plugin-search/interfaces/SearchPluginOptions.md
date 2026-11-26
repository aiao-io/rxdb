# SearchPluginOptions

Defined in: [packages/rxdb-plugin-search/src/types.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L29)

Initialization options of `rxDBPluginSearch(options)`.

## Properties

### debounce? \{#debounce\}

```ts
debounce?: number;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L31)

Global default debounce (ms); default 300, overridden by [SearchOptions.debounce](SearchOptions.md#debounce)

---

### excludedCollections? \{#excludedcollections\}

```ts
excludedCollections?: readonly string[];
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L37)

Collection names globally excluded once the plugin is enabled (do not participate in indexing/querying even if fields are marked searchable)

---

### pageSize? \{#pagesize\}

```ts
pageSize?: number;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L33)

Global default page size; default 50, overridden by [SearchOptions.pageSize](SearchOptions.md#pagesize)

---

### snippetLength? \{#snippetlength\}

```ts
snippetLength?: number;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L35)

Global default snippet length; default 120, overridden by [SearchOptions.snippetLength](SearchOptions.md#snippetlength)
