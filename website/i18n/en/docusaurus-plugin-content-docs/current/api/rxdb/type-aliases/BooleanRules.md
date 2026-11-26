---
sidebar_label: 'BooleanRules⟨T, K, VT⟩'
---

# BooleanRules`<T, K, VT>`

```ts
type BooleanRules<T, K, VT> = RuleOperatorNullable<T, K> | RuleEqualNullable<T, K, VT>;
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L238)

Boolean

## Type Parameters

| Type Parameter                                                     | Default type           |
| ------------------------------------------------------------------ | ---------------------- |
| <a id="type-parameter-t"></a> `T`                                  | -                      |
| <a id="type-parameter-k"></a> `K` _extends_ `StringKey`&lt;`T`&gt; | `StringKey`&lt;`T`&gt; |
| <a id="type-parameter-vt"></a> `VT`                                | `T`\[`K`\]             |
