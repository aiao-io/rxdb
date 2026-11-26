---
sidebar_label: "FindOneOrFailOptions⟨T, U, W⟩"
---

# FindOneOrFailOptions`<T, U, W>`

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L35)

FindOneOrFail query options

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

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L41)

***

### where \{#where\}

```ts
where: U;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L40)
