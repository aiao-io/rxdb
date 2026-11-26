---
sidebar_label: "SqliteRepositoryConstructor⟨T⟩"
---

# SqliteRepositoryConstructor`<T>`

```ts
type SqliteRepositoryConstructor<T> = new (adapter, EntityType) => T;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L71)

Constructor type of the SQLite repository.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`RepositoryBase`](../../rxdb/classes/RepositoryBase.md)&lt;`AnyEntityType`&gt; |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md) |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Returns

`T`
