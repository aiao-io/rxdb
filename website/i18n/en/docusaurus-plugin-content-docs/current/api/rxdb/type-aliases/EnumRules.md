---
sidebar_label: 'EnumRules⟨T, K, VT⟩'
---

# EnumRules`<T, K, VT>`

```ts
type EnumRules<T, K, VT> = RuleOperatorNullable<T, K> | RuleEqualNullable<T, K, VT> | RuleIn<T, K, VT>;
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L266)

Enum
Enum-type query rules
Supports: equal, not equal, null, not null, in, notIn

## Type Parameters

| Type Parameter                                                     | Default type           |
| ------------------------------------------------------------------ | ---------------------- |
| <a id="type-parameter-t"></a> `T`                                  | -                      |
| <a id="type-parameter-k"></a> `K` _extends_ `StringKey`&lt;`T`&gt; | `StringKey`&lt;`T`&gt; |
| <a id="type-parameter-vt"></a> `VT`                                | `T`\[`K`\]             |
