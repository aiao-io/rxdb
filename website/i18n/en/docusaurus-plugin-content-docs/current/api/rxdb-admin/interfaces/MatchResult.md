# MatchResult

Defined in: [palette/fuzzy.ts:5](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/fuzzy.ts#L5)

The result of one match.

## Properties

### ranges \{#ranges\}

```ts
readonly ranges: readonly MatchRange[];
```

Defined in: [palette/fuzzy.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/fuzzy.ts#L9)

The match ranges, sorted and merged.

***

### score \{#score\}

```ts
readonly score: number;
```

Defined in: [palette/fuzzy.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/fuzzy.ts#L7)

The score; the higher, the more relevant.
