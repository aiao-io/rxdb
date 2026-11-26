# readFirst()

```ts
function readFirst<T>(query): Promise<T[]>;
```

Defined in: [packages/rxdb-plugin-board/src/query.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/query.ts#L33)

Reads the first snapshot of a query and returns an array copy (shared by facade live queries and executor repository queries).

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                                         |
| --------- | ------------------------------------------------------------ |
| `query`   | `Observable`&lt;readonly `T`[]&gt; \| `Promise`&lt;`T`[]&gt; |

## Returns

`Promise`&lt;`T`[]&gt;
