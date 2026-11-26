---
sidebar_label: "BinaryRules⟨T, K, VT⟩"
---

# BinaryRules`<T, K, VT>`

```ts
type BinaryRules<T, K, VT> = 
  | RuleOperatorNullable<T, K>
  | RuleEqualNullable<T, K, VT>
  | RuleIn<T, K, VT>;
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L232)

binary

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | - |
| <a id="type-parameter-k"></a> `K` *extends* `StringKey`&lt;`T`&gt; | `StringKey`&lt;`T`&gt; |
| <a id="type-parameter-vt"></a> `VT` | `T`\[`K`\] |
