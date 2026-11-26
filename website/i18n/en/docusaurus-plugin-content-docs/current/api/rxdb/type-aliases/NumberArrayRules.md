---
sidebar_label: "NumberArrayRules⟨T, K, VT⟩"
---

# NumberArrayRules`<T, K, VT>`

```ts
type NumberArrayRules<T, K, VT> = RuleIn<T, K, VT>;
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:259](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L259)

Number array

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | - |
| <a id="type-parameter-k"></a> `K` *extends* `StringKey`&lt;`T`&gt; | `StringKey`&lt;`T`&gt; |
| <a id="type-parameter-vt"></a> `VT` | `T`\[`K`\] |
