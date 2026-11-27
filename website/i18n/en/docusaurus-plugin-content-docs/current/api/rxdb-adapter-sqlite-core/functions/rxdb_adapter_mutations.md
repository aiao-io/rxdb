# rxdb_adapter_mutations()

```ts
function rxdb_adapter_mutations<T>(adapter, mutations): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/rxdb\_adapter\_mutations.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/rxdb_adapter_mutations.ts#L28)

## Type Parameters

| Type Parameter                                                                                    | Default type                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) | [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter   | Type                                                                       |
| ----------- | -------------------------------------------------------------------------- |
| `adapter`   | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)             |
| `mutations` | [`RxDBMutationsMap`](../../rxdb/interfaces/RxDBMutationsMap.md)&lt;`T`&gt; |

## Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;
