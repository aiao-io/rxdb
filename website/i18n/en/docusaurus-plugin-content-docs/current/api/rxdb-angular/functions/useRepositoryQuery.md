# useRepositoryQuery()

```ts
function useRepositoryQuery<T, TOptions, RT>(
   EntityType, 
   method, 
   defaultValue, 
   options
): RxDBResource<RT>;
```

Defined in: [rxdb-angular/src/hooks.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L45)

Converts an entity repository's Observable query into a lazy Angular Signal resource.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |
| <a id="type-parameter-toptions"></a> `TOptions` |
| <a id="type-parameter-rt"></a> `RT` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity type |
| `method` | `string` | Name of the repository's static query method |
| `defaultValue` | `RT` | Default value before the first subscription |
| `options` | [`UseOptions`](../type-aliases/UseOptions.md)&lt;`TOptions`&gt; | Query parameters or a reactive function returning query parameters |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`RT`&gt;

Signals for the query value, error and loading state
