---
sidebar_label: 'CountOptions⟨T, U⟩'
---

# CountOptions`<T, U>`

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:212](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L212)

Count query options

## Type Parameters

| Type Parameter                                                                            | Default type                                                                 |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md)                                |
| <a id="type-parameter-u"></a> `U`                                                         | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`InstanceType`&lt;`T`&gt;&gt; |

## Properties

### groupBy? \{#groupby\}

```ts
groupBy?: string[];
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:214](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L214)

---

### where \{#where\}

```ts
where: U;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L213)
