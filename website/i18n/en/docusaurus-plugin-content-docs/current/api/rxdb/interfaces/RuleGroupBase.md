---
sidebar_label: "RuleGroupBase⟨T, K, RT⟩"
---

# RuleGroupBase`<T, K, RT>`

Defined in: [packages/rxdb/src/repository/query.interface.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L123)

Query rule group (base).
Used for generated type files; more complex types can be composed from it.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |
| <a id="type-parameter-k"></a> `K` |
| <a id="type-parameter-rt"></a> `RT` |

## Properties

### combinator \{#combinator\}

```ts
combinator: "and" | "or";
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L124)

***

### rules \{#rules\}

```ts
rules: (RuleGroupBase<T, K, RT> | RT)[];
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L125)
