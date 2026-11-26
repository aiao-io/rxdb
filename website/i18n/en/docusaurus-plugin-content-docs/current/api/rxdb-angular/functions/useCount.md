# useCount()

```ts
function useCount<T>(EntityType, options): RxDBResource<number>;
```

Defined in: [rxdb-angular/src/hooks.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L234)

Counts entities matching the condition

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity class |
| `options` | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"countOptions"`&gt;&gt; | Query parameters |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`number`&gt;

Resource signal containing the count
