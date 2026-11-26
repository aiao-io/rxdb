---
sidebar_label: 'SqliteOfficialRepositoryConstructor⟨T⟩'
---

# SqliteOfficialRepositoryConstructor`<T>`

```ts
type SqliteOfficialRepositoryConstructor<T> = new (adapter, EntityType) => T;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L45)

Constructor signature for custom Repository classes.

## Type Parameters

| Type Parameter                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`RepositoryBase`](../../rxdb/classes/RepositoryBase.md)&lt;`AnyEntityType`&gt; |

## Parameters

| Parameter    | Type                                                              |
| ------------ | ----------------------------------------------------------------- |
| `adapter`    | [`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md) |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md)             |

## Returns

`T`
