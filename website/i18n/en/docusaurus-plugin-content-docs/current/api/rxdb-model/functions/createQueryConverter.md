# createQueryConverter()

```ts
function createQueryConverter<T>(options?): QueryConverter<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-converter.service.ts:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-converter.service.ts#L151)

Factory function that creates a QueryConverter instance.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`QueryConverterOptions`](../interfaces/QueryConverterOptions.md) | The conversion options |

## Returns

[`QueryConverter`](../classes/QueryConverter.md)&lt;`T`&gt;

A new QueryConverter instance
