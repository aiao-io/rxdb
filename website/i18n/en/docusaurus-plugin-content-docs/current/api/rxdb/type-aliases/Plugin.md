---
sidebar_label: 'Plugin⟨Options⟩'
---

# Plugin`<Options>`

```ts
type Plugin<Options> = (rxDB, options?) => IRxDBPlugin;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L201)

RxDB plugin

## Type Parameters

| Type Parameter                                | Default type |
| --------------------------------------------- | ------------ |
| <a id="type-parameter-options"></a> `Options` | `never`      |

## Parameters

| Parameter  | Type                         |
| ---------- | ---------------------------- |
| `rxDB`     | [`RxDB`](../classes/RxDB.md) |
| `options?` | `Options`                    |

## Returns

[`IRxDBPlugin`](../interfaces/IRxDBPlugin.md)
