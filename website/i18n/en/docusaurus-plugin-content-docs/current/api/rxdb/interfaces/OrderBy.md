---
sidebar_label: "OrderBy⟨T⟩"
---

# OrderBy`<T>`

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L8)

Ordering

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* `string` | `string` |

## Properties

### field \{#field\}

```ts
field: T;
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L12)

The field to order by

***

### sort \{#sort\}

```ts
sort: "desc" | "asc";
```

Defined in: [packages/rxdb/src/repository/query-options.interface.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-options.interface.ts#L17)

Ordering direction
