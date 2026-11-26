# chunkByPgParamLimit()

```ts
function chunkByPgParamLimit<T>(rows, paramsPerRow): T[][];
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L200)

Slices bulk data into chunks according to the parameter count limit.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter      | Type     | Description                           |
| -------------- | -------- | ------------------------------------- |
| `rows`         | `T`[]    | Data rows                             |
| `paramsPerRow` | `number` | Number of parameters consumed per row |

## Returns

`T`[][]
