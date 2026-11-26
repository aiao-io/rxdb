---
sidebar_label: 'SqliteaiRepositoryConstructor⟨T⟩'
---

# SqliteaiRepositoryConstructor`<T>`

```ts
type SqliteaiRepositoryConstructor<T> = new (adapter, EntityType) => T;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L43)

The constructor signature of a custom Repository class (users can override the default Repository / TreeRepository).

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
