---
sidebar_label: "Ranked⟨T⟩"
---

# Ranked`<T>`

Defined in: [palette/fuzzy.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/fuzzy.ts#L121)

A sorted candidate.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`Rankable`](Rankable.md) |

## Properties

### item \{#item\}

```ts
readonly item: T;
```

Defined in: [palette/fuzzy.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/fuzzy.ts#L123)

The original candidate.

***

### labelRanges \{#labelranges\}

```ts
readonly labelRanges: readonly MatchRange[];
```

Defined in: [palette/fuzzy.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/fuzzy.ts#L127)

The match ranges of the primary text; empty only when the secondary text matched.

***

### score \{#score\}

```ts
readonly score: number;
```

Defined in: [palette/fuzzy.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/fuzzy.ts#L125)

The combined score.
