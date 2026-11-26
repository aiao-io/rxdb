---
sidebar_label: 'AdapterRepositoryConstructor⟨Adapter, RT⟩'
---

# AdapterRepositoryConstructor`<Adapter, RT>`

```ts
type AdapterRepositoryConstructor<Adapter, RT> = new (adapter, EntityType) => RT;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L132)

Constructor type of an adapter repository (registered via `RxDBAdapterBase.repository()`)

## Type Parameters

| Type Parameter                                                                                            | Default type                                                |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| <a id="type-parameter-adapter"></a> `Adapter` _extends_ `object`                                          | [`RxDBAdapterBase`](../classes/RxDBAdapterBase.md)          |
| <a id="type-parameter-rt"></a> `RT` _extends_ [`RepositoryInstance`](../interfaces/RepositoryInstance.md) | [`RepositoryInstance`](../interfaces/RepositoryInstance.md) |

## Parameters

| Parameter    | Type                          |
| ------------ | ----------------------------- |
| `adapter`    | `Adapter`                     |
| `EntityType` | [`EntityType`](EntityType.md) |

## Returns

`RT`

## Remarks

This and [RepositoryConstructor](../interfaces/RepositoryConstructor.md) are **two parallel axes**: the facade axis decides
which class `getRepository(E)` returns, and the adapter axis decides who executes SQL underneath that class. The
`Adapter` type parameter defaults to `RxDBAdapterBase`; adapter packages pass in their own class, so a custom
repository can directly use that adapter's private capabilities without downcasting.
