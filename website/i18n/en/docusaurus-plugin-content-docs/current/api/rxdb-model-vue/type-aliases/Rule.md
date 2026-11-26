---
sidebar_label: "Rule⟨T, K, VT⟩"
---

# Rule`<T, K, VT>`

```ts
type Rule<T, K, VT> = 
  | DistributedRule<T, K, VT>
  | GenericRule<T, K, VT>
  | DynamicRuleForKey<K>;
```

Defined in: packages/rxdb/dist/repository/query.interface.d.ts:76

Query rule

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | [`EntityData`](../../rxdb/type-aliases/EntityData.md) |
| <a id="type-parameter-k"></a> `K` *extends* `StringKey`&lt;`T`&gt; | `StringKey`&lt;`T`&gt; |
| <a id="type-parameter-vt"></a> `VT` | `RuleValueDefault` |
