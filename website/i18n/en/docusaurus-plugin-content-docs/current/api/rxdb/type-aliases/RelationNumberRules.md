---
sidebar_label: "RelationNumberRules⟨K, VT⟩"
---

# RelationNumberRules`<K, VT>`

```ts
type RelationNumberRules<K, VT> = 
  | RuleEqualNullable<K, VT>
  | RuleNumberNonNullable<K, VT>
  | RuleIn<K, VT>
  | RuleBetween<K, VT>;
```

Defined in: [packages/rxdb/src/repository/relation-query.interface.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/relation-query.interface.ts#L63)

Number

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-k"></a> `K` |
| <a id="type-parameter-vt"></a> `VT` |
