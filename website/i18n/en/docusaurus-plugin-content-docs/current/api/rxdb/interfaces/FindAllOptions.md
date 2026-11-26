---
sidebar_label: "FindAllOptions⟨T, U, W⟩"
---

# FindAllOptions`<T, U, W>`

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L175)

FindAll query options

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md) |
| <a id="type-parameter-u"></a> `U` | [`RuleGroup`](../type-aliases/RuleGroup.md)&lt;`InstanceType`&lt;`T`&gt;&gt; |
| <a id="type-parameter-w"></a> `W` *extends* `string` | `string` |

## Properties

### orderBy? \{#orderby\}

```ts
orderBy?: OrderBy<W>[];
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L206)

Ordering conditions

#### Example

```ts
orderBy: [
  \{ field: 'createdAt', sort: 'desc' \},
  \{ field: 'id', sort: 'asc' \} // must include an ordering by a unique value
]

***

### where \{#where\}

```ts
where: U;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:195](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L195)

Query conditions
Used to filter query results
Supports combined queries

#### Example

```ts
where: {
  combinator: 'and',
  rules: [
    { field: 'status', operator: '=', value: 'active' },
    `{ field: 'createdAt', operator: '>=', value: '2023-01-01' }`
  ]
}
```
