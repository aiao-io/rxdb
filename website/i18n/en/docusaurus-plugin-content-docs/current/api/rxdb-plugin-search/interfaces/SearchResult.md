# SearchResult

Defined in: [packages/rxdb-plugin-search/src/types.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L60)

A single search hit.

## Properties

### collection \{#collection\}

```ts
collection: string;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L64)

collection table name

---

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L62)

The entity name of the hit record (e.g. `Article`, `Comment`)

---

### id \{#id\}

```ts
id: string;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L66)

Record primary key (stringified)

---

### matchedField \{#matchedfield\}

```ts
matchedField: string;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L70)

The name of the matched field

---

### rank \{#rank\}

```ts
rank: number;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L68)

BM25 rank; the smaller the value, the more relevant

---

### snippet \{#snippet\}

```ts
snippet: string;
```

Defined in: [packages/rxdb-plugin-search/src/types.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/types.ts#L72)

A readable excerpt cut from the original text (no HTML / Markdown markup)
