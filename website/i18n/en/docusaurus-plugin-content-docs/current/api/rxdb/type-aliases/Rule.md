---
sidebar_label: 'Rule⟨T, K, VT⟩'
---

# Rule`<T, K, VT>`

```ts
type Rule<T, K, VT> = DistributedRule<T, K, VT> | GenericRule<T, K, VT> | DynamicRuleForKey<K>;
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L116)

Query rule

## Type Parameters

| Type Parameter                                                     | Default type                  |
| ------------------------------------------------------------------ | ----------------------------- |
| <a id="type-parameter-t"></a> `T`                                  | [`EntityData`](EntityData.md) |
| <a id="type-parameter-k"></a> `K` _extends_ `StringKey`&lt;`T`&gt; | `StringKey`&lt;`T`&gt;        |
| <a id="type-parameter-vt"></a> `VT`                                | `RuleValueDefault`            |
