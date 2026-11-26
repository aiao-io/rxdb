---
sidebar_label: 'WaSqliteMiniProgramRepositoryConstructor⟨T⟩'
---

# WaSqliteMiniProgramRepositoryConstructor`<T>`

```ts
type WaSqliteMiniProgramRepositoryConstructor<T> = new (adapter, EntityType) => T;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:199](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L199)

The replaceable repository constructor of the mini program adapter.

## Type Parameters

| Type Parameter                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`RepositoryBase`](../../rxdb/classes/RepositoryBase.md)&lt;`AnyEntityType`&gt; |

## Parameters

| Parameter    | Type                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------- |
| `adapter`    | [`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md) |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)                                       |

## Returns

`T`
