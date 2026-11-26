# SearchResult

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:56

A single search hit.

## Properties

### collection \{#collection\}

```ts
collection: string;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:60

The collection table name

***

### entity \{#entity\}

```ts
entity: string;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:58

The entity name the hit record belongs to (e.g. `Article`, `Comment`)

***

### id \{#id\}

```ts
id: string;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:62

The record's primary key (stringified)

***

### matchedField \{#matchedfield\}

```ts
matchedField: string;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:66

The name of the matched field

***

### rank \{#rank\}

```ts
rank: number;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:64

BM25 rank; smaller values are more relevant

***

### snippet \{#snippet\}

```ts
snippet: string;
```

Defined in: packages/rxdb-plugin-search/dist/types.d.ts:68

A readable excerpt cut from the source text (no HTML / Markdown markup)
