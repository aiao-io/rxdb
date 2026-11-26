---
sidebar_label: "RuleGroup⟨T, K, RT⟩"
---

# RuleGroup`<T, K, RT>`

```ts
type RuleGroup<T, K, RT> = RuleGroupBase<T, K, RT>;
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L131)

Query rule group (auto-computed type)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | [`EntityData`](EntityData.md) |
| <a id="type-parameter-k"></a> `K` *extends* `StringKey`&lt;`T`&gt; | `StringKey`&lt;`T`&gt; |
| <a id="type-parameter-rt"></a> `RT` | [`Rule`](Rule.md)&lt;`T`, `K`&gt; |
