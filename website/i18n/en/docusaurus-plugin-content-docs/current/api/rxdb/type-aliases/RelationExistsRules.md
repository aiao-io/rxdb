---
sidebar_label: 'RelationExistsRules⟨K, SubRG⟩'
---

# RelationExistsRules`<K, SubRG>`

```ts
type RelationExistsRules<K, SubRG> = RuleExists<K, SubRG>;
```

Defined in: [packages/rxdb/src/repository/relation-query.interface.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/relation-query.interface.ts#L102)

Relation EXISTS rule
The `SubRG` type parameter should be the `RuleGroup` type of the related entity

## Type Parameters

| Type Parameter                                       |
| ---------------------------------------------------- |
| <a id="type-parameter-k"></a> `K` _extends_ `string` |
| <a id="type-parameter-subrg"></a> `SubRG`            |
