---
sidebar_label: 'RuleGroup⟨T, K, RT⟩'
---

# RuleGroup`<T, K, RT>`

```ts
type RuleGroup<T, K, RT> = RuleGroupBase<T, K, RT>;
```

Defined in: packages/rxdb/dist/repository/query.interface.d.ts:88

Query rule group (auto-computed type)

## Type Parameters

| Type Parameter                                                     | Default type                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| <a id="type-parameter-t"></a> `T`                                  | [`EntityData`](../../rxdb/type-aliases/EntityData.md) |
| <a id="type-parameter-k"></a> `K` _extends_ `StringKey`&lt;`T`&gt; | `StringKey`&lt;`T`&gt;                                |
| <a id="type-parameter-rt"></a> `RT`                                | [`Rule`](Rule.md)&lt;`T`, `K`&gt;                     |
