---
sidebar_label: 'BigIntRules⟨T, K, VT⟩'
---

# BigIntRules`<T, K, VT>`

```ts
type BigIntRules<T, K, VT> =
  | RuleOperatorNullable<T, K>
  | RuleEqualNullable<T, K, VT>
  | RuleNumberNonNullable<T, K, VT>
  | RuleIn<T, K, VT>
  | RuleBetween<T, K, VT>;
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L222)

bigint

## Type Parameters

| Type Parameter                                                     | Default type           |
| ------------------------------------------------------------------ | ---------------------- |
| <a id="type-parameter-t"></a> `T`                                  | -                      |
| <a id="type-parameter-k"></a> `K` _extends_ `StringKey`&lt;`T`&gt; | `StringKey`&lt;`T`&gt; |
| <a id="type-parameter-vt"></a> `VT`                                | `T`\[`K`\]             |
