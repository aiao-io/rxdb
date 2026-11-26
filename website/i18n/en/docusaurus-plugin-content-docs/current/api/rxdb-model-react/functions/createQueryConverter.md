# createQueryConverter()

```ts
function createQueryConverter<T>(options?): QueryConverter<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-converter.service.d.ts:75

Factory function that creates a QueryConverter instance

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`QueryConverterOptions`](../interfaces/QueryConverterOptions.md) | Conversion options |

## Returns

[`QueryConverter`](../classes/QueryConverter.md)&lt;`T`&gt;

A new QueryConverter instance
