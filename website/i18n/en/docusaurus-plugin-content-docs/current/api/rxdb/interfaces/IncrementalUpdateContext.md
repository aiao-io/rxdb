---
sidebar_label: 'IncrementalUpdateContext⟨T⟩'
---

# IncrementalUpdateContext`<T>`

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L266)

The context of one incremental merge: full entity cache + match-state classification.

## Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

## Properties

### cache \{#cache\}

```ts
cache: UpdateDataCache<T>;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:268](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L268)

Lazy cache of complete entities before/after the update, for handlers to take the before/after states.

---

### classification \{#classification\}

```ts
classification: UpdateClassification;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L270)

Each entity's where-match state change before/after this batch of updates.
